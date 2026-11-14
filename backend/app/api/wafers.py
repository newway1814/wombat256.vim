from flask import jsonify

from ..services import fab
from . import api_bp, db


@api_bp.get("/wafers/<wafer_id>/map")
def wafer_map(wafer_id: str):
    return jsonify(fab.get_wafer_map(db(), wafer_id))
