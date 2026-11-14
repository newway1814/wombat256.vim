"""Settings read from environment variables (and a local .env file)."""

import os

from dotenv import load_dotenv

load_dotenv()


class Config:
    TESTING = False
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///fabcopilot.db")
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")


class TestConfig(Config):
    TESTING = True
    DATABASE_URL = "sqlite:///:memory:"
    OPENAI_API_KEY = ""
