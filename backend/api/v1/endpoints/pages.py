from fastapi import APIRouter, Depends, Form, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_async_db
from models import Book, Page, OCRResult

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
    
    ocr_res = await db.execute(select(OCRResult).where(OCRResult.page_id == page_id))
    ocr_data = ocr_res.scalar_one_or_none()
    
    if not ocr_data:
        ocr_data = OCRResult(page_id=page_id, extracted_text=extracted_text)
        db.add(ocr_data)
    else:
        ocr_data.extracted_text = extracted_text
    
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
