from core.config import settings
import logging
from .gemini_adapter import GeminiAdapter
from .ollama_adapter import OllamaAdapter
from .hf_adapter import HuggingFaceAdapter
from .openrouter_adapter import OpenRouterAdapter
from .base import AIAdapter

logger = logging.getLogger("ocr_service")

class AdapterFactory:
    @staticmethod
    def get_adapter() -> AIAdapter:
        provider = settings.AI_PROVIDER.lower()
        logger.debug("AdapterFactory.get_adapter provider=%s", provider)
        
        if provider == "gemini":
            api_key = settings.GEMINI_API_KEY
            model_name = settings.GEMINI_MODEL
            if not api_key:
                raise ValueError("GEMINI_API_KEY is not set in environment or .env file.")
            
            if not model_name.startswith("models/"):
                model_name = f"models/{model_name}"
                
            logger.debug("Creating GeminiAdapter model=%s", model_name)
            return GeminiAdapter(api_key, model_name)
        
        elif provider == "ollama":
            base_url = settings.OLLAMA_BASE_URL
            model_name = settings.OLLAMA_MODEL
            logger.debug("Creating OllamaAdapter base_url=%s model=%s", base_url, model_name)
            return OllamaAdapter(base_url, model_name)
            
        elif provider == "huggingface":
            model_id = settings.HF_MODEL_ID
            if not model_id or not model_id.strip():
                raise ValueError("HF_MODEL_ID is not set in environment or .env file.")
            token = settings.HF_TOKEN or None
            logger.debug(
                "Creating HuggingFaceAdapter model_id=%s offline_mode=%s allow_cpu_fallback=%s token_set=%s",
                model_id,
                settings.HF_OFFLINE_MODE,
                settings.HF_ALLOW_CPU_FALLBACK,
                bool(token),
            )
            return HuggingFaceAdapter(
                model_id=model_id,
                token=token,
                offline_mode=settings.HF_OFFLINE_MODE,
                allow_cpu_fallback=settings.HF_ALLOW_CPU_FALLBACK,
            )

        elif provider == "openrouter":
            api_key = settings.OPENROUTER_API_KEY
            if not api_key:
                raise ValueError("OPENROUTER_API_KEY is not set in environment or .env file.")

            logger.debug(
                "Creating OpenRouterAdapter base_url=%s model=%s referer_set=%s title_set=%s",
                settings.OPENROUTER_BASE_URL,
                settings.OPENROUTER_MODEL,
                bool(settings.OPENROUTER_HTTP_REFERER),
                bool(settings.OPENROUTER_TITLE),
            )
            return OpenRouterAdapter(
                api_key=api_key,
                model_name=settings.OPENROUTER_MODEL,
                base_url=settings.OPENROUTER_BASE_URL,
                http_referer=settings.OPENROUTER_HTTP_REFERER,
                title=settings.OPENROUTER_TITLE,
            )
            
        else:
            raise ValueError(f"Unknown AI provider: {provider}. Supported: gemini, ollama, huggingface, openrouter")
