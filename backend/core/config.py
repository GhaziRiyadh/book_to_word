import os
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    PROJECT_NAME: str = "Arabic OCR System"
    API_V1_STR: str = "/api/v1"
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./ocr_database.db")
    
    # Storage
    UPLOAD_DIR: str = "uploads"
    
    # AI Providers
    AI_PROVIDER: str = os.getenv("AI_PROVIDER", "gemini").lower()
    
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")
    
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3.2-vision")

    # OpenRouter (Hosted API)
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    OPENROUTER_BASE_URL: str = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    OPENROUTER_MODEL: str = os.getenv("OPENROUTER_MODEL", "google/gemma-3-12b-it")
    OPENROUTER_HTTP_REFERER: str = os.getenv("OPENROUTER_HTTP_REFERER", "")
    OPENROUTER_TITLE: str = os.getenv("OPENROUTER_TITLE", "")
    
    # HuggingFace
    HF_MODEL_ID: str = os.getenv("HF_MODEL_ID", "meta-llama/Llama-3.2-11B-Vision-Instruct")
    HF_TOKEN: str = os.getenv("HF_TOKEN", "")
    HF_OFFLINE_MODE: bool = os.getenv("HF_OFFLINE_MODE", "true").lower() == "true"
    HF_ALLOW_CPU_FALLBACK: bool = os.getenv("HF_ALLOW_CPU_FALLBACK", "true").lower() == "true"

    class Config:
        case_sensitive = True

settings = Settings()

# Ensure upload directory exists
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
