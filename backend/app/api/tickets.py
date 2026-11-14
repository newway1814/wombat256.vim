from flask import jsonify, request

from ..services import fab, tickets
from . import api_bp, db


@api_bp.get("/tickets")
def list_tickets():
    return jsonify(items=tickets.list_tickets(db()))


@api_bp.post("/tickets/<int:ticket_id>/approve")
def approve(ticket_id: int):
    by = (request.get_json(silent=True) or {}).get("by", "")
    return jsonify(tickets.approve(db(), ticket_id, by))


@api_bp.post("/tickets/<int:ticket_id>/reject")
def reject(ticket_id: int):
    by = (request.get_json(silent=True) or {}).get("by", "")
    return jsonify(tickets.reject(db(), ticket_id, by))


@api_bp.get("/audit")
def audit_log():
    limit = fab.parse_int(request.args.get("limit"), "limit", 100, 1, 500)
    return jsonify(items=tickets.list_audit(db(), limit))
