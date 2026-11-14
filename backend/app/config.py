"""Settings read from environment variables (and a local .env file)."""

import os

from dotenv import load_dotenv

load_dotenv()


class Config:
    TESTING = False
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///fabcopilot.db")
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
    # "auto" = OpenAI embeddings when a key is set, else the offline hashing embedder.
    EMBEDDER = os.getenv("EMBEDDER", "auto")
    EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")


class TestConfig(Config):
    TESTING = True
    DATABASE_URL = "sqlite:///:memory:"
    OPENAI_API_KEY = ""
    EMBEDDER = "hashing"
