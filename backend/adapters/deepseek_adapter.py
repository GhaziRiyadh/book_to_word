import os
import base64
from io import BytesIO
from openai import AsyncOpenAI
from PIL import Image
from .base import AIAdapter

class DeepSeekAdapter(AIAdapter):
    def __init__(self, api_key: str, model_name: str = "deepseek-chat"):
        # DeepSeek often uses the OpenAI SDK format
        self.client = AsyncOpenAI(api_key=api_key, base_url="https://api.deepseek.com")
        self.model_name = model_name

    async def process_image(self, image: Image.Image, prompt: str) -> str:
        # Note: Check if DeepSeek's vision model requires a different base_url or model name
        # If deepseek-reasoner or deepseek-chat doesn't support vision directly, 
        # this might need adjustment to their specific vision endpoint.
        # Assuming standard OpenAI vision-compatible API for now.
        
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
