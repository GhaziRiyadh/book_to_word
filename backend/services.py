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
import pypdfium2 as pdfium
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from models import Book, Page, OCRResult
from database import AsyncSessionLocal
from core.config import settings

load_dotenv()

from adapters.factory import AdapterFactory
from adapters.hf_adapter import prefetch_huggingface_model
from utils.embeddings import get_local_embedding

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
_cancelled_book_ids: set[str] = set()

OCR_PROMPT_MODE_NORMAL = "normal"
OCR_PROMPT_MODE_FORMATTED = "formatted"


def request_book_stop(book_id: str) -> None:
    _cancelled_book_ids.add(book_id)


def clear_book_stop(book_id: str) -> None:
    _cancelled_book_ids.discard(book_id)


def is_book_stop_requested(book_id: str) -> bool:
    return book_id in _cancelled_book_ids


def _initialize_ai_adapter():
    global ai_adapter, _adapter_error
    provider = settings.AI_PROVIDER
    try:
        ai_adapter = AdapterFactory.get_adapter(provider=provider)
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
    provider = settings.AI_PROVIDER.lower()

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


async def check_semantic_readiness():
    """
    Scans the database at startup to report on and repair semantic search completeness.
    """
    logger.info("Starting Semantic Readiness Check...")
    try:
        async with AsyncSessionLocal() as db:
            # Count total pages that have OCR results
            total_res = await db.execute(select(func.count(OCRResult.id)))
            total_count = total_res.scalar() or 0

            # Find pages that have OCR text but NO embedding vector
            missing_query = await db.execute(
                select(OCRResult)
                .where(OCRResult.extracted_text != None)
                .where(OCRResult.embedding == None)
            )
            missing_records = missing_query.scalars().all()
            missing_count = len(missing_records)

            ready_count = total_count - missing_count
            
            if total_count == 0:
                logger.info("Semantic Check: No book data found yet.")
                return

            if missing_count > 0:
                logger.warning(
                    "Semantic Check: %d/%d pages ready for search. %d pages are missing embeddings. Starting repair...",
                    ready_count, total_count, missing_count
                )
                
                # Automatically generate missing embeddings
                repaired = 0
                for ocr in missing_records:
                    if ocr.extracted_text:
                        try:
                            # Use local embedding logic to minimize external API calls/latency
                            embedding_vector = await asyncio.to_thread(get_local_embedding, ocr.extracted_text)
                            if embedding_vector:
                                ocr.embedding = np.array(embedding_vector, dtype='float32').tobytes()
                                repaired += 1
                                # Log progress periodically for large repairs
                                if repaired % 10 == 0 or repaired == missing_count:
                                    logger.info("Repair Progress: %d/%d embeddings generated...", repaired, missing_count)
                        except Exception as repair_err:
                            logger.error("Failed to repair embedding for Result ID %s: %s", ocr.id, repair_err)
                
                if repaired > 0:
                    await db.commit()
                    logger.info("Semantic Repair Complete: %d embeddings generated and saved.", repaired)
            else:
                logger.info("Semantic Check: All %d pages are ready for search.", total_count)
                
    except Exception as e:
        logger.error("Failed to perform semantic readiness check/repair: %s", e)


async def process_uploaded_book(book_id: str, source_paths: list[str], prompt_mode: str | None = None):
    """
    Materialize uploaded files into page records and then run OCR in the background.
    """
    try:
        if is_book_stop_requested(book_id):
            logger.info("Upload processing skipped because stop was requested for book %s.", book_id)
            return

        async with AsyncSessionLocal() as db:
            book = await db.get(Book, book_id)
            if not book:
                logger.error("Uploaded book %s not found.", book_id)
                return

            book.status = "Processing"
            await db.commit()

            if len(source_paths) == 1 and source_paths[0].lower().endswith(".pdf"):
                saved_paths = await handle_pdf_upload(source_paths[0], settings.UPLOAD_DIR)
            else:
                saved_paths = [path for path in source_paths if os.path.exists(path)]

            if is_book_stop_requested(book_id):
                book.status = "Stopped"
                await db.commit()
                return

            if not saved_paths:
                logger.error("No pages could be created for uploaded book %s.", book_id)
                book.status = "Failed"
                await db.commit()
                return

            for i, path in enumerate(saved_paths):
                db.add(Page(book_id=book_id, page_number=i + 1, image_path=path))

            await db.commit()

        await process_document_task(book_id, prompt_mode=prompt_mode)
    except Exception as e:
        logger.error("Failed to process uploaded book %s: %s", book_id, e)
        async with AsyncSessionLocal() as fail_db:
            book = await fail_db.get(Book, book_id)
            if book:
                book.status = "Failed"
                await fail_db.commit()


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
    
    # Generate embedding for semantic search using local model (priority)
    embedding_vector = []
    if extracted_text:
        try:
            # Use local embedding instead of adapter's to ensure reliability
            embedding_vector = await asyncio.to_thread(get_local_embedding, extracted_text)
            if not embedding_vector:
                # Fallback if local fails (optional)
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

            if is_book_stop_requested(book_id):
                book.status = "Stopped"
                await db.commit()
                logger.info("Stopping OCR task before start for book %s.", book_id)
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
                    if is_book_stop_requested(book_id):
                        book.status = "Stopped"
                        await db.commit()
                        logger.info("Stopping OCR task for book %s before page %s.", book_id, page.page_number)
                        return

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

            if is_book_stop_requested(book_id):
                book.status = "Stopped"
            else:
                book.status = "Completed"
            await db.commit()
            logger.info(f"Completed OCR task for book: {book_id}")

    except Exception as e:
        logger.error(f"Critical error processing book {book_id}: {e}\n{traceback.format_exc()}")
        async with AsyncSessionLocal() as fail_db:
            book = await fail_db.get(Book, book_id)
            if book:
                book.status = "Stopped" if is_book_stop_requested(book_id) else "Failed"
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
    saved_paths = []
    book_folder = os.path.dirname(file_path)

    try:
        loop = asyncio.get_running_loop()

        def _convert_with_poppler():
            kwargs = {"poppler_path": POPPLER_PATH} if POPPLER_PATH else {}
            return convert_from_path(file_path, **kwargs)

        images = await loop.run_in_executor(None, _convert_with_poppler)

        for i, image in enumerate(images):
            page_path = os.path.join(book_folder, f"page_{i+1:03d}.png")
            image.save(page_path, "PNG")
            saved_paths.append(page_path)

        return saved_paths
    except Exception as poppler_error:
        logger.warning("Poppler PDF conversion failed for %s, using pypdfium2 fallback: %s", file_path, poppler_error)

    try:
        document = pdfium.PdfDocument(file_path)
        for i in range(len(document)):
            page = document[i]
            bitmap = page.render(scale=2)
            image = bitmap.to_pil()
            page_path = os.path.join(book_folder, f"page_{i+1:03d}.png")
            image.save(page_path, "PNG")
            saved_paths.append(page_path)

        return saved_paths
    except Exception as fallback_error:
        logger.error("PDF conversion failed for %s using both Poppler and pypdfium2: %s", file_path, fallback_error)
        raise