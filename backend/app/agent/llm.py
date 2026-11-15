"""Model adapters. The loop speaks one neutral message format; each adapter translates.

Neutral messages:
    {"role": "user" | "assistant", "content": str}
    {"role": "assistant", "content": str | None, "tool_calls": [ToolCall], "raw": <provider data>}
    {"role": "tool", "tool_call_id": str, "name": str, "content": str}
"""

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class Reply:
    text: str | None
    tool_calls: list[ToolCall] = field(default_factory=list)
    raw: Any = None  # provider message, replayed as-is on the next turn


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    parameters: dict  # JSON schema


class LLM(Protocol):
    name: str

    def complete(self, system: str, messages: list[dict], tools: list[ToolSpec]) -> Reply: ...


class OpenAIChat:
    def __init__(self, api_key: str, model: str):
        from openai import OpenAI

        self.client = OpenAI(api_key=api_key)
        self.model = model
        self.name = f"openai/{model}"

    def complete(self, system: str, messages: list[dict], tools: list[ToolSpec]) -> Reply:
        wire: list[dict] = [{"role": "system", "content": system}]
        for m in messages:
            if m["role"] == "tool":
                wire.append(
                    {"role": "tool", "tool_call_id": m["tool_call_id"], "content": m["content"]}
                )
            elif m["role"] == "assistant" and m.get("tool_calls"):
                wire.append(
                    {
                        "role": "assistant",
                        "content": m.get("content"),
                        "tool_calls": [
                            {
                                "id": c.id,
                                "type": "function",
                                "function": {"name": c.name, "arguments": json.dumps(c.arguments)},
                            }
                            for c in m["tool_calls"]
                        ],
                    }
                )
            else:
                wire.append({"role": m["role"], "content": m["content"]})
        resp = self.client.chat.completions.create(
            model=self.model,
            messages=wire,
            tools=[
                {
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.parameters,
                    },
                }
                for t in tools
            ],
        )
        msg = resp.choices[0].message
        calls = []
        for c in msg.tool_calls or []:
            try:
                args = json.loads(c.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {"_unparseable": c.function.arguments}
            calls.append(ToolCall(c.id, c.function.name, args))
        return Reply(text=msg.content, tool_calls=calls)


def gemini_client(api_key: str):
    """Gemini client with a timeout and retries: busy models return 503 and recover quickly."""
    from google import genai
    from google.genai import types

    return genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(
            timeout=60_000,
            retry_options=types.HttpRetryOptions(
                attempts=5,
                initial_delay=2.0,
                max_delay=20.0,
                http_status_codes=[429, 500, 503, 504],
            ),
        ),
    )


def call_with_quota_wait(fn, attempts: int = 4):
    """Run a Gemini call; on a 429 quota error wait as long as the API says, then retry."""
    import re
    import time

    from google.genai import errors

    for attempt in range(attempts):
        try:
            return fn()
        except errors.ClientError as e:
            if e.code != 429 or attempt == attempts - 1:
                raise
            m = re.search(r"retry in ([\d.]+)s", str(e))
            time.sleep(min(float(m.group(1)) + 1 if m else 30.0, 70.0))
    raise RuntimeError("unreachable")


class GeminiChat:
    def __init__(self, api_key: str, model: str, fallbacks: list[str] | None = None):
        self.client = gemini_client(api_key)
        self.model = model
        self.models = [model, *(fallbacks or [])]
        self.name = f"gemini/{model}"
        self.served_by: set[str] = set()  # which models actually answered

    def _generate(self, contents, config):
        """Try the main model, then each fallback, when a model stays overloaded (5xx)."""
        from google.genai import errors

        last: Exception | None = None
        for model in self.models:
            try:
                resp = call_with_quota_wait(
                    lambda m=model: self.client.models.generate_content(
                        model=m, contents=contents, config=config
                    )
                )
                self.served_by.add(model)
                return resp
            except errors.ServerError as e:
                last = e
        assert last is not None
        raise last

    def complete(self, system: str, messages: list[dict], tools: list[ToolSpec]) -> Reply:
        from google.genai import types

        contents: list = []
        for m in messages:
            if m["role"] == "user":
                contents.append(types.Content(role="user", parts=[types.Part(text=m["content"])]))
            elif m["role"] == "assistant":
                if m.get("raw") is not None:
                    contents.append(m["raw"])  # keeps Gemini's thought signatures intact
                else:
                    contents.append(
                        types.Content(role="model", parts=[types.Part(text=m["content"] or "")])
                    )
            elif m["role"] == "tool":
                contents.append(
                    types.Content(
                        role="user",
                        parts=[
                            types.Part(
                                function_response=types.FunctionResponse(
                                    id=m["tool_call_id"],
                                    name=m["name"],
                                    response={"result": m["content"]},
                                )
                            )
                        ],
                    )
                )
        config = types.GenerateContentConfig(
            system_instruction=system,
            tools=[
                types.Tool(
                    function_declarations=[
                        types.FunctionDeclaration(
                            name=t.name,
                            description=t.description,
                            parameters_json_schema=t.parameters,
                        )
                        for t in tools
                    ]
                )
            ],
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        resp = self._generate(contents, config)
        content = resp.candidates[0].content if resp.candidates else None
        calls, texts = [], []
        for i, part in enumerate((content.parts if content else None) or []):
            if part.function_call:
                fc = part.function_call
                calls.append(ToolCall(fc.id or f"call_{i}", fc.name, dict(fc.args or {})))
            elif part.text and not getattr(part, "thought", False):
                texts.append(part.text)
        return Reply(text="".join(texts) or None, tool_calls=calls, raw=content)


def make_llm(provider: str, config: dict) -> LLM | None:
    """provider: "openai", "gemini", "demo", "none", or "auto" (whichever key is set, OpenAI
    first; with no key, the demo model).

    A provider whose key is missing falls back to the demo model with a warning, so a deployment
    with a forgotten or empty key still starts instead of crashing.
    """
    provider = (provider or "auto").strip().lower()
    openai_key = (config.get("OPENAI_API_KEY") or "").strip()
    gemini_key = (config.get("GEMINI_API_KEY") or "").strip()
    if provider == "none":
        return None
    if provider == "auto":
        provider = "openai" if openai_key else "gemini" if gemini_key else "demo"
    if provider == "openai" and not openai_key or provider == "gemini" and not gemini_key:
        logging.getLogger(__name__).warning(
            "LLM_PROVIDER=%s but its API key is empty; using the demo model instead", provider
        )
        provider = "demo"
    if provider == "openai":
        return OpenAIChat(openai_key, config["OPENAI_CHAT_MODEL"])
    if provider == "gemini":
        fallbacks = [m for m in config.get("GEMINI_FALLBACK_MODELS", "").split(",") if m.strip()]
        return GeminiChat(gemini_key, config["GEMINI_CHAT_MODEL"], fallbacks)
    if provider == "demo":
        from .demo import DemoLLM

        return DemoLLM(float(config.get("DEMO_STEP_DELAY", 0.6)))
    raise ValueError(f"unknown LLM provider {provider!r}")
