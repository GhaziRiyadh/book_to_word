import torch
import logging
from PIL import Image
from transformers import MllamaForConditionalGeneration, AutoProcessor, BitsAndBytesConfig
from .base import AIAdapter

logger = logging.getLogger("ocr_service")

class HuggingFaceAdapter(AIAdapter):
    def __init__(self, model_id: str = "meta-llama/Llama-3.2-11B-Vision-Instruct"):
        """
        Initializes the Llama-3.2-Vision model with 4-bit quantization.
        Llama-3.2 Vision doesn't strictly depend on sentencepiece (uses tiktoken).
        """
        self.model_id = model_id
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        
        logger.info(f"Loading Local Vision Model: {model_id} on {self.device}...")
        
        try:
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
                device_map="auto"
            )
            self.processor = AutoProcessor.from_pretrained(model_id)
            
            logger.info(f"Model {model_id} loaded successfully in 4-bit.")
        except Exception as e:
            logger.error(f"Failed to load HuggingFace model: {e}")
            raise

    async def process_image(self, image: Image.Image, prompt: str) -> str:
        """
        Processes an image using the local Llama-3.2-Vision model.
        """
        try:
            # Prepare inputs
            inputs = self.processor(image, prompt, return_tensors="pt").to(self.model.device)
            
            # Generate
            output = self.model.generate(
                **inputs,
                max_new_tokens=1024,
                do_sample=False
            )
            
            # Decode - remove the prompt part from the output
            prompt_len = inputs.input_ids.shape[1]
            generated_text = self.processor.decode(output[0][prompt_len:], skip_special_tokens=True)
            
            return generated_text.strip()
            
        except Exception as e:
            logger.error(f"Llama-Vision Processing Error: {e}")
            return ""

    async def get_embedding(self, text: str) -> list[float]:
        # Return empty list as embedding with large vision models is computationally expensive
        return []
