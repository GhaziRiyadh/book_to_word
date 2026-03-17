from fastapi import FastAPI, Depends, UploadFile, File, Form, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
import os
import shutil
import aiofiles

from fastapi.staticfiles import StaticFiles
from database import engine, Base, get_async_db
from models import Book, Page, OCRResult
from services import handle_pdf_upload, process_document_task
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

@app.get("/")
def read_root():
    return {"message": "Welcome to the Arabic OCR System API"}

@app.get("/api/v1/books")
async def get_all_books(db: AsyncSession = Depends(get_async_db)):
    result = await db.execute(select(Book).order_by(Book.created_at.desc()))
    books = result.scalars().all()
    return {"books": [{"id": b.id, "title": b.title, "status": b.status, "created_at": b.created_at} for b in books]}

# Basic placeholders for the endpoints
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
    
    completed = sum(1 for p in pages if p.status == "Completed")
    total = len(pages)
    
    pages_status = [{"page_number": p.page_number, "status": p.status} for p in pages]
    
    return {
        "status": book.status,
        "progress": f"{completed}/{total}",
        "pages": pages_status
    }

@app.get("/api/v1/books/{book_id}/results")
async def get_book_results(book_id: str, db: AsyncSession = Depends(get_async_db)):
    result = await db.execute(select(Page).where(Page.book_id == book_id).order_by(Page.page_number))
    pages = result.scalars().all()
    
    results = []
    for page in pages:
        ocr_res = await db.execute(select(OCRResult).where(OCRResult.page_id == page.id))
        ocr_data = ocr_res.scalar_one_or_none()
        text = ocr_data.extracted_text if ocr_data else ""
        confidence = ocr_data.confidence_score if ocr_data else 0.0
        
        results.append({
            "page_number": page.page_number,
            "image_path": page.image_path,
            "extracted_text": text,
            "confidence": confidence,
            "status": page.status
        })
        
    return {"book_id": book_id, "results": results}

@app.get("/api/v1/books/{book_id}/export")
async def export_book_results(book_id: str, format: str = "txt", db: AsyncSession = Depends(get_async_db)):
    # Simple TXT export for now
    result = await db.execute(select(Page).where(Page.book_id == book_id).order_by(Page.page_number))
    pages = result.scalars().all()
    
    full_text = ""
    for page in pages:
        ocr_res = await db.execute(select(OCRResult).where(OCRResult.page_id == page.id))
        ocr_data = ocr_res.scalar_one_or_none()
        if ocr_data and ocr_data.extracted_text:
            full_text += f"\n--- صفحة {page.page_number} ---\n"
            full_text += ocr_data.extracted_text + "\n"
            
    # Return as file
    export_path = os.path.join(UPLOAD_DIR, f"{book_id}_export.txt")
    with open(export_path, "w", encoding="utf-8") as f:
        f.write(full_text)
        
    from fastapi.responses import FileResponse
    return FileResponse(export_path, filename=f"exported_book_{book_id}.txt")
