from fastapi import APIRouter, Depends, UploadFile, File, Form, BackgroundTasks, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
import os
import aiofiles
import numpy as np

from database import get_async_db
from models import Book, Page, OCRResult
from services import handle_pdf_upload, process_document_task
from adapters.factory import AdapterFactory
from utils.math import cosine_similarity
from core.config import settings

router = APIRouter()

@router.get("/")
async def get_all_books(db: AsyncSession = Depends(get_async_db)):
    result = await db.execute(select(Book).order_by(Book.created_at.desc()))
    books = result.scalars().all()
    return {"books": [{"id": b.id, "title": b.title, "status": b.status, "created_at": b.created_at} for b in books]}

@router.post("/upload")
async def upload_book(
    title: str = Form(...),
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_async_db)
):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
        
    book = Book(title=title)
    db.add(book)
    await db.commit()
    await db.refresh(book)
    
    book_folder = os.path.join(settings.UPLOAD_DIR, book.id)
    os.makedirs(book_folder, exist_ok=True)
    
    saved_paths = []
    
    # Check if single PDF
    if len(files) == 1 and files[0].filename.endswith(".pdf"):
        pdf_path = os.path.join(book_folder, files[0].filename)
        async with aiofiles.open(pdf_path, 'wb') as out_file:
            content = await files[0].read()
            await out_file.write(content)
        try:
            saved_paths = await handle_pdf_upload(pdf_path, settings.UPLOAD_DIR)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"PDF conversion failed: {str(e)}")
    else:
        # Multiple images
        for idx, file in enumerate(files):
            file_path = os.path.join(book_folder, file.filename)
            async with aiofiles.open(file_path, 'wb') as out_file:
                content = await file.read()
                await out_file.write(content)
            saved_paths.append(file_path)
            
    # Create Page records
    for i, path in enumerate(saved_paths):
        page = Page(book_id=book.id, page_number=i+1, image_path=path)
        db.add(page)
        
    await db.commit()
    return {"message": "Files received successfully", "book_id": book.id, "pages_count": len(saved_paths)}

@router.post("/{book_id}/process")
async def process_book(
    book_id: str,
    background_tasks: BackgroundTasks,
    background: bool = Query(False),
    db: AsyncSession = Depends(get_async_db),
):
    book = await db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    if background:
        background_tasks.add_task(process_document_task, book_id)
        return {"message": "Processing started in background", "book_id": book_id, "background": True}

    await process_document_task(book_id)
    return {"message": "Processing completed", "book_id": book_id, "background": False}

@router.get("/{book_id}/status")
async def get_book_status(book_id: str, db: AsyncSession = Depends(get_async_db)):
    book = await db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
        
    result = await db.execute(select(Page).where(Page.book_id == book_id))
    pages = result.scalars().all()
    
    completed = sum(1 for p in pages if p.status in ["Completed", "Published"])
    total = len(pages)
    progress_percent = (completed / total * 100) if total > 0 else 0
    
    pages_status = [{"page_number": p.page_number, "status": p.status, "id": p.id} for p in pages]
    
    return {
        "status": book.status,
        "title": book.title,
        "progress": f"{completed}/{total}",
        "progress_percent": progress_percent,
        "pages": pages_status
    }

@router.get("/{book_id}/results")
async def get_book_results(book_id: str, db: AsyncSession = Depends(get_async_db)):
    result = await db.execute(select(Page).where(Page.book_id == book_id).order_by(Page.page_number))
    pages = result.scalars().all()
    
    results = []
    for page in pages:
        ocr_res = await db.execute(
            select(OCRResult)
            .where(OCRResult.page_id == page.id)
            .order_by(OCRResult.created_at.desc())
        )
        ocr_data = ocr_res.scalars().first()
        text = ocr_data.extracted_text if ocr_data else ""
        confidence = ocr_data.confidence_score if ocr_data else 0.0
        
        results.append({
            "id": page.id,
            "page_number": page.page_number,
            "image_path": page.image_path,
            "extracted_text": text,
            "confidence": confidence,
            "status": page.status
        })
        
    book = await db.get(Book, book_id)
    return {
        "book_id": book_id, 
        "title": book.title if book else "كتاب غير معروف",
        "results": results
    }

@router.get("/{book_id}/search")
async def search_book(book_id: str, query: str, db: AsyncSession = Depends(get_async_db)):
    if not query:
        return {"results": []}

    try:
        ai_adapter = AdapterFactory.get_adapter()
        query_embedding = await ai_adapter.get_embedding(query)
        if not query_embedding:
            return {"results": [], "error": "Could not generate query embedding"}
        query_vec = np.array(query_embedding, dtype='float32')
    except Exception as e:
        return {"results": [], "error": str(e)}

    result = await db.execute(
        select(Page, OCRResult)
        .join(OCRResult, Page.id == OCRResult.page_id)
        .where(Page.book_id == book_id)
    )
    rows = result.all()
    
    scored_results = []
    for page, ocr in rows:
        if ocr.embedding:
            page_vec = np.frombuffer(ocr.embedding, dtype='float32')
            score = cosine_similarity(query_vec, page_vec)
            
            if score > 0.4:
                scored_results.append({
                    "id": page.id,
                    "page_number": page.page_number,
                    "extracted_text": ocr.extracted_text[:300] + "...",
                    "score": float(score),
                    "status": page.status
                })
    
    scored_results.sort(key=lambda x: x["score"], reverse=True)
    return {"results": scored_results[:10]}

@router.get("/{book_id}/export")
async def export_book_results(book_id: str, db: AsyncSession = Depends(get_async_db)):
    result = await db.execute(select(Page).where(Page.book_id == book_id).order_by(Page.page_number))
    pages = result.scalars().all()
    
    full_text = ""
    for page in pages:
        ocr_res = await db.execute(select(OCRResult).where(OCRResult.page_id == page.id))
        ocr_data = ocr_res.scalar_one_or_none()
        if ocr_data and ocr_data.extracted_text:
            full_text += f"\n--- صفحة {page.page_number} ---\n"
            full_text += ocr_data.extracted_text + "\n"
            
    export_path = os.path.join(settings.UPLOAD_DIR, f"{book_id}_export.txt")
    with open(export_path, "w", encoding="utf-8") as f:
        f.write(full_text)
        
    from fastapi.responses import FileResponse
    return FileResponse(export_path, filename=f"exported_book_{book_id}.txt")
