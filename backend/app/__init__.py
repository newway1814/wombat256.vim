"""FabCopilot backend: Flask app factory."""

from flask import Flask

from .agent.llm import make_llm
from .config import Config
from .db import init_db, make_engine, make_session_factory
from .errors import register_error_handlers
from .rag.embed import make_embedder
from .web import RateLimiter, setup_cors


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
    app.extensions["embedder"] = make_embedder(app.config["EMBEDDER"], app.config)
    app.extensions["llm"] = make_llm(app.config["LLM_PROVIDER"], app.config)

    from .api import api_bp

    app.register_blueprint(api_bp, url_prefix="/api")
    register_error_handlers(app)

    @app.get("/")
    def index():
        return {"service": "FabCopilot API", "health": "/api/health", "status": "/api/status"}

    setup_cors(app)
    app.extensions["chat_limiter"] = RateLimiter(app.config["CHAT_LIMIT_PER_HOUR"], 3600)
    return app
