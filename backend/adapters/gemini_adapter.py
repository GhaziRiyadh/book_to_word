import google.generativeai as genai
import logging
from PIL import Image
from core.config import settings
from .base import AIAdapter

logger = logging.getLogger("ocr_service")

class GeminiAdapter(AIAdapter):
    def __init__(
        self,
        api_key: str | None = None,
        model_name: str | None = None,
        embed_model: str = "models/text-embedding-004",
    ):
        api_key = (api_key or settings.GEMINI_API_KEY).strip()
        if not api_key:
            raise ValueError("GEMINI_API_KEY is not set in environment or .env file.")

        model_name = (model_name or settings.GEMINI_MODEL).strip()
        if not model_name.startswith("models/"):
            model_name = f"models/{model_name}"

        genai.configure(api_key=api_key) # type: ignore
        self.model_name = model_name
        self.embed_model = embed_model
        logger.debug(
            "Initializing GeminiAdapter with model=%s embed_model=%s",
            self.model_name,
            self.embed_model,
        )
        generation_config = {
            "temperature": 0.0,
        }
        self.model = genai.GenerativeModel(model_name=model_name, generation_config=generation_config) # type: ignore
        logger.info("Gemini adapter initialized with model=%s", self.model_name)

    async def process_image(self, image: Image.Image, prompt: str) -> str:
        try:
            logger.debug(
                "Gemini process_image started prompt_len=%s image_size=%s",
                len(prompt or ""),
                image.size,
            )
            response = await self.model.generate_content_async([prompt, image])
            result = response.text.strip() if response.text else ""
            logger.debug("Gemini process_image completed output_len=%s", len(result))
            return result
        except Exception as e:
            logger.error("Gemini process_image failed: %s", e)
            return ""

    async def get_embedding(self, text: str) -> list[float]:
        try:
            logger.debug("Gemini embedding request text_len=%s", len(text or ""))
            result = genai.embed_content( # type: ignore
                model=self.embed_model,
                content=text,
                task_type="retrieval_document"
            )
            embedding = result.get("embedding", [])
            logger.debug("Gemini embedding response dim=%s", len(embedding))
            return embedding
        except Exception as e:
            logger.warning("Gemini embedding failed: %s", e)
            return []
