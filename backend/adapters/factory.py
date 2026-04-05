import os
from .gemini_adapter import GeminiAdapter
from .ollama_adapter import OllamaAdapter
from .base import AIAdapter

class AdapterFactory:
    @staticmethod
    def get_adapter() -> AIAdapter:
        provider = os.getenv("AI_PROVIDER", "gemini").lower()
        
        if provider == "gemini":
            api_key = os.getenv("GEMINI_API_KEY")
            model_name = os.getenv("GEMINI_MODEL", "models/gemini-2.0-flash")
            if not api_key:
                raise ValueError("GEMINI_API_KEY is not set")
            return GeminiAdapter(api_key, model_name)
        
        elif provider == "ollama":
            base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
            model_name = os.getenv("OLLAMA_MODEL", "llama3.2-vision")
            return OllamaAdapter(base_url, model_name)
            
        else:
            raise ValueError(f"Unknown AI provider: {provider}. Supported: gemini, ollama")
