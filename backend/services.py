import os
import logging
import asyncio
import threading
import traceback
import datetime
import re
import numpy as np
from dotenv import load_dotenv
from pdf2image import convert_from_path
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models import Book, Page, OCRResult
from database import AsyncSessionLocal
from core.config import settings

load_dotenv()

from adapters.factory import AdapterFactory
from adapters.hf_adapter import prefetch_huggingface_model

load_dotenv()

POPPLER_PATH = os.getenv("POPPLER_PATH", None)

# Configure logging
_log_level_name = (settings.LOG_LEVEL or "INFO").upper()
_log_level = getattr(logging, _log_level_name, logging.INFO)

logging.basicConfig(
    level=_log_level,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("backend_ocr.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("ocr_service")
logger.info("Logger initialized with LOG_LEVEL=%s", _log_level_name)

ai_adapter = None
_adapter_error = None
_adapter_init_lock = asyncio.Lock()
_adapter_init_sync_lock = threading.Lock()
_hf_prefetch_attempted = False

OCR_PROMPT_MODE_NORMAL = "normal"
OCR_PROMPT_MODE_FORMATTED = "formatted"


def _initialize_ai_adapter():
    global ai_adapter, _adapter_error
    provider = os.getenv("AI_PROVIDER", "gemini")
    try:
        ai_adapter = AdapterFactory.get_adapter()
        _adapter_error = None
        logger.info(f"AI Adapter ({provider}) configured successfully.")
    except Exception as e:
        ai_adapter = None
        _adapter_error = str(e)
        logger.critical(f"Failed to initialize AI Adapter ({provider}): {_adapter_error}")


async def _ensure_ai_adapter_ready() -> bool:
    global ai_adapter
    if ai_adapter is not None:
        return True

    async with _adapter_init_lock:
        # Another coroutine might have initialized while waiting.
        if ai_adapter is not None:
            return True
        _initialize_ai_adapter()
        return ai_adapter is not None


def get_adapter_health() -> dict:
    global _hf_prefetch_attempted
    provider = os.getenv("AI_PROVIDER", "gemini").lower()

    # Health checks proactively verify HuggingFace model availability and
    # initialization state before OCR tasks are queued.
    if provider == "huggingface" and ai_adapter is None:
        with _adapter_init_sync_lock:
            if not _hf_prefetch_attempted:
                _hf_prefetch_attempted = True
                try:
                    token = None if settings.HF_OFFLINE_MODE else (settings.HF_TOKEN or None)
                    prefetch_huggingface_model(
                        settings.HF_MODEL_ID,
                        token=token,
                        local_files_only=settings.HF_OFFLINE_MODE,
                    )
                except Exception as prefetch_error:
                    logger.error("HuggingFace model prefetch failed during health check: %s", prefetch_error)

            if ai_adapter is None:
                logger.info("Health check requested. Attempting HuggingFace adapter initialization.")
                _initialize_ai_adapter()

    return {
        "provider": provider,
        "ready": ai_adapter is not None,
        "last_error": _adapter_error,
    }


# Initialize once on import; tasks can still retry if startup initialization fails.
_initialize_ai_adapter()

NORMAL_EXTRACT_PROMPT = (
    "استخرج النص العربي من هذه الصورة كما هو فقط. "
    "لا تقم بإعادة الصياغة أو التلخيص أو الشرح. "
    "حافظ على ترتيب الأسطر والفقرات قدر الإمكان. "
    "أخرج النص كنص عادي فقط بدون أي وسوم HTML أو Markdown أو كتل كود."
)

FORMATTED_HTML_PROMPT = (
    "استخرج النص العربي من هذه الصورة بدقة تامة وحوله إلى تنسيق HTML نظيف ومبسط. "
    "استخدم وسوم HTML مثل <h1> للعناوين الكبيرة، <h2> للعناوين الفرعية، <p> للفقرات، <b> للكلمات المهمة، "
    "و <ul><li> للقوائم إن وجدت. "
    "حافظ على هيكلية النص الأساسية كما هي في الصورة. "
    "الرجاء إرجاع كود HTML الخاص بالمحتوى فقط، بدون وسوم <html> أو <body> أو ```html."
)


def resolve_prompt_mode(prompt_mode: str | None) -> str:
    mode = (prompt_mode or settings.OCR_PROMPT_MODE or OCR_PROMPT_MODE_FORMATTED).lower().strip()
    if mode in {OCR_PROMPT_MODE_NORMAL, OCR_PROMPT_MODE_FORMATTED}:
        return mode

    logger.warning(
        "Unknown OCR prompt mode '%s' (requested/default). Falling back to '%s'.",
        mode,
        OCR_PROMPT_MODE_FORMATTED,
    )
    return OCR_PROMPT_MODE_FORMATTED


def get_ocr_prompt(prompt_mode: str | None) -> str:
    mode = resolve_prompt_mode(prompt_mode)
    if mode == OCR_PROMPT_MODE_NORMAL:
        return NORMAL_EXTRACT_PROMPT
    if mode == OCR_PROMPT_MODE_FORMATTED:
        return FORMATTED_HTML_PROMPT
    return FORMATTED_HTML_PROMPT

async def _process_single_page_internal(db: AsyncSession, page: Page, ai_adapter, prompt: str):
    """
    Internal unit for processing a single page OCR.
    Handles extraction, embedding generation, and database updates.
    """
    img_path = str(page.image_path)
    if not os.path.exists(img_path):
        raise FileNotFoundError(f"Image not found at {img_path}")

    logger.info(f"Ocr processing internal for page ID: {page.id}, path: {img_path}")
    img = Image.open(img_path)

    # Use the adapter to process the image
    extracted_text = await ai_adapter.process_image(img, prompt)
    
    # Clean up any markdown formatting the model may return
    if extracted_text:
        extracted_text = re.sub(r'^```(?:html|markdown|text|arabic)?\s*', '', extracted_text.strip(), flags=re.IGNORECASE | re.MULTILINE)
        extracted_text = re.sub(r'\s*```\s*$', '', extracted_text, flags=re.MULTILINE)
        extracted_text = re.sub(r'^#{1,6}\s+', '', extracted_text, flags=re.MULTILINE)
        extracted_text = re.sub(r'^---+\s*$', '', extracted_text, flags=re.MULTILINE)
        extracted_text = extracted_text.strip()
    
    confidence = 1.0 if extracted_text else 0.0
    
    # Generate embedding for semantic search
    embedding_vector = []
    if extracted_text:
        try:
            embedding_vector = await ai_adapter.get_embedding(extracted_text)
        except Exception as ee:
            logger.error(f"Embedding generation failed for page {page.id}: {ee}")
    
    embedding_binary = np.array(embedding_vector, dtype='float32').tobytes() if embedding_vector else None

    # Upsert OCR result
    res = await db.execute(
        select(OCRResult)
        .where(OCRResult.page_id == page.id)
        .order_by(OCRResult.created_at.desc())
    )
    ocr_record = res.scalars().first()
    
    if ocr_record:
        ocr_record.extracted_text = extracted_text
        ocr_record.confidence_score = confidence
        ocr_record.embedding = embedding_binary
        ocr_record.created_at = datetime.datetime.utcnow()
    else:
        ocr_record = OCRResult(
            page_id=page.id,
            extracted_text=extracted_text,
            confidence_score=confidence,
            embedding=embedding_binary
        )
        db.add(ocr_record)

    page.status = "Completed"
    await db.commit()
    return ocr_record

async def process_document_task(book_id: str, prompt_mode: str | None = None):
    """
    Background task to process all pages of a book.
    """
    adapter_ready = await _ensure_ai_adapter_ready()
    if not adapter_ready:
        reason = _adapter_error or "Unknown adapter initialization error"
        logger.error(f"AI Adapter not initialized. Cannot process task. Reason: {reason}")
        async with AsyncSessionLocal() as fail_db:
            book = await fail_db.get(Book, book_id)
            if book:
                book.status = "Failed"
                await fail_db.commit()
        return

    effective_prompt_mode = resolve_prompt_mode(prompt_mode)
    logger.info("Starting OCR task for book ID: %s with prompt_mode=%s", book_id, effective_prompt_mode)
    
    try:
        async with AsyncSessionLocal() as db:
            book = await db.get(Book, book_id)
            if not book:
                logger.error(f"Book {book_id} not found.")
                return
            
            book.status = "Processing"
            await db.commit()

            result = await db.execute(
                select(Page).where(Page.book_id == book_id).order_by(Page.page_number)
            )
            pages = result.scalars().all()
            pages_to_process = [p for p in pages if p.status != "Published"]
            selected_prompt = get_ocr_prompt(effective_prompt_mode)

            if not pages_to_process:
                logger.info("No OCR work required for book %s: all pages are already Published.", book_id)
                book.status = "Completed"
                await db.commit()
                return

            for page in pages_to_process:
                try:
                    page.status = "Processing"
                    await db.commit()
                    
                    await _process_single_page_internal(db, page, ai_adapter, selected_prompt)
                    
                    # Rate limiting delay
                    await asyncio.sleep(5) 
                except Exception as pe:
                    logger.error(f"Error processing page {page.page_number}: {pe}")
                    page.status = "Failed"
                    await db.commit()
                    continue 

            book.status = "Completed"
            await db.commit()
            logger.info(f"Completed OCR task for book: {book_id}")

    except Exception as e:
        logger.error(f"Critical error processing book {book_id}: {e}\n{traceback.format_exc()}")
        async with AsyncSessionLocal() as fail_db:
            book = await fail_db.get(Book, book_id)
            if book:
                book.status = "Failed"
                await fail_db.commit()

async def process_single_page_task(page_id: str, prompt_mode: str | None = None):
    """
    Background task to re-process a single page.
    """
    adapter_ready = await _ensure_ai_adapter_ready()
    if not adapter_ready:
        reason = _adapter_error or "Unknown adapter initialization error"
        logger.error(f"AI Adapter not initialized. Cannot process page. Reason: {reason}")
        async with AsyncSessionLocal() as fail_db:
            page = await fail_db.get(Page, page_id)
            if page:
                page.status = "Failed"
                await fail_db.commit()
        return

    effective_prompt_mode = resolve_prompt_mode(prompt_mode)
    logger.info("Starting single-page OCR task for ID: %s with prompt_mode=%s", page_id, effective_prompt_mode)
    
    try:
        async with AsyncSessionLocal() as db:
            page = await db.get(Page, page_id)
            if not page:
                logger.error(f"Page {page_id} not found.")
                return

            if page.status == "Published":
                logger.info("Skipping OCR for published page: %s", page_id)
                return
            
            page.status = "Processing"
            await db.commit()

            selected_prompt = get_ocr_prompt(effective_prompt_mode)
            await _process_single_page_internal(db, page, ai_adapter, selected_prompt)
            logger.info(f"Successfully re-processed page: {page_id}")
            
    except Exception as e:
        logger.error(f"Error re-processing page {page_id}: {e}")
        async with AsyncSessionLocal() as fail_db:
            p = await fail_db.get(Page, page_id)
            if p:
                p.status = "Failed"
                await fail_db.commit()

async def handle_pdf_upload(file_path: str, upload_dir: str):
    """
    Splits a PDF into images and saves them asynchronously.
    """
    logger.info(f"Converting PDF to images: {file_path}")
    loop = asyncio.get_running_loop()
    
    def _convert():
        kwargs = {"poppler_path": POPPLER_PATH} if POPPLER_PATH else {}
        return convert_from_path(file_path, **kwargs)
    
    images = await loop.run_in_executor(None, _convert)
    saved_paths = []
    book_folder = os.path.dirname(file_path)
    
    for i, image in enumerate(images):
        page_path = os.path.join(book_folder, f"page_{i+1:03d}.png")
        image.save(page_path, "PNG")
        saved_paths.append(page_path)
        
    return saved_paths