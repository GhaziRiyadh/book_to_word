from fastapi import APIRouter

from core.config import settings
from services import get_adapter_health

router = APIRouter()


@router.get("/")
def get_runtime_settings():
    return {
        "project_name": settings.PROJECT_NAME,
        "api_prefix": settings.API_V1_STR,
        "log_level": settings.LOG_LEVEL,
        "ai": {
            "provider": settings.AI_PROVIDER,
            "openrouter_model": settings.OPENROUTER_MODEL,
            "openrouter_base_url": settings.OPENROUTER_BASE_URL,
            "openrouter_title": settings.OPENROUTER_TITLE,
            "openrouter_has_referer": bool(settings.OPENROUTER_HTTP_REFERER),
            "gemini_model": settings.GEMINI_MODEL,
            "ollama_model": settings.OLLAMA_MODEL,
            "ollama_base_url": settings.OLLAMA_BASE_URL,
            "hf_model_id": settings.HF_MODEL_ID,
            "hf_offline_mode": settings.HF_OFFLINE_MODE,
            "hf_allow_cpu_fallback": settings.HF_ALLOW_CPU_FALLBACK,
        },
        "adapter_health": get_adapter_health(),
    }
