from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List
import os
import re
from html import unescape
import aiofiles
import numpy as np
from docx import Document

from database import get_async_db
from models import Book, Page, OCRResult
from services import handle_pdf_upload, process_document_task
from adapters.factory import AdapterFactory
from utils.math import cosine_similarity
from core.config import settings

router = APIRouter()


def _to_plain_text(raw_text: str) -> str:
    # Handle both plain text and simple HTML OCR output.
    text = raw_text or ""
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</(p|div|h1|h2|h3|h4|h5|h6|li)>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = unescape(text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

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
    prompt_mode: str | None = Query(None, description="OCR prompt mode override: normal or formatted"),
    db: AsyncSession = Depends(get_async_db),
):
    book = await db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    await process_document_task(book_id, prompt_mode=prompt_mode)
    return {"message": "Processing completed", "book_id": book_id, "prompt_mode": prompt_mode or settings.OCR_PROMPT_MODE}

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
    result = await db.execute(
        select(Page)
        .where(Page.book_id == book_id)
        .options(selectinload(Page.ocr_results))
        .order_by(Page.page_number)
    )
    pages = result.scalars().all()
    
    results = []
    for page in pages:
        ocr_data = page.ocr_results[0] if page.ocr_results else None
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
async def search_book(
    book_id: str, 
    query: str, 
    mode: str = Query("semantic", description="Search mode: semantic or keyword"),
    db: AsyncSession = Depends(get_async_db)
):
    if not query:
        return {"results": []}

    # Keyword Search Mode (Exact/Partial phrase matching)
    if mode == "keyword":
        # Search using SQL LIKE for simple keyword matching
        query_pattern = f"%{query}%"
        result = await db.execute(
            select(Page, OCRResult)
            .join(OCRResult, Page.id == OCRResult.page_id)
            .where(Page.book_id == book_id)
            .where(OCRResult.extracted_text.like(query_pattern))
            .order_by(Page.page_number)
        )
        rows = result.all()
        
        results = []
        for page, ocr in rows:
            # Basic snippet generation
            text = ocr.extracted_text or ""
            idx = text.lower().find(query.lower())
            start = max(0, idx - 100)
            end = min(len(text), idx + 200)
            snippet = ("..." if start > 0 else "") + text[start:end] + ("..." if end < len(text) else "")
            
            results.append({
                "id": page.id,
                "page_number": page.page_number,
                "extracted_text": snippet,
                "score": 1.0, # Exact/Keyword matches get a flat score
                "status": page.status
            })
        return {"results": results[:20]}

    # Semantic Search Mode (Vector Similarity)
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
    
    scored_map = {}
    for page, ocr in rows:
        if ocr.embedding:
            page_vec = np.frombuffer(ocr.embedding, dtype='float32')
            score = float(cosine_similarity(query_vec, page_vec))
            
            # Use a slightly lower threshold for semantic discovery
            if score > 0.35:
                if page.id not in scored_map or score > scored_map[page.id]["score"]:
                    # Basic snippet for semantic - just start of text
                    text = ocr.extracted_text or ""
                    snippet = (text[:300] + "...") if len(text) > 300 else text
                    
                    scored_map[page.id] = {
                        "id": page.id,
                        "page_number": page.page_number,
                        "extracted_text": snippet,
                        "score": score,
                        "status": page.status
                    }
    
    scored_results = list(scored_map.values())
    scored_results.sort(key=lambda x: x["score"], reverse=True)
    return {"results": scored_results[:15]}

@router.get("/{book_id}/export")
async def export_book_results(book_id: str, db: AsyncSession = Depends(get_async_db)):
    result = await db.execute(
        select(Page)
        .where(Page.book_id == book_id)
        .options(selectinload(Page.ocr_results))
        .order_by(Page.page_number)
    )
    pages = result.scalars().all()

    book = await db.get(Book, book_id)
    book_title = book.title if book and book.title else f"book_{book_id}"

    document = Document()
    document.add_heading(book_title, level=1)

    for page in pages:
        ocr_data = page.ocr_results[0] if page.ocr_results else None
        if ocr_data and ocr_data.extracted_text:
            document.add_heading(f"صفحة {page.page_number}", level=2)
            plain_text = _to_plain_text(ocr_data.extracted_text)
            if plain_text:
                for paragraph in plain_text.split("\n"):
                    cleaned = paragraph.strip()
                    if cleaned:
                        document.add_paragraph(cleaned)
            else:
                document.add_paragraph("")

            document.add_page_break()

    export_path = os.path.join(settings.UPLOAD_DIR, f"{book_id}_export.docx")
    document.save(export_path)

    safe_name = re.sub(r"[^\w\u0600-\u06FF\s-]", "", book_title).strip() or f"exported_book_{book_id}"
    return FileResponse(
        export_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"{safe_name}.docx",
    )
