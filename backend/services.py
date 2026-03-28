import os
import logging
import asyncio
import traceback
import aiofiles
from dotenv import load_dotenv
from pdf2image import convert_from_path
import google.generativeai as genai
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models import Book, Page, OCRResult
from database import AsyncSessionLocal

load_dotenv()

from adapters.factory import AdapterFactory

load_dotenv()

POPPLER_PATH = os.getenv("POPPLER_PATH", None)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("backend_ocr.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("ocr_service")

# Initialize AI Adapter via Factory
try:
    ai_adapter = AdapterFactory.get_adapter()
    logger.info(f"AI Adapter ({os.getenv('AI_PROVIDER', 'gemini')}) configured successfully.")
except Exception as e:
    logger.critical(f"Failed to initialize AI Adapter: {e}")
    ai_adapter = None


async def process_document_task(book_id: str):
    """
    Background task to process all pages of a book using the configured AI provider.
    """
    if not ai_adapter:
        logger.error("AI Adapter not initialized. Cannot process task.")
        return

    logger.info(f"Starting OCR task for book ID: {book_id}")
    
    try:
        async with AsyncSessionLocal() as db:
            book = await db.get(Book, book_id)
            if not book:
                logger.error(f"Book {book_id} not found in database.")
                return
            
            book.status = "Processing"
            await db.commit()

            result = await db.execute(
                select(Page).where(Page.book_id == book_id).order_by(Page.page_number)
            )
            pages = result.scalars().all()

            prompt = (
                "استخرج النص العربي من هذه الصورة بدقة تامة وحوله إلى تنسيق HTML نظيف ومبسط. "
                "استخدم وسوم HTML مثل <h1> للعناوين الكبيرة، <h2> للعناوين الفرعية، <p> للفقرات، <b> للكلمات المهمة، "
                "و <ul><li> للقوائم إن وجدت. "
                "حافظ على هيكلية النص الأساسية كما هي في الصورة. "
                "الرجاء إرجاع كود HTML الخاص بالمحتوى فقط، بدون وسوم <html> أو <body> أو ```html."
            )

            for page in pages:
                try:
                    page.status = "Processing"
                    await db.commit()

                    img_path = str(page.image_path)
                    if not os.path.exists(img_path):
                        raise FileNotFoundError(f"Image not found at {img_path}")

                    logger.info(f"Processing page {page.page_number}/{len(pages)}: {img_path}")

                    img = Image.open(img_path)

                    # Use the adapter to process the image
                    extracted_text = await ai_adapter.process_image(img, prompt)
                    
                    confidence = 1.0 if extracted_text else 0.0

                    ocr_record = OCRResult(
                        page_id=page.id,
                        extracted_text=extracted_text,
                        confidence_score=confidence
                    )
                    db.add(ocr_record)

                    page.status = "Completed"
                    await db.commit()

                    # Rate limiting delay - increased for stability
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
        error_msg = traceback.format_exc()
        logger.error(f"Critical error processing book {book_id}: {e}\n{error_msg}")
        
        try:
            async with AsyncSessionLocal() as fail_db:
                book = await fail_db.get(Book, book_id)
                if book:
                    book.status = "Failed"
                    await fail_db.commit()
        except Exception as fe:
            logger.error(f"Failed to update book status to Failed: {fe}")

async def handle_pdf_upload(file_path: str, upload_dir: str):
    """
    Splits a PDF into images and saves them asynchronously.
    """
    logger.info(f"Converting PDF to images: {file_path}")
    loop = asyncio.get_running_loop()
    
    def _convert():
        kwargs = {"poppler_path": POPPLER_PATH} if POPPLER_PATH else {}
        return convert_from_path(file_path, **kwargs)
    
    try:
        images = await loop.run_in_executor(None, _convert)
    except Exception as e:
        logger.error(f"PDF conversion failed: {e}")
        raise

    saved_paths = []
    base_name = os.path.basename(file_path).split('.')[0]
    book_folder = os.path.dirname(file_path)
    
    for i, image in enumerate(images):
        page_path = os.path.join(book_folder, f"page_{i+1:03d}.png")
        image.save(page_path, "PNG")
        saved_paths.append(page_path)
        
    logger.info(f"Successfully converted PDF into {len(saved_paths)} images.")
    return saved_paths