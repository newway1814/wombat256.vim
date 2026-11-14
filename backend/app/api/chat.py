import json

from flask import Response, current_app, request, stream_with_context

from ..agent import loop
from ..agent.tools import Context, _json_default
from ..errors import ApiError, BadRequest
from . import api_bp


class NoModel(ApiError):
    status = 503
    code = "no_model"


def _sse(event: dict) -> str:
    return f"event: {event['type']}\ndata: {json.dumps(event, default=_json_default)}\n\n"


@api_bp.post("/chat")
def chat():
    """Run the agent and stream each step as Server-Sent Events."""
    llm = current_app.extensions.get("llm")
    if llm is None:
        raise NoModel("No model configured. Set OPENAI_API_KEY or GEMINI_API_KEY in backend/.env.")
    body = request.get_json(silent=True) or {}
    message = (body.get("message") or "").strip()
    if not message:
        raise BadRequest("'message' must not be empty")
    if len(message) > 2000:
        raise BadRequest("'message' must be at most 2000 characters")
    history = [
        {"role": m["role"], "content": str(m["content"])}
        for m in body.get("history") or []
        if isinstance(m, dict) and m.get("role") in ("user", "assistant") and m.get("content")
    ][-10:]

    session_factory = current_app.extensions["db_session"]
    embedder = current_app.extensions["embedder"]

    def events():
        with session_factory() as s:
            try:
                for event in loop.run(llm, Context(s, embedder), message, history):
                    yield _sse(event)
            except Exception as e:  # noqa: BLE001  (the stream must end cleanly)
                current_app.logger.exception("chat failed")
                yield _sse({"type": "error", "message": f"{type(e).__name__}: {e}"[:300]})
        yield _sse({"type": "done"})

    return Response(
        stream_with_context(events()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
