from flask import jsonify, request

from ..services import fab
from . import api_bp, db


@api_bp.get("/lots")
def list_lots():
    args = request.args
    return jsonify(
        fab.list_lots(
            db(),
            limit=fab.parse_int(args.get("limit"), "limit", 50, 1, fab.MAX_PAGE),
            offset=fab.parse_int(args.get("offset"), "offset", 0, 0, 1_000_000),
            status=args.get("status") or None,
        )
    )


@api_bp.get("/lots/<lot_id>")
def get_lot(lot_id: str):
    return jsonify(fab.get_lot(db(), lot_id))
