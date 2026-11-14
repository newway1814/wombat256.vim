from flask import jsonify, request

from ..services import fab
from . import api_bp, db


@api_bp.get("/chambers/<chamber_id>/fdc")
def chamber_fdc(chamber_id: str):
    args = request.args
    return jsonify(
        fab.get_chamber_fdc(
            db(),
            chamber_id,
            param=args.get("param", "rf_reflected_w"),
            start=fab.parse_time(args.get("from"), "from"),
            end=fab.parse_time(args.get("to"), "to"),
            limit=fab.parse_int(args.get("limit"), "limit", 2000, 1, 10_000),
        )
    )
