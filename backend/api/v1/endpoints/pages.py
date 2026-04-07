from fastapi import APIRouter, Depends, Form, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_async_db
from models import Book, Page, OCRResult
from core.config import settings
from utils.embeddings import get_local_embedding
import asyncio
import numpy as np
import datetime

router = APIRouter()

@router.put("/{page_id}/ocr")
async def update_page_ocr(
    page_id: str,
    extracted_text: str = Form(...),
    status: str = Form("Published"),
    db: AsyncSession = Depends(get_async_db)
):
    page = await db.get(Page, page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    
    ocr_res = await db.execute(
        select(OCRResult)
        .where(OCRResult.page_id == page_id)
        .order_by(OCRResult.created_at.desc())
    )
    ocr_data = ocr_res.scalars().first()
    
    if not ocr_data:
        ocr_data = OCRResult(page_id=page_id, extracted_text=extracted_text)
        db.add(ocr_data)
    else:
        ocr_data.extracted_text = extracted_text
        ocr_data.created_at = datetime.datetime.utcnow()

    # Continuous Indexing: Update embedding for the new text
    try:
        embedding_vector = await asyncio.to_thread(get_local_embedding, extracted_text)
        if embedding_vector:
            ocr_data.embedding = np.array(embedding_vector, dtype='float32').tobytes()
    except Exception as e:
        print(f"Error updating embedding in manual edit: {e}")
    
    page.status = status
    await db.commit()
    
    # Check if all pages are Published/Completed to update book status
    book_id = page.book_id
    result = await db.execute(select(Page).where(Page.book_id == book_id))
    all_pages = result.scalars().all()
    if all(p.status in ["Completed", "Published"] for p in all_pages):
        book = await db.get(Book, book_id)
        if book:
            book.status = "Completed"
            await db.commit()

    return {"message": "OCR updated successfully", "status": page.status}

@router.post("/{page_id}/process")
async def reprocess_page(
    page_id: str,
    prompt_mode: str | None = Query(None, description="OCR prompt mode override: normal or formatted"),
    db: AsyncSession = Depends(get_async_db)
):
    from services import process_single_page_task
    page = await db.get(Page, page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    if page.status == "Published":
        return {
            "message": "Page is published and was skipped",
            "status": page.status,
        }

    # Frontend orchestrates execution; this endpoint runs immediately.
    book = await db.get(Book, page.book_id)
    if book and book.status != "Processing":
        book.status = "Processing"
        await db.commit()

    await process_single_page_task(page_id, prompt_mode=prompt_mode)

    result = await db.execute(select(Page).where(Page.book_id == page.book_id))
    all_pages = result.scalars().all()
    if book and all(p.status in ["Completed", "Published"] for p in all_pages):
        book.status = "Completed"
        await db.commit()

    refreshed_page = await db.get(Page, page_id)
    return {
        "message": "Page reprocessing completed",
        "prompt_mode": prompt_mode or settings.OCR_PROMPT_MODE,
        "status": refreshed_page.status if refreshed_page else "Completed",
    }
