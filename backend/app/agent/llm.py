"""Model adapters. The loop speaks one neutral message format; each adapter translates.

Neutral messages:
    {"role": "user" | "assistant", "content": str}
    {"role": "assistant", "content": str | None, "tool_calls": [ToolCall], "raw": <provider data>}
    {"role": "tool", "tool_call_id": str, "name": str, "content": str}
"""

import json
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


class GeminiChat:
    def __init__(self, api_key: str, model: str):
        from google import genai

        self.client = genai.Client(api_key=api_key)
        self.model = model
        self.name = f"gemini/{model}"

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
        resp = self.client.models.generate_content(
            model=self.model, contents=contents, config=config
        )
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
    """provider: "openai", "gemini", "demo" (no key, scripted), or "auto" (whichever key is
    set; OpenAI first)."""
    if provider == "auto":
        if config.get("OPENAI_API_KEY"):
            provider = "openai"
        elif config.get("GEMINI_API_KEY"):
            provider = "gemini"
        else:
            return None
    if provider == "openai":
        return OpenAIChat(config["OPENAI_API_KEY"], config["OPENAI_CHAT_MODEL"])
    if provider == "gemini":
        return GeminiChat(config["GEMINI_API_KEY"], config["GEMINI_CHAT_MODEL"])
    if provider == "demo":
        from .demo import DemoLLM

        return DemoLLM(float(config.get("DEMO_STEP_DELAY", 0.6)))
    if provider == "none":
        return None
    raise ValueError(f"unknown LLM provider {provider!r}")
