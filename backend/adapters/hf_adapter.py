import asyncio
from typing import Any, cast
import torch
import logging
from PIL import Image
from huggingface_hub import snapshot_download
from transformers import MllamaForConditionalGeneration, AutoProcessor, BitsAndBytesConfig
from .base import AIAdapter

logger = logging.getLogger("ocr_service")


def prefetch_huggingface_model(
    model_id: str,
    token: str | None = None,
    local_files_only: bool = True,
) -> str:
    """
    Ensure model files are present locally. This can run before adapter init
    to warm the cache and surface auth/network issues early.
    """
    try:
        logger.debug(
            "HuggingFace prefetch started model_id=%s local_files_only=%s token_set=%s",
            model_id,
            local_files_only,
            bool(token),
        )
        cache_path = snapshot_download(
            repo_id=model_id,
            token=token,
            local_files_only=local_files_only,
        )
        logger.info("HuggingFace model prefetched successfully: %s", model_id)
        return cache_path
    except Exception as e:
        logger.error("Failed to prefetch HuggingFace model '%s': %s", model_id, e)
        raise

class HuggingFaceAdapter(AIAdapter):
    def __init__(
        self,
        model_id: str = "meta-llama/Llama-3.2-11B-Vision-Instruct",
        token: str | None = None,
        offline_mode: bool = True,
        allow_cpu_fallback: bool = True,
    ):
        """
        Initializes the Llama-3.2-Vision model with 4-bit quantization.
        Llama-3.2 Vision doesn't strictly depend on sentencepiece (uses tiktoken).
        """
        self.model_id = model_id
        self.token = token
        self.offline_mode = offline_mode
        self.allow_cpu_fallback = allow_cpu_fallback
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        
        logger.info(
            "Loading HuggingFace vision model '%s' on %s (offline_mode=%s)...",
            model_id,
            self.device,
            self.offline_mode,
        )
        
        try:
            if self.device == "cuda":
                bnb_config = BitsAndBytesConfig(
                    load_in_4bit=True,
                    bnb_4bit_compute_dtype=torch.float16,
                    bnb_4bit_quant_type="nf4",
                    bnb_4bit_use_double_quant=True,
                )
                self.model = MllamaForConditionalGeneration.from_pretrained(
                    model_id,
                    torch_dtype=torch.float16,
                    quantization_config=bnb_config,
                    device_map="auto",
                    token=self.token,
                    local_files_only=self.offline_mode,
                )
                logger.info("Loaded HuggingFace model with CUDA 4-bit quantization.")
            else:
                if not self.allow_cpu_fallback:
                    raise RuntimeError(
                        "HuggingFace provider requires CUDA for this model and CPU fallback is disabled. "
                        "Enable HF_ALLOW_CPU_FALLBACK=true or switch AI_PROVIDER."
                    )

                logger.warning(
                    "CUDA is unavailable. Falling back to CPU model loading; this may be very slow and memory intensive."
                )
                self.model = MllamaForConditionalGeneration.from_pretrained(
                    model_id,
                    torch_dtype=torch.float32,
                    device_map="cpu",
                    token=self.token,
                    low_cpu_mem_usage=True,
                    local_files_only=self.offline_mode,
                )

            self.processor = AutoProcessor.from_pretrained(
                model_id,
                token=self.token,
                local_files_only=self.offline_mode,
            )
            
            logger.info(f"Model {model_id} loaded successfully.")
            logger.debug(
                "HuggingFaceAdapter init model_id=%s token_set=%s allow_cpu_fallback=%s",
                self.model_id,
                bool(self.token),
                self.allow_cpu_fallback,
            )
        except Exception as e:
            logger.error(
                "Failed to load HuggingFace model '%s'. Ensure you have model access, "
                "CUDA runtime support, and compatible torch/bitsandbytes versions. "
                "If offline_mode=true, ensure model files already exist locally in the HuggingFace cache. Error: %s",
                model_id,
                e,
            )
            raise

    async def process_image(self, image: Image.Image, prompt: str) -> str:
        """
        Processes an image using the local Llama-3.2-Vision model.
        """
        try:
            logger.debug(
                "HuggingFace process_image started model=%s prompt_len=%s image_size=%s",
                self.model_id,
                len(prompt or ""),
                image.size,
            )
            def _generate_sync() -> str:
                # Keep heavy model inference off the event loop thread.
                inputs = self.processor(image, prompt, return_tensors="pt").to(self.model.device)
                output = cast(Any, self.model).generate(
                    **inputs,
                    max_new_tokens=1024,
                    do_sample=False
                )
                prompt_len = inputs.input_ids.shape[1]
                generated_text = self.processor.decode(output[0][prompt_len:], skip_special_tokens=True)
                return generated_text.strip()

            result = await asyncio.to_thread(_generate_sync)
            logger.debug("HuggingFace process_image completed output_len=%s", len(result))
            return result
            
        except Exception as e:
            logger.error(f"Llama-Vision Processing Error: {e}")
            return ""

    async def get_embedding(self, text: str) -> list[float]:
        # Return empty list as embedding with large vision models is computationally expensive
        logger.debug("HuggingFace embedding requested but disabled text_len=%s", len(text or ""))
        return []
