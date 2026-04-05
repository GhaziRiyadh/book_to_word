from core.config import settings
from .gemini_adapter import GeminiAdapter
from .ollama_adapter import OllamaAdapter
from .hf_adapter import HuggingFaceAdapter
from .base import AIAdapter

class AdapterFactory:
    @staticmethod
    def get_adapter() -> AIAdapter:
        provider = settings.AI_PROVIDER.lower()
        
        if provider == "gemini":
            api_key = settings.GEMINI_API_KEY
            model_name = settings.GEMINI_MODEL
            if not api_key:
                raise ValueError("GEMINI_API_KEY is not set in environment or .env file.")
            
            if not model_name.startswith("models/"):
                model_name = f"models/{model_name}"
                
            return GeminiAdapter(api_key, model_name)
        
        elif provider == "ollama":
            base_url = settings.OLLAMA_BASE_URL
            model_name = settings.OLLAMA_MODEL
            return OllamaAdapter(base_url, model_name)
            
        elif provider == "huggingface":
            model_id = settings.HF_MODEL_ID
            return HuggingFaceAdapter(model_id)
            
        else:
            raise ValueError(f"Unknown AI provider: {provider}. Supported: gemini, ollama, huggingface")
