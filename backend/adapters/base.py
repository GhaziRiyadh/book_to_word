from abc import ABC, abstractmethod
from typing import Optional
from PIL import Image

class AIAdapter(ABC):
    @abstractmethod
    async def process_image(self, image: Image.Image, prompt: str) -> str:
        """
        Processes an image and returns the extracted text.
        """
        pass
