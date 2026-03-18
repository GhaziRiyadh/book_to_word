import os
import base64
from io import BytesIO
from openai import AsyncOpenAI
from PIL import Image
from .base import AIAdapter

class OpenAIAdapter(AIAdapter):
    def __init__(self, api_key: str, model_name: str = "gpt-4o"):
        self.client = AsyncOpenAI(api_key=api_key)
        self.model_name = model_name

    async def process_image(self, image: Image.Image, prompt: str) -> str:
        # Buffer image to base64
        buffered = BytesIO()
        image.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")

        response = await self.client.chat.completions.create(
            model=self.model_name,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{img_str}"},
                        },
                    ],
                }
            ],
            temperature=0.0
        )
        return response.choices[0].message.content.strip()
