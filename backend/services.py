import os
import asyncio
from pdf2image import convert_from_path
from paddleocr import PaddleOCR
import cv2
import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models import Book, Page, OCRResult

# Initialize PaddleOCR
# We use Arabic language model for Mobile version
ocr = PaddleOCR(use_angle_cls=True, lang='ar', show_log=False)

def preprocess_image(image_path: str):
    # Load image using OpenCV
    img = cv2.imread(image_path)
    if img is None:
        return None
        
    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Adaptive thresholding for bad quality images
    # We can use simple thresholding or adaptive
    # CLAHE (Contrast Limited Adaptive Histogram Equalization)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    
    # We could do deskewing here, but PaddleOCR (use_angle_cls=True) handles it often
    
    # We save a temporary optimized image or pass original. 
    # PaddleOCR can take paths directly, or numpy arrays.
    # Returning the enhanced image array for OCR
    return enhanced

from database import AsyncSessionLocal

async def process_document_task(book_id: str):
    async with AsyncSessionLocal() as db:
        try:
            # Mark book as Processing
            book = await db.get(Book, book_id)
            if not book:
                return
            book.status = "Processing"
            await db.commit()
            
            # Get all pages for this book
            result = await db.execute(select(Page).where(Page.book_id == book_id).order_by(Page.page_number))
            pages = result.scalars().all()
            
            for page in pages:
                page.status = "Processing"
                await db.commit()
                
                # ... same OCR processing
                img_path = page.image_path
                
                # Preprocess image
                processed_img = preprocess_image(img_path)
                if processed_img is None:
                    processed_img = img_path
                    
                # Run OCR
                loop = asyncio.get_running_loop()
                ocr_result_raw = await loop.run_in_executor(None, ocr.ocr, processed_img, True)
                
                extracted_text = ""
                confidence_sum = 0
                word_count = 0
                
                if ocr_result_raw and ocr_result_raw[0]:
                    for line in ocr_result_raw[0]:
                        text, confidence = line[1]
                        extracted_text += text + "\n"
                        confidence_sum += confidence
                        word_count += 1
                
                avg_confidence = (confidence_sum / word_count) if word_count > 0 else 0
                
                # Save results
                ocr_record = OCRResult(
                    page_id=page.id,
                    extracted_text=extracted_text.strip(),
                    confidence_score=float(avg_confidence)
                )
                db.add(ocr_record)
                
                page.status = "Completed"
                await db.commit()
                
            # All pages processed, update book
            book.status = "Completed"
            await db.commit()
            
        except Exception as e:
            print(f"Error processing book {book_id}: {e}")
            book = await db.get(Book, book_id)
            if book:
                book.status = "Failed"
                await db.commit()

async def handle_pdf_upload(file_path: str, upload_dir: str):
    """
    Splits a PDF into images and saves them.
    Requires poppler installed on the system (e.g. via conda or downloading poppler for windows).
    """
    loop = asyncio.get_running_loop()
    # If poppler is not installed, this will throw an exception.
    # On Windows, you might need to pass `poppler_path=r'C:\path\to\poppler-xx\bin'`
    images = await loop.run_in_executor(None, convert_from_path, file_path)
    
    saved_paths = []
    base_name = os.path.basename(file_path).split('.')[0]
    book_folder = os.path.join(upload_dir, base_name)
    os.makedirs(book_folder, exist_ok=True)
    
    for i, image in enumerate(images):
        page_path = os.path.join(book_folder, f"page_{i+1}.png")
        # Save image synchronously in executor or directly (Pillow save is fast)
        image.save(page_path, "PNG")
        saved_paths.append(page_path)
        
    return saved_paths

