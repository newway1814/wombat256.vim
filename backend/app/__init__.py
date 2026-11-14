"""FabCopilot backend: Flask app factory."""

from flask import Flask

from .config import Config


def create_app(config: type[Config] | None = None) -> Flask:
    """Build a fresh Flask app.

    Tests call this with their own config so each test gets a clean app
    (and later, a throwaway database).
    """
    app = Flask(__name__)
    app.config.from_object(config or Config)

    from .api import api_bp

    app.register_blueprint(api_bp, url_prefix="/api")
    return app
