"""M5: the agent loop, its tools and guards, the approval flow, and the streaming endpoint.

All offline: a scripted fake model decides which tools to call.
"""

import json

import pytest
from sqlalchemy import func, select

from app import create_app
from app.agent import guards, loop
from app.agent.llm import Reply, ToolCall
from app.agent.tools import TOOLS, Context, execute
from app.config import TestConfig
from app.errors import BadRequest
from app.models import Lot
from app.rag.chunk import chunk_directory
from app.rag.search import store
from scripts.generate_data import CULPRIT, generate
from scripts.ingest_docs import DOC_DIRS


class ScriptedLLM:
    """Returns the given replies in order and records what it was shown."""

    name = "scripted/test"

    def __init__(self, replies: list[Reply]):
        self.replies = list(replies)
        self.seen: list[list[dict]] = []
        self.tools_offered: list[str] = []

    def complete(self, system, messages, tools):
        self.seen.append([dict(m) for m in messages])
        self.tools_offered = [t.name for t in tools]
        return self.replies.pop(0)


class LoopingLLM:
    """Never stops calling tools, to test the step limit."""

    name = "looping/test"

    def complete(self, system, messages, tools):
        return Reply(None, [ToolCall(f"c{len(messages)}", "check_lot_yields", {})])


def call(name: str, i: int = 0, **args) -> ToolCall:
    return ToolCall(f"call_{name}_{i}", name, args)


@pytest.fixture(scope="module")
def agent_app():
    """Its own fab (tickets get written here), with the manuals indexed offline."""
    app = create_app(TestConfig)
    generate(app.extensions["db_engine"], seed=42)
    with app.extensions["db_session"]() as s:
        store(s, chunk_directory(*DOC_DIRS), app.extensions["embedder"])
    return app


@pytest.fixture
def ctx(agent_app):
    with agent_app.extensions["db_session"]() as s:
        yield Context(s, agent_app.extensions["embedder"])


DEMO_SCRIPT = [
    Reply(None, [call("check_lot_yields")]),
    Reply(None, [call("find_commonality", step="ETCH-GATE")]),
    Reply(
        None,
        [
            call("spc_chart", chamber_id=CULPRIT),
            call("compare_around_pm", chamber_id=CULPRIT),
        ],
    ),
    Reply(None, [call("search_docs", query="edge ring reflected power after PM")]),
    Reply(
        None,
        [
            call(
                "draft_work_order",
                chamber_id=CULPRIT,
                title="ETCH-03-B: reflected RF power high since PM, edge ring yield loss",
                body="Reflected power rose after the 26 Oct PM; commonality and SPC agree. "
                "Re-seat and recalibrate match capacitors per [SOP-ETCH-001#5].",
            )
        ],
    ),
    Reply("ETCH-03-B is the cause. A work order is drafted for an engineer to approve."),
]


# --- Tools -----------------------------------------------------------------------------


def test_tool_schemas():
    assert len(TOOLS) == 10
    for tool in TOOLS.values():
        spec = tool.spec()
        assert spec.parameters["type"] == "object"
        assert spec.description
        json.dumps(spec.parameters)  # serialisable for any provider


def test_invalid_arguments_come_back_as_a_readable_error(ctx):
    out = execute(ctx, "spc_chart", {"chamber_id": CULPRIT, "param": "voltage"})
    assert not out.ok
    assert "param" in out.result["problems"][0]
    out = execute(ctx, "get_lot", {})
    assert not out.ok and "lot_id" in out.for_model


def test_unknown_tool_and_unknown_ids(ctx):
    assert not execute(ctx, "format_disk", {}).ok
    out = execute(ctx, "get_lot", {"lot_id": "NOPE"})
    assert not out.ok and "not found" in out.result["error"]


def test_large_results_are_truncated_for_the_model(ctx):
    out = execute(ctx, "run_sql", {"sql": "SELECT * FROM wafer_steps"})
    assert out.ok and out.result["truncated"] and len(out.result["rows"]) == 200
    assert out.for_model.endswith('"[truncated]"')


# --- Read-only SQL guard ---------------------------------------------------------------


@pytest.mark.parametrize(
    "sql",
    [
        "DELETE FROM lots",
        "delete from lots where 1=1",
        "SELECT 1; DELETE FROM lots",
        "DROP TABLE lots",
        "PRAGMA query_only = OFF",
        "UPDATE lots SET status = 'HOLD'",
        "WITH x AS (SELECT 1) DELETE FROM lots",
        "ATTACH DATABASE 'x.db' AS x",
        "",
    ],
)
def test_run_sql_refuses_anything_but_select(ctx, sql):
    with pytest.raises(BadRequest):
        guards.run_readonly(ctx.session, sql)
    assert ctx.session.execute(select(func.count()).select_from(Lot)).scalar_one() == 40


def test_run_sql_refusal_reaches_the_model_as_text(ctx):
    out = execute(ctx, "run_sql", {"sql": "DELETE FROM lots"})
    assert not out.ok and "SELECT" in out.result["error"]


def test_run_sql_select_works_and_connection_stays_usable(ctx):
    r = guards.run_readonly(ctx.session, "SELECT id, status FROM lots ORDER BY id LIMIT 3")
    assert r["columns"] == ["id", "status"] and len(r["rows"]) == 3
    # The read-only switch is turned off again for normal app writes.
    out = execute(
        ctx,
        "draft_work_order",
        {"chamber_id": "ETCH-04-A", "title": "Test ticket", "body": "x" * 25},
    )
    assert out.ok


# --- The loop --------------------------------------------------------------------------


def test_full_investigation(agent_app, ctx):
    llm = ScriptedLLM(DEMO_SCRIPT)
    events = list(loop.run(llm, ctx, "Why did yield drop on recent lots?"))

    calls = [e["name"] for e in events if e["type"] == "tool_call"]
    assert calls == [
        "check_lot_yields",
        "find_commonality",
        "spc_chart",
        "compare_around_pm",
        "search_docs",
        "draft_work_order",
    ]
    results = [e for e in events if e["type"] == "tool_result"]
    assert all(r["ok"] for r in results)
    assert results[1]["result"]["ranking"][0]["chamber_id"] == CULPRIT
    assert events[-1] == {
        "type": "message",
        "content": "ETCH-03-B is the cause. A work order is drafted for an engineer to approve.",
    }

    # The model saw every tool result before answering.
    last_view = llm.seen[-1]
    assert sum(m["role"] == "tool" for m in last_view) == 6
    assert "draft_work_order" in llm.tools_offered

    # The ticket is a draft, and the audit log recorded every step in order.
    ticket = results[-1]["result"]
    assert ticket["status"] == "DRAFT" and ticket["chamber_id"] == CULPRIT
    r = agent_app.test_client().get("/api/audit?limit=20")
    actions = [a["action"] for a in reversed(r.get_json()["items"])]
    tail = actions[actions.index("chat") :]
    assert tail == [
        "chat",
        "tool:check_lot_yields",
        "tool:find_commonality",
        "tool:spc_chart",
        "tool:compare_around_pm",
        "tool:search_docs",
        "draft_work_order",
        "tool:draft_work_order",
    ]


def test_step_limit(ctx):
    events = list(loop.run(LoopingLLM(), ctx, "loop forever", max_steps=3))
    assert sum(e["type"] == "tool_call" for e in events) == 3
    assert events[-1]["type"] == "stopped"


# --- Approval: only a human click ------------------------------------------------------


def draft(client_app) -> int:
    with client_app.extensions["db_session"]() as s:
        ctx = Context(s, client_app.extensions["embedder"])
        out = execute(
            ctx,
            "draft_work_order",
            {"chamber_id": CULPRIT, "title": "Check RF match", "body": "Evidence " * 5},
        )
    return out.result["id"]


def test_approve_once_then_409(agent_app):
    client = agent_app.test_client()
    ticket_id = draft(agent_app)
    r = client.post(f"/api/tickets/{ticket_id}/approve", json={"by": "J. Kim"})
    assert r.status_code == 200
    assert r.get_json()["status"] == "APPROVED" and r.get_json()["decided_by"] == "J. Kim"
    assert (
        client.post(f"/api/tickets/{ticket_id}/approve", json={"by": "J. Kim"}).status_code == 409
    )
    assert client.post(f"/api/tickets/{ticket_id}/reject", json={"by": "J. Kim"}).status_code == 409
    audit = client.get("/api/audit?limit=5").get_json()["items"]
    assert audit[0]["actor"] == "J. Kim" and audit[0]["action"] == "approved_work_order"


def test_reject_and_input_errors(agent_app):
    client = agent_app.test_client()
    ticket_id = draft(agent_app)
    assert client.post(f"/api/tickets/{ticket_id}/approve", json={}).status_code == 400
    r = client.post(f"/api/tickets/{ticket_id}/reject", json={"by": "A. Rao"})
    assert r.get_json()["status"] == "REJECTED"
    assert client.post("/api/tickets/99999/approve", json={"by": "x"}).status_code == 404
    assert any(t["id"] == ticket_id for t in client.get("/api/tickets").get_json()["items"])


def test_agent_has_no_approve_tool():
    assert not any("approve" in name or "reject" in name for name in TOOLS)


# --- Streaming endpoint ----------------------------------------------------------------


def parse_sse(body: str) -> list[dict]:
    return [
        json.loads(line[len("data: ") :]) for line in body.splitlines() if line.startswith("data: ")
    ]


def test_chat_streams_every_step(agent_app):
    agent_app.extensions["llm"] = ScriptedLLM(DEMO_SCRIPT)
    try:
        r = agent_app.test_client().post("/api/chat", json={"message": "Why did yield drop?"})
        assert r.status_code == 200
        assert r.mimetype == "text/event-stream"
        events = parse_sse(r.get_data(as_text=True))
    finally:
        agent_app.extensions["llm"] = None
    types = [e["type"] for e in events]
    assert types.count("tool_call") == 6 and types.count("tool_result") == 6
    assert types[-2:] == ["message", "done"]


def test_chat_model_error_ends_the_stream_cleanly(agent_app):
    class Broken:
        name = "broken"

        def complete(self, *a):
            raise RuntimeError("provider down")

    agent_app.extensions["llm"] = Broken()
    try:
        r = agent_app.test_client().post("/api/chat", json={"message": "hi"})
        events = parse_sse(r.get_data(as_text=True))
    finally:
        agent_app.extensions["llm"] = None
    assert [e["type"] for e in events] == ["error", "done"]
    assert "provider down" in events[0]["message"]


def test_chat_without_a_model_is_503(agent_app):
    r = agent_app.test_client().post("/api/chat", json={"message": "hi"})
    assert r.status_code == 503 and r.get_json()["error"]["code"] == "no_model"


def test_chat_empty_message_is_400(agent_app):
    agent_app.extensions["llm"] = ScriptedLLM([])
    try:
        r = agent_app.test_client().post("/api/chat", json={"message": "  "})
    finally:
        agent_app.extensions["llm"] = None
    assert r.status_code == 400


# --- Demo model and status -------------------------------------------------------------


def test_demo_model_runs_the_reference_investigation(ctx):
    from app.agent.demo import DemoLLM

    events = list(loop.run(DemoLLM(step_delay=0), ctx, "Why did yield drop?"))
    calls = [e["name"] for e in events if e["type"] == "tool_call"]
    assert calls == [
        "check_lot_yields",
        "find_commonality",
        "get_lot",
        "classify_wafer_map",
        "spc_chart",
        "compare_around_pm",
        "get_chamber_events",
        "search_docs",
        "draft_work_order",
    ]
    assert all(e["ok"] for e in events if e["type"] == "tool_result")
    answer = events[-1]
    assert answer["type"] == "message"
    assert answer["content"].startswith(f"{CULPRIT} is the common cause.")
    assert "edge ring" in answer["content"] and "[SOP-ETCH-001#" in answer["content"]


def test_status(agent_app):
    body = agent_app.test_client().get("/api/status").get_json()
    assert body["lots"] == 40 and body["flagged_lots"] == 4
    assert body["model"] is None and body["embedder"].startswith("hashing")


def test_missing_key_falls_back_to_demo_instead_of_crashing():
    from app.agent.demo import DemoLLM
    from app.agent.llm import make_llm

    base = {"OPENAI_CHAT_MODEL": "m", "GEMINI_CHAT_MODEL": "m", "DEMO_STEP_DELAY": 0}
    assert isinstance(make_llm("gemini", {**base, "GEMINI_API_KEY": "  "}), DemoLLM)
    assert isinstance(make_llm("openai", {**base, "OPENAI_API_KEY": ""}), DemoLLM)
    assert isinstance(make_llm("auto", base), DemoLLM)
    assert make_llm("none", base) is None
    # And the app itself starts with an empty key.
    app = create_app(type("Cfg", (TestConfig,), {"LLM_PROVIDER": "gemini", "GEMINI_API_KEY": ""}))
    assert app.test_client().get("/api/status").get_json()["model"] == "demo/scripted"
