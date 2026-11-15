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
    GEMINI_CHAT_MODEL = os.getenv("GEMINI_CHAT_MODEL", "gemini-3.5-flash")
    # Tried in order when the main model stays overloaded.
    GEMINI_FALLBACK_MODELS = os.getenv(
        "GEMINI_FALLBACK_MODELS", "gemini-flash-latest,gemini-3.1-flash-lite"
    )
    DEMO_STEP_DELAY = float(os.getenv("DEMO_STEP_DELAY", "0.6"))
    # Public deployment: which sites may call the API ("*" for any), and how many chat
    # questions one visitor may ask per hour (0 = no limit).
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "")
    CHAT_LIMIT_PER_HOUR = int(os.getenv("CHAT_LIMIT_PER_HOUR", "0"))
    EMBEDDER = os.getenv("EMBEDDER", "auto")
    EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "")


class TestConfig(Config):
    TESTING = True
    DATABASE_URL = "sqlite:///:memory:"
    OPENAI_API_KEY = ""
    GEMINI_API_KEY = ""
    LLM_PROVIDER = "none"
    EMBEDDER = "hashing"
