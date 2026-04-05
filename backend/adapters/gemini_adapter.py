import google.generativeai as genai
import logging
from PIL import Image
from .base import AIAdapter

logger = logging.getLogger("ocr_service")

class GeminiAdapter(AIAdapter):
    def __init__(self, api_key: str, model_name: str = "models/gemini-2.0-flash", embed_model: str = "models/text-embedding-004"):
        genai.configure(api_key=api_key)
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
        self.model = genai.GenerativeModel(model_name=model_name, generation_config=generation_config)
        logger.info("Gemini adapter initialized with model=%s", self.model_name)

    async def process_image(self, image: Image.Image, prompt: str) -> str:
        logger.debug(
            "Gemini process_image started prompt_len=%s image_size=%s",
            len(prompt or ""),
            image.size,
        )
        response = await self.model.generate_content_async([prompt, image])
        result = response.text.strip() if response.text else ""
        logger.debug("Gemini process_image completed output_len=%s", len(result))
        return result

    async def get_embedding(self, text: str) -> list[float]:
        try:
            logger.debug("Gemini embedding request text_len=%s", len(text or ""))
            result = genai.embed_content(
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
