"""Public deployment: CORS for a separately hosted screen, and the chat rate limit."""

import pytest

from app import create_app
from app.api.chat import friendly_error
from app.config import TestConfig


def make(**overrides):
    cfg = type("Cfg", (TestConfig,), overrides)
    return create_app(cfg)


def test_no_cors_headers_by_default(client):
    r = client.get("/api/health", headers={"Origin": "https://example.netlify.app"})
    assert "Access-Control-Allow-Origin" not in r.headers


def test_cors_for_an_allowed_origin_and_preflight():
    client = make(CORS_ORIGINS="https://fab.netlify.app").test_client()
    r = client.get("/api/health", headers={"Origin": "https://fab.netlify.app"})
    assert r.headers["Access-Control-Allow-Origin"] == "https://fab.netlify.app"
    pre = client.options(
        "/api/chat",
        headers={"Origin": "https://fab.netlify.app", "Access-Control-Request-Method": "POST"},
    )
    assert pre.status_code == 204
    assert "POST" in pre.headers["Access-Control-Allow-Methods"]
    other = client.get("/api/health", headers={"Origin": "https://evil.example"})
    assert "Access-Control-Allow-Origin" not in other.headers


def test_cors_wildcard():
    client = make(CORS_ORIGINS="*").test_client()
    r = client.get("/api/health", headers={"Origin": "https://anything.example"})
    assert r.headers["Access-Control-Allow-Origin"] == "*"


def test_chat_rate_limit_per_visitor():
    app = make(CHAT_LIMIT_PER_HOUR=2, LLM_PROVIDER="demo", DEMO_STEP_DELAY=0.0)
    client = app.test_client()
    for _ in range(2):
        assert client.post("/api/chat", json={"message": "  "}).status_code == 400  # counted
    r = client.post("/api/chat", json={"message": "hi"})
    assert r.status_code == 429 and r.get_json()["error"]["code"] == "rate_limited"
    other = client.post("/api/chat", json={"message": "  "}, headers={"X-Forwarded-For": "9.9.9.9"})
    assert other.status_code == 400  # a different visitor has their own allowance


@pytest.mark.parametrize(
    "message, expected",
    [
        ("429 RESOURCE_EXHAUSTED. quota exceeded", "quota is used up"),
        ("503 UNAVAILABLE. high demand", "overloaded"),
    ],
)
def test_model_errors_are_explained_plainly(message, expected):
    assert expected in friendly_error(RuntimeError(message))
