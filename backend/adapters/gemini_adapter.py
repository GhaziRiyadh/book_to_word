import os
import google.generativeai as genai
from PIL import Image
from .base import AIAdapter

class GeminiAdapter(AIAdapter):
    def __init__(self, api_key: str, model_name: str = "models/gemini-2.0-flash", embed_model: str = "models/text-embedding-004"):
        genai.configure(api_key=api_key)
        self.model_name = model_name
        self.embed_model = embed_model
        generation_config = {
            "temperature": 0.0,
        }
        self.model = genai.GenerativeModel(model_name=model_name, generation_config=generation_config)

    async def process_image(self, image: Image.Image, prompt: str) -> str:
        response = await self.model.generate_content_async([prompt, image])
        return response.text.strip() if response.text else ""

    async def get_embedding(self, text: str) -> list[float]:
        try:
            result = genai.embed_content(
                model=self.embed_model,
                content=text,
                task_type="retrieval_document"
            )
            return result.get("embedding", [])
        except Exception as e:
            print(f"Gemini Embedding Error: {e}")
            return []
