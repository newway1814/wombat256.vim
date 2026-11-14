"""Errors that become JSON responses: {"error": {"code": ..., "message": ...}}."""

from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException


class ApiError(Exception):
    status = 400
    code = "bad_request"

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class NotFound(ApiError):
    status = 404
    code = "not_found"


class BadRequest(ApiError):
    status = 400
    code = "bad_request"


class Conflict(ApiError):
    status = 409
    code = "conflict"


def _body(code: str, message: str):
    return jsonify(error={"code": code, "message": message})


def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(ApiError)
    def _api_error(e: ApiError):
        return _body(e.code, e.message), e.status

    @app.errorhandler(HTTPException)
    def _http_error(e: HTTPException):
        # Unknown routes, wrong methods, ... still answer in JSON.
        code = (e.name or "error").lower().replace(" ", "_")
        return _body(code, e.description or e.name), e.code
