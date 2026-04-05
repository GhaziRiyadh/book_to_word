from fastapi import FastAPI, Depends, UploadFile, File, Form, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
import os
import shutil
import aiofiles
import numpy as np

from fastapi.staticfiles import StaticFiles
from database import engine, Base, get_async_db
from models import Book, Page, OCRResult
from services import handle_pdf_upload, process_document_task
from adapters.factory import AdapterFactory
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create the database tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield

app = FastAPI(title="Arabic OCR System API", lifespan=lifespan)

# Configure CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, set to frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Serve uploaded images statically
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

def cosine_similarity(a, b):
    if a is None or b is None:
        return 0.0
    dot_product = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot_product / (norm_a * norm_b))

@app.get("/")
def read_root():
    return {"message": "Welcome to the Arabic OCR System API"}

@app.get("/api/v1/books")
async def get_all_books(db: AsyncSession = Depends(get_async_db)):
    result = await db.execute(select(Book).order_by(Book.created_at.desc()))
    books = result.scalars().all()
    return {"books": [{"id": b.id, "title": b.title, "status": b.status, "created_at": b.created_at} for b in books]}

@app.post("/api/v1/books/upload")
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
    
    book_folder = os.path.join(UPLOAD_DIR, book.id)
    os.makedirs(book_folder, exist_ok=True)
    
    saved_paths = []
    
    # Check if single PDF
    if len(files) == 1 and files[0].filename.endswith(".pdf"):
        pdf_path = os.path.join(book_folder, files[0].filename)
        async with aiofiles.open(pdf_path, 'wb') as out_file:
            content = await files[0].read()
            await out_file.write(content)
        try:
            saved_paths = await handle_pdf_upload(pdf_path, UPLOAD_DIR)
        except Exception as e:
            # Maybe poppler is not installed
            raise HTTPException(status_code=500, detail=f"PDF conversion failed. Is poppler installed? Error: {str(e)}")
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

@app.post("/api/v1/books/{book_id}/process")
async def process_book(book_id: str, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_async_db)):
    book = await db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
        
    background_tasks.add_task(process_document_task, book_id)
    return {"message": "Processing started", "book_id": book_id}

@app.get("/api/v1/books/{book_id}/status")
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

@app.get("/api/v1/books/{book_id}/results")
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

@app.get("/api/v1/books/{book_id}/search")
async def search_book(book_id: str, query: str, db: AsyncSession = Depends(get_async_db)):
    if not query:
        return {"results": []}

    # Generate embedding for the search query
    try:
        ai_adapter = AdapterFactory.get_adapter()
        query_embedding = await ai_adapter.get_embedding(query)
        if not query_embedding:
            return {"results": [], "error": "Could not generate query embedding"}
        query_vec = np.array(query_embedding, dtype='float32')
    except Exception as e:
        return {"results": [], "error": str(e)}

    # Fetch all pages for the book with their OCR results (including embeddings)
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
            
            # Threshold for relevance
            if score > 0.4:
                scored_results.append({
                    "id": page.id,
                    "page_number": page.page_number,
                    "extracted_text": ocr.extracted_text[:300] + "...", # Preview
                    "score": float(score),
                    "status": page.status
                })
    
    # Sort by score descending
    scored_results.sort(key=lambda x: x["score"], reverse=True)
    
    return {"results": scored_results[:10]}

@app.put("/api/v1/pages/{page_id}/ocr")
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
        # Optional: Trigger re-embedding if manual edit happened
    
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

@app.get("/api/v1/books/{book_id}/export")
async def export_book_results(book_id: str, format: str = "txt", db: AsyncSession = Depends(get_async_db)):
    result = await db.execute(select(Page).where(Page.book_id == book_id).order_by(Page.page_number))
    pages = result.scalars().all()
    
    full_text = ""
    for page in pages:
        ocr_res = await db.execute(select(OCRResult).where(OCRResult.page_id == page.id))
        ocr_data = ocr_res.scalar_one_or_none()
        if ocr_data and ocr_data.extracted_text:
            full_text += f"\n--- صفحة {page.page_number} ---\n"
            full_text += ocr_data.extracted_text + "\n"
            
    export_path = os.path.join(UPLOAD_DIR, f"{book_id}_export.txt")
    with open(export_path, "w", encoding="utf-8") as f:
        f.write(full_text)
        
    from fastapi.responses import FileResponse
    return FileResponse(export_path, filename=f"exported_book_{book_id}.txt")
