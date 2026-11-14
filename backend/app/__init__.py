"""FabCopilot backend: Flask app factory."""

from flask import Flask

from .config import Config
from .db import init_db, make_engine, make_session_factory
from .errors import register_error_handlers
from .rag.embed import make_embedder


def create_app(config: type[Config] | None = None) -> Flask:
    """Build a fresh Flask app.

    Tests call this with their own config, so each test gets a clean app
    with its own throwaway in-memory database.
    """
    app = Flask(__name__)
    app.config.from_object(config or Config)

    engine = make_engine(app.config["DATABASE_URL"])
    init_db(engine)
    app.extensions["db_engine"] = engine
    app.extensions["db_session"] = make_session_factory(engine)
    app.extensions["embedder"] = make_embedder(
        app.config["EMBEDDER"], app.config["OPENAI_API_KEY"], app.config["EMBEDDING_MODEL"]
    )

    from .api import api_bp

    app.register_blueprint(api_bp, url_prefix="/api")
    register_error_handlers(app)
    return app
