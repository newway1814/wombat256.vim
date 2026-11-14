"""REST API routes."""

from flask import Blueprint

api_bp = Blueprint("api", __name__)

from . import health  # noqa: E402, F401  (registers routes on api_bp)
