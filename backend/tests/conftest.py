import pytest

from app import create_app
from app.config import TestConfig
from scripts.generate_data import generate


@pytest.fixture
def app():
    """A fresh app with an empty in-memory database."""
    return create_app(TestConfig)


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture(scope="session")
def fab_app():
    """One app with the full fake fab, shared by read-only tests (built once, ~2 s)."""
    app = create_app(TestConfig)
    generate(app.extensions["db_engine"], seed=42)
    return app


@pytest.fixture
def fab_client(fab_app):
    return fab_app.test_client()
