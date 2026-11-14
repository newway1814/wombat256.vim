from flask import current_app, jsonify, request

from ..services import docs, fab
from . import api_bp, db


@api_bp.get("/docs/search")
def search_docs():
    k = fab.parse_int(request.args.get("k"), "k", 5, 1, 20)
    embedder = current_app.extensions["embedder"]
    return jsonify(docs.search_docs(db(), embedder, request.args.get("q", ""), k))
