"""The tool-calling loop. It yields events as it goes, so the screen can show each step live.

Events:
    {"type": "tool_call",   "step": n, "id", "name", "arguments"}
    {"type": "tool_result", "step": n, "id", "name", "ok", "duration_ms", "rows", "result"}
    {"type": "message",     "content": str}
    {"type": "stopped",     "reason": str}
"""

import time
from collections.abc import Iterator

from ..services.tickets import audit
from .llm import LLM
from .prompts import SYSTEM_PROMPT
from .tools import TOOLS, Context, execute

MAX_STEPS = 8


def run(
    llm: LLM,
    ctx: Context,
    user_message: str,
    history: list[dict] | None = None,
    max_steps: int = MAX_STEPS,
) -> Iterator[dict]:
    messages: list[dict] = [*(history or []), {"role": "user", "content": user_message}]
    specs = [t.spec() for t in TOOLS.values()]
    audit(ctx.session, "user", "chat", {"message": user_message[:500], "model": llm.name})
    ctx.session.commit()

    for step in range(1, max_steps + 1):
        reply = llm.complete(SYSTEM_PROMPT, messages, specs)
        if not reply.tool_calls:
            yield {"type": "message", "content": reply.text or ""}
            return

        messages.append(
            {
                "role": "assistant",
                "content": reply.text,
                "tool_calls": reply.tool_calls,
                "raw": reply.raw,
            }
        )
        for call in reply.tool_calls:
            yield {
                "type": "tool_call",
                "step": step,
                "id": call.id,
                "name": call.name,
                "arguments": call.arguments,
            }
            started = time.perf_counter()
            outcome = execute(ctx, call.name, call.arguments)
            duration_ms = round((time.perf_counter() - started) * 1000)
            audit(
                ctx.session,
                "agent",
                f"tool:{call.name}",
                {"arguments": call.arguments, "ok": outcome.ok, "duration_ms": duration_ms},
            )
            ctx.session.commit()
            yield {
                "type": "tool_result",
                "step": step,
                "id": call.id,
                "name": call.name,
                "ok": outcome.ok,
                "duration_ms": duration_ms,
                "rows": outcome.rows,
                "result": outcome.result,
            }
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call.id,
                    "name": call.name,
                    "content": outcome.for_model,
                }
            )

    audit(ctx.session, "agent", "step_limit", {"max_steps": max_steps})
    ctx.session.commit()
    yield {
        "type": "stopped",
        "reason": f"Stopped after {max_steps} steps without a final answer. "
        "Narrow the question and ask again.",
    }
