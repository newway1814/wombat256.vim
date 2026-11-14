from flask import current_app, jsonify
from sqlalchemy import func, select

from ..models import Lot, WorkOrder
from ..services import analytics
from . import api_bp, db


@api_bp.get("/status")
def status():
    """The numbers in the header strip."""
    s = db()
    lots = s.execute(select(func.count()).select_from(Lot)).scalar_one()
    open_tickets = s.execute(
        select(func.count()).select_from(WorkOrder).where(WorkOrder.status == "DRAFT")
    ).scalar_one()
    yields = analytics.check_lot_yields(s) if lots >= 3 else None
    llm = current_app.extensions.get("llm")
    return jsonify(
        lots=lots,
        baseline_yield=yields["baseline_yield"] if yields else None,
        flagged_lots=len(yields["flagged"]) if yields else 0,
        open_work_orders=open_tickets,
        model=llm.name if llm else None,
        embedder=current_app.extensions["embedder"].name,
    )
