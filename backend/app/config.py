"""Settings read from environment variables (and a local .env file)."""

import os

from dotenv import load_dotenv

load_dotenv()


class Config:
    TESTING = False
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///fabcopilot.db")
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
    # "auto" picks whichever key is set (OpenAI first); with no key, chat is off and search
    # uses the offline hashing embedder.
    LLM_PROVIDER = os.getenv("LLM_PROVIDER", "auto")
    OPENAI_CHAT_MODEL = os.getenv("OPENAI_CHAT_MODEL", "gpt-4.1-mini")
    GEMINI_CHAT_MODEL = os.getenv("GEMINI_CHAT_MODEL", "gemini-2.5-flash")
    DEMO_STEP_DELAY = float(os.getenv("DEMO_STEP_DELAY", "0.6"))
    EMBEDDER = os.getenv("EMBEDDER", "auto")
    EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "")


class TestConfig(Config):
    TESTING = True
    DATABASE_URL = "sqlite:///:memory:"
    OPENAI_API_KEY = ""
    GEMINI_API_KEY = ""
    LLM_PROVIDER = "none"
    EMBEDDER = "hashing"
