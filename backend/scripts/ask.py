"""Ask the agent a question from the terminal and watch each tool call.

Usage (needs OPENAI_API_KEY or GEMINI_API_KEY in backend/.env):
    python -m scripts.ask "Why did yield drop on recent lots?"
"""

import json
import sys

from app import create_app
from app.agent import loop
from app.agent.tools import Context

DEMO = "Yield dropped on recent lots. Find the cause and recommend an action."


def main() -> None:
    question = " ".join(sys.argv[1:]) or DEMO
    app = create_app()
    llm = app.extensions["llm"]
    if llm is None:
        sys.exit("No model configured: set OPENAI_API_KEY or GEMINI_API_KEY in backend/.env")
    print(f"model: {llm.name}   embedder: {app.extensions['embedder'].name}\n")
    with app.extensions["db_session"]() as s:
        for e in loop.run(llm, Context(s, app.extensions["embedder"]), question):
            if e["type"] == "tool_call":
                print(f"  > {e['name']}({json.dumps(e['arguments'])})")
            elif e["type"] == "tool_result":
                mark = "ok" if e["ok"] else f"failed: {e['result'].get('error')}"
                rows = f", {e['rows']} rows" if e["rows"] is not None else ""
                print(f"    {mark}, {e['duration_ms']} ms{rows}")
            elif e["type"] == "message":
                print(f"\n{e['content']}")
            else:
                print(f"\n[{e['type']}] {e.get('reason', '')}")


if __name__ == "__main__":
    main()
