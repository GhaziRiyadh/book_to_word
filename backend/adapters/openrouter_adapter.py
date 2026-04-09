import asyncio
import base64
import logging
import time
from io import BytesIO
from typing import Any

import requests
from PIL import Image
from core.config import settings

from .base import AIAdapter

logger = logging.getLogger("ocr_service")


class OpenRouterAdapter(AIAdapter):
    def __init__(
        self,
        api_key: str | None = None,
        model_name: str | None = None,
        base_url: str | None = None,
        http_referer: str | None = None,
        title: str | None = None,
    ):
        self.api_key = (api_key or settings.OPENROUTER_API_KEY).strip()
        if not self.api_key:
            raise ValueError("OPENROUTER_API_KEY is not set in environment or .env file.")

        self.model_name = (model_name or settings.OPENROUTER_MODEL).strip()
        self.base_url = (base_url or settings.OPENROUTER_BASE_URL).rstrip("/")
        self.http_referer = (http_referer if http_referer is not None else settings.OPENROUTER_HTTP_REFERER).strip()
        self.title = (title if title is not None else settings.OPENROUTER_TITLE).strip()

        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        if self.http_referer:
            self.headers["HTTP-Referer"] = self.http_referer
        if self.title:
            self.headers["X-OpenRouter-Title"] = self.title

        logger.info(
            "OpenRouter adapter initialized base_url=%s model=%s referer_set=%s title_set=%s",
            self.base_url,
            self.model_name,
            bool(self.http_referer),
            bool(self.title),
        )

    @staticmethod
    def _extract_message_text(content: Any) -> str:
        if isinstance(content, str):
            return content.strip()

        if isinstance(content, list):
            parts: list[str] = []
            for chunk in content:
                if not isinstance(chunk, dict):
                    continue
                text_val = chunk.get("text") or chunk.get("output_text")
                if isinstance(text_val, str) and text_val.strip():
                    parts.append(text_val.strip())
            return "\n".join(parts).strip()

        return ""

    def _chat_with_retry(self, payload: dict[str, Any]) -> str:
        max_retries = 5
        base_delay = 2.0
        url = f"{self.base_url}/chat/completions"

        for attempt in range(max_retries):
            try:
                logger.debug("OpenRouter request attempt %s/%s model=%s", attempt + 1, max_retries, self.model_name)
                response = requests.post(
                    url,
                    headers=self.headers,
                    json=payload,
                    timeout=180,
                )

                if response.status_code in (429, 500, 502, 503, 504) and attempt < max_retries - 1:
                    delay = base_delay * (2 ** attempt)
                    logger.warning(
                        "OpenRouter transient error %s. Retrying in %.1fs (attempt %s/%s)",
                        response.status_code,
                        delay,
                        attempt + 1,
                        max_retries,
                    )
                    time.sleep(delay)
                    continue

                response.raise_for_status()
                data = response.json()
                choices = data.get("choices") or []
                if not choices:
                    logger.debug("OpenRouter response had no choices")
                    return ""

                message = (choices[0] or {}).get("message") or {}
                text = self._extract_message_text(message.get("content"))
                logger.debug("OpenRouter response parsed output_len=%s", len(text))
                return text

            except requests.RequestException as e:
                if attempt < max_retries - 1:
                    delay = base_delay * (2 ** attempt)
                    logger.warning(
                        "OpenRouter request failed (%s). Retrying in %.1fs (attempt %s/%s)",
                        e,
                        delay,
                        attempt + 1,
                        max_retries,
                    )
                    time.sleep(delay)
                    continue
                logger.error("OpenRouter request failed permanently: %s", e)
                raise

        return ""

    async def process_image(self, image: Image.Image, prompt: str) -> str:
        logger.debug(
            "OpenRouter process_image started model=%s prompt_len=%s image_size=%s",
            self.model_name,
            len(prompt or ""),
            image.size,
        )
        buffered = BytesIO()
        image.save(buffered, format="PNG")
        image_b64 = base64.b64encode(buffered.getvalue()).decode("ascii")

        payload: dict[str, Any] = {
            "model": self.model_name,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt,
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{image_b64}",
                            },
                        },
                    ],
                }
            ],
            "temperature": 0,
        }

        result = await asyncio.to_thread(self._chat_with_retry, payload)
        logger.debug("OpenRouter process_image completed output_len=%s", len(result))
        return result

    async def get_embedding(self, text: str) -> list[float]:
        logger.debug("OpenRouter embedding requested but disabled text_len=%s", len(text or ""))
        return []
