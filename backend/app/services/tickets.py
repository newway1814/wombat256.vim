"""Work orders: the agent drafts them; only a human approves or rejects."""

import json
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import repository as repo
from ..errors import BadRequest, Conflict, NotFound
from ..models import AuditLog, WorkOrder


def now() -> datetime:
    return datetime.now().replace(microsecond=0)


def audit(s: Session, actor: str, action: str, detail: dict) -> None:
    s.add(AuditLog(at=now(), actor=actor, action=action, detail=json.dumps(detail, default=str)))


def ticket_dict(wo: WorkOrder) -> dict:
    return {
        "id": wo.id,
        "chamber_id": wo.chamber_id,
        "title": wo.title,
        "body": wo.body,
        "status": wo.status,
        "created_at": wo.created_at.isoformat(timespec="seconds"),
        "decided_at": wo.decided_at.isoformat(timespec="seconds") if wo.decided_at else None,
        "decided_by": wo.decided_by,
    }


def draft_work_order(s: Session, chamber_id: str, title: str, body: str) -> dict:
    """Creates a DRAFT only. Nothing happens on the floor until a human approves it."""
    if repo.get_chamber(s, chamber_id) is None:
        raise NotFound(f"Chamber {chamber_id} not found")
    wo = WorkOrder(chamber_id=chamber_id, title=title, body=body, status="DRAFT", created_at=now())
    s.add(wo)
    s.flush()
    audit(s, "agent", "draft_work_order", {"work_order_id": wo.id, "chamber_id": chamber_id})
    s.commit()
    return ticket_dict(wo)


def _decide(s: Session, ticket_id: int, by: str, status: str) -> dict:
    by = (by or "").strip()
    if not by:
        raise BadRequest("'by' (the engineer's name) is required")
    wo = s.get(WorkOrder, ticket_id)
    if wo is None:
        raise NotFound(f"Work order {ticket_id} not found")
    if wo.status != "DRAFT":
        raise Conflict(f"Work order {ticket_id} is already {wo.status}")
    wo.status = status
    wo.decided_at = now()
    wo.decided_by = by
    audit(s, by, f"{status.lower()}_work_order", {"work_order_id": ticket_id})
    s.commit()
    return ticket_dict(wo)


def approve(s: Session, ticket_id: int, by: str) -> dict:
    return _decide(s, ticket_id, by, "APPROVED")


def reject(s: Session, ticket_id: int, by: str) -> dict:
    return _decide(s, ticket_id, by, "REJECTED")


def list_tickets(s: Session) -> list[dict]:
    return [ticket_dict(w) for w in s.scalars(select(WorkOrder).order_by(WorkOrder.id.desc()))]


def list_audit(s: Session, limit: int = 100) -> list[dict]:
    rows = s.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(limit))
    return [
        {
            "id": a.id,
            "at": a.at.isoformat(timespec="seconds"),
            "actor": a.actor,
            "action": a.action,
            "detail": json.loads(a.detail),
        }
        for a in rows
    ]
