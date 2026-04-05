import base64
from io import BytesIO
import ollama
from PIL import Image
from .base import AIAdapter

class OllamaAdapter(AIAdapter):
    def __init__(self, base_url: str = "http://localhost:11434", model_name: str = "llama3.2-vision"):
        self.host = base_url
        self.model_name = model_name
        self.client = ollama.AsyncClient(host=self.host)

    async def process_image(self, image: Image.Image, prompt: str) -> str:
        # Convert PIL image to bytes
        buffered = BytesIO()
        image.save(buffered, format="PNG")
        image_bytes = buffered.getvalue()

        try:
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
            
        except Exception as e:
            print(f"Ollama Adapter Error (Library): {e}")
            raise
