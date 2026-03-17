from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
import datetime
import uuid

from database import Base

class Book(Base):
    __tablename__ = "books"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    status = Column(String, default="Pending")  # Pending, Processing, Completed, Failed

    pages = relationship("Page", back_populates="book")

class Page(Base):
    __tablename__ = "pages"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    book_id = Column(String, ForeignKey("books.id"))
    page_number = Column(Integer)
    image_path = Column(String)
    status = Column(String, default="Pending")

    book = relationship("Book", back_populates="pages")
    ocr_result = relationship("OCRResult", back_populates="page", uselist=False)

class OCRResult(Base):
    __tablename__ = "ocr_results"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    page_id = Column(String, ForeignKey("pages.id"))
    extracted_text = Column(Text, nullable=True)
    confidence_score = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    page = relationship("Page", back_populates="ocr_result")
