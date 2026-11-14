"""Demo model: a stand-in for a real LLM so the app can be shown without an API key.

It follows the reference investigation (yields -> commonality -> lot -> wafer map + SPC ->
before/after PM + chamber history -> manuals -> work order), choosing each next argument from
the previous tool results, and writes its answer only from numbers those tools returned.
Real tools, real data; only the decisions are scripted.
"""

import json
import time

from .llm import Reply, ToolCall


def _results(messages: list[dict]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for m in messages:
        if m["role"] == "tool":
            try:
                out[m["name"]] = json.loads(m["content"])
            except json.JSONDecodeError:
                out[m["name"]] = {}
    return out


class DemoLLM:
    name = "demo/scripted"

    def __init__(self, step_delay: float = 0.6):
        self.step_delay = step_delay

    def complete(self, system, messages, tools) -> Reply:
        if self.step_delay:
            time.sleep(self.step_delay)
        r = _results(messages[messages_start(messages) :])
        turn = sum(1 for m in messages[messages_start(messages) :] if m["role"] == "assistant")

        def calls(*items):
            return Reply(
                None, [ToolCall(f"demo_{turn}_{i}", n, a) for i, (n, a) in enumerate(items)]
            )

        top = (r.get("find_commonality", {}).get("ranking") or [{}])[0]
        chamber = top.get("chamber_id")
        if turn == 0:
            return calls(("check_lot_yields", {}))
        if turn == 1:
            flagged = r.get("check_lot_yields", {}).get("flagged") or []
            if not flagged:
                return Reply("No lot is more than 3 sigma below the baseline. Nothing to chase.")
            return calls(("find_commonality", {}), ("get_lot", {"lot_id": flagged[0]["id"]}))
        if turn == 2:
            wafers = r.get("get_lot", {}).get("wafers") or []
            return calls(
                ("classify_wafer_map", {"wafer_id": wafers[0]["id"]}),
                ("spc_chart", {"chamber_id": chamber}),
            )
        if turn == 3:
            return calls(
                ("compare_around_pm", {"chamber_id": chamber}),
                ("get_chamber_events", {"chamber_id": chamber}),
            )
        if turn == 4:
            pattern = r.get("classify_wafer_map", {}).get("label", "").replace("_", " ")
            return calls(("search_docs", {"query": f"{pattern} reflected power after PM"}))
        if turn == 5:
            return calls(
                (
                    "draft_work_order",
                    {
                        "chamber_id": chamber,
                        "title": f"{chamber}: yield loss after PM, check RF match",
                        "body": _evidence(r, chamber) + "\n\nRequested action: hold "
                        f"{chamber} for production, re-seat and recalibrate the match "
                        "capacitors, requalify." + _cites(r),
                    },
                )
            )
        return Reply(_answer(r, chamber))


PARAM_NAMES = {
    "rf_reflected_w": "Reflected RF power (W)",
    "rf_forward_w": "Forward RF power (W)",
    "pressure_mtorr": "Chamber pressure (mTorr)",
    "esc_temp_c": "ESC temperature (C)",
}


def messages_start(messages: list[dict]) -> int:
    """Index of the latest user message: the demo only looks at the current question."""
    for i in range(len(messages) - 1, -1, -1):
        if messages[i]["role"] == "user":
            return i
    return 0


def _cites(r: dict) -> str:
    """The best SOP hit, and the best past log on the same chamber."""
    hits = r.get("search_docs", {}).get("hits") or []
    chamber = (r.get("find_commonality", {}).get("ranking") or [{}])[0].get("chamber_id", "")
    sop = next((h for h in hits if h["doc_id"].startswith("SOP-")), None)
    log = next((h for h in hits if h["doc_id"].startswith("MLOG-") and chamber in h["text"]), None)
    picked = [h for h in (sop, log) if h]
    return (" " + " ".join(f"[{h['chunk_id']}]" for h in picked)) if picked else ""


def _evidence(r: dict, chamber: str) -> str:
    top = r["find_commonality"]["ranking"][0]
    pm = r.get("compare_around_pm", {})
    spc = r.get("spc_chart", {})
    wm = r.get("classify_wafer_map", {})
    lines = [
        f"- Commonality at {top['step']}: {top['bad_in_chamber']} of "
        f"{r['find_commonality']['bad_wafers']} bad wafers ran in {chamber} "
        f"({100 * top['bad_rate_in']:.1f}% bad, against {100 * top['bad_rate_out']:.1f}% "
        f"elsewhere). Adjusted p {top['p_adjusted']:.1e}.",
    ]
    if pm:
        lines.append(
            f"- {PARAM_NAMES.get(pm['param'], pm['param'])}: mean {pm['mean_before']:.2f} -> "
            f"{pm['mean_after']:.2f} in the {pm['window_days']:g} days either side of the PM on "
            f"{pm['pm_at'][:10]} (p {pm['p_value']:.1e}); "
            f"{spc.get('points_out_of_control_after_baseline', 0)} of "
            f"{sum(not p['baseline'] for p in spc.get('points', []))} SPC points since are "
            "out of control."
        )
    if wm:
        lines.append(
            f"- Wafer map {wm['wafer_id']}: {wm['label'].replace('_', ' ')}, "
            f"{100 * wm['edge_fail_rate']:.1f}% of edge dies failing against "
            f"{100 * wm['inner_fail_rate']:.1f}% inside."
        )
    return "\n".join(lines)


def _answer(r: dict, chamber: str) -> str:
    wo = r.get("draft_work_order", {})
    return (
        f"{chamber} is the common cause.\n\n"
        + _evidence(r, chamber)
        + f"\n- Relevant procedure and past case:{_cites(r)}\n\n"
        f"Recommended: hold {chamber} for production, re-seat and recalibrate the match "
        f"capacitors, then requalify. Work order WO-{wo.get('id', 0):04d} is drafted; an "
        "engineer must approve it."
    )
