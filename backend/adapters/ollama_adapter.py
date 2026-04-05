import asyncio
import random
import logging
from io import BytesIO
import ollama
from PIL import Image
from .base import AIAdapter

logger = logging.getLogger("ocr_service")

class OllamaAdapter(AIAdapter):
    def __init__(self, base_url: str = "http://localhost:11434", model_name: str = "llama3.2-vision", embed_model: str = "nomic-embed-text"):
        self.host = base_url
        self.model_name = model_name
        self.embed_model = embed_model
        self.client = ollama.AsyncClient(host=self.host)
        logger.info(
            "Ollama adapter initialized host=%s model=%s embed_model=%s",
            self.host,
            self.model_name,
            self.embed_model,
        )

    async def _retry_request(self, func, *args, **kwargs):
        """
        Generic retry logic with exponential backoff for Ollama requests.
        """
        max_retries = 5
        base_delay = 5  # seconds
        
        for i in range(max_retries):
            try:
                logger.debug("Ollama request attempt %s/%s", i + 1, max_retries)
                return await func(*args, **kwargs)
            except Exception as e:
                error_str = str(e).lower()
                # Check for 429 Too Many Requests or quota limits
                if "429" in error_str or "limit" in error_str or "too many" in error_str:
                    delay = (base_delay * (2 ** i)) + (random.uniform(0, 1))
                    logger.warning(f"Ollama Rate Limit (429) hit. Retrying in {delay:.2f}s... (Attempt {i+1}/{max_retries})")
                    await asyncio.sleep(delay)
                    continue
                
                # If it's another error, log and raise
                logger.error(f"Ollama Adapter Error: {e}")
                raise e
        
        raise Exception(f"Failed after {max_retries} retries due to rate limits.")

    async def process_image(self, image: Image.Image, prompt: str) -> str:
        logger.debug(
            "Ollama process_image started prompt_len=%s image_size=%s",
            len(prompt or ""),
            image.size,
        )
        # Convert PIL image to bytes
        buffered = BytesIO()
        image.save(buffered, format="PNG")
        image_bytes = buffered.getvalue()

        async def _do_chat():
            response = await self.client.chat(
                model=self.model_name,
                messages=[
                    {
                        "role": "user",
                        "content": prompt,
                        "images": [image_bytes]
                    }
                ],
                stream=False
            )
            return response.get("message", {}).get("content", "").strip()

        result = await self._retry_request(_do_chat)
        logger.debug("Ollama process_image completed output_len=%s", len(result))
        return result

    async def get_embedding(self, text: str) -> list[float]:
        logger.debug("Ollama embedding request text_len=%s", len(text or ""))
        async def _do_embeddings():
            response = await self.client.embeddings(
                model=self.embed_model,
                prompt=text
            )
            return response.get("embedding", [])

        try:
            embedding = await self._retry_request(_do_embeddings)
            logger.debug("Ollama embedding response dim=%s", len(embedding))
            return embedding
        except Exception:
            # For embeddings, we fail silently to not break the whole OCR task
            logger.warning("Ollama embedding failed; returning empty vector")
            return []
