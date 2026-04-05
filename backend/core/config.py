import os
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    PROJECT_NAME: str = "Arabic OCR System"
    API_V1_STR: str = "/api/v1"
    
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
    
    # HuggingFace
    HF_MODEL_ID: str = os.getenv("HF_MODEL_ID", "meta-llama/Llama-3.2-11B-Vision-Instruct")

    class Config:
        case_sensitive = True

settings = Settings()

# Ensure upload directory exists
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
