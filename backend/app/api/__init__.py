"""REST API routes. Routes stay thin: read the request, call a service, return JSON."""

from flask import Blueprint, current_app, g
from sqlalchemy.orm import Session

api_bp = Blueprint("api", __name__)


def db() -> Session:
    """One database session per request, closed when the request ends."""
    if "db" not in g:
        g.db = current_app.extensions["db_session"]()
    return g.db


@api_bp.teardown_app_request
def _close_db(_exc):
    session = g.pop("db", None)
    if session is not None:
        session.close()


from . import chambers, health, lots, wafers  # noqa: E402, F401  (registers routes)
