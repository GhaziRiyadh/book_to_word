from core.config import settings
import logging
from .gemini_adapter import GeminiAdapter
from .ollama_adapter import OllamaAdapter
from .hf_adapter import HuggingFaceAdapter
from .openrouter_adapter import OpenRouterAdapter
from .base import AIAdapter

logger = logging.getLogger("ocr_service")

class AdapterFactory:
    def __init__(self, provider: str | None = None):
        self.provider = (provider or settings.AI_PROVIDER).lower().strip()

    @staticmethod
    def get_adapter(provider: str | None = None) -> AIAdapter:
        # Compatibility wrapper: existing call sites can still pass provider directly.
        return AdapterFactory(provider=provider).build_adapter()

    def build_adapter(self) -> AIAdapter:
        logger.debug("AdapterFactory.build_adapter provider=%s", self.provider)

        provider_adapters = {
            "gemini": GeminiAdapter,
            "ollama": OllamaAdapter,
            "huggingface": HuggingFaceAdapter,
            "openrouter": OpenRouterAdapter,
        }

        adapter_class = provider_adapters.get(self.provider)
        if not adapter_class:
            supported = ", ".join(sorted(provider_adapters.keys()))
            raise ValueError(f"Unknown AI provider: {self.provider}. Supported: {supported}")

        logger.debug("Creating adapter class=%s", adapter_class.__name__)
        return adapter_class()
