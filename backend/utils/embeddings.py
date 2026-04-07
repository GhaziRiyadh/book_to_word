import torch
from transformers import AutoTokenizer, AutoModel
import torch.nn.functional as F
import logging

logger = logging.getLogger("ocr_service")

# Use a small, efficient model for local embeddings
MODEL_ID = "sentence-transformers/all-MiniLM-L6-v2"

# Global cache for model and tokenizer to avoid re-loading on every request
_model = None
_tokenizer = None
_device = "cuda" if torch.cuda.is_available() else "cpu"

def _load_model():
    global _model, _tokenizer
    if _model is None or _tokenizer is None:
        logger.info(f"Loading local embedding model: {MODEL_ID} on {_device}")
        _tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
        _model = AutoModel.from_pretrained(MODEL_ID).to(_device)
        _model.eval()
    return _tokenizer, _model

def get_local_embedding(text: str) -> list[float]:
    """
    Generates a 384-dimensional embedding vector locally using Transformers.
    """
    if not text or not text.strip():
        return []

    try:
        tokenizer, model = _load_model()
        
        # Tokenize and move to device
        inputs = tokenizer(text, padding=True, truncation=True, return_tensors="pt", max_length=512).to(_device)
        
        with torch.no_grad():
            outputs = model(**inputs)
            
        # Perform mean pooling to get sentence-level embedding
        # Model output is (batch_size, sequence_length, hidden_size)
        attention_mask = inputs['attention_mask']
        token_embeddings = outputs.last_hidden_state
        
        input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
        sum_embeddings = torch.sum(token_embeddings * input_mask_expanded, 1)
        sum_mask = torch.clamp(input_mask_expanded.sum(1), min=1e-9)
        sentence_embeddings = sum_embeddings / sum_mask
        
        # Normalize embeddings
        sentence_embeddings = F.normalize(sentence_embeddings, p=2, dim=1)
        
        return sentence_embeddings[0].tolist()
    except Exception as e:
        logger.error(f"Local embedding generation failed: {e}")
        return []
