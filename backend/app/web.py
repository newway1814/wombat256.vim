"""Web concerns for a public deployment: CORS (the screen and API on different hosts) and a
simple per-visitor rate limit on chat, so a public link can't burn through the model quota."""

import time
from collections import defaultdict, deque

from flask import Flask, Response, request

from .errors import ApiError


class TooManyRequests(ApiError):
    status = 429
    code = "rate_limited"


def _origin_allowed(origin: str, allowed: list[str]) -> bool:
    return "*" in allowed or origin in allowed


def setup_cors(app: Flask) -> None:
    allowed = [o.strip() for o in app.config.get("CORS_ORIGINS", "").split(",") if o.strip()]
    if not allowed:
        return

    @app.before_request
    def _preflight():
        if request.method == "OPTIONS" and request.path.startswith("/api/"):
            return Response(status=204)

    @app.after_request
    def _headers(resp: Response) -> Response:
        origin = request.headers.get("Origin", "")
        if origin and _origin_allowed(origin, allowed):
            resp.headers["Access-Control-Allow-Origin"] = "*" if "*" in allowed else origin
            resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Accept"
            resp.headers["Access-Control-Max-Age"] = "600"
            if "*" not in allowed:
                resp.headers["Vary"] = "Origin"
        return resp


class RateLimiter:
    """At most `limit` calls per `window` seconds per client IP (in memory, per process)."""

    def __init__(self, limit: int, window: float):
        self.limit = limit
        self.window = window
        self.calls: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        if self.limit <= 0:
            return
        now = time.monotonic()
        q = self.calls[key]
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.limit:
            wait = int(self.window - (now - q[0])) + 1
            raise TooManyRequests(
                f"This demo allows {self.limit} questions per {int(self.window // 60)} minutes. "
                f"Try again in {max(1, wait // 60)} minute(s)."
            )
        q.append(now)


def client_ip() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    return forwarded.split(",")[0].strip() or request.remote_addr or "unknown"
