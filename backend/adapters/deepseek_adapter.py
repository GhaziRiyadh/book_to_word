import os
import base64
from io import BytesIO
from openai import AsyncOpenAI
from PIL import Image
from .base import AIAdapter

class DeepSeekAdapter(AIAdapter):
    def __init__(self, api_key: str, model_name: str = "deepseek-chat"):
        self.client = AsyncOpenAI(api_key=api_key, base_url="https://api.deepseek.com/v1")
        self.model_name = model_name

    async def process_image(self, image: Image.Image, prompt: str) -> str:
        buffered = BytesIO()
        image.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")

        messages = [
                # {
                #     "role": "user",
                #     "content": [
                #         {"type": "text", "text": prompt},
                #         {
                #             "type": "image_url",
                #             "image_url": {"url": f"data:image/png;base64,{img_str}"},
                #         },
                #     ],
                # }
                {
                    "role": "user",
                    "content": f"{prompt}\n\n![image](data:image/png;base64,{img_str})"
                }
            ]

        try:
            response = await self.client.chat.completions.create(
                model=self.model_name,
                messages=messages,
                stream=False
            )
            print(response.choices, "================")
            return response.choices[0].message.content.strip()
        except Exception as e:
            # Log the full error for debugging
            print(f"DeepSeek API error: {e}")
            # You might want to retry with a different format or raise
            raise