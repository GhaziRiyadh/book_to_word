from fastapi import APIRouter
from api.v1.endpoints import books, pages

api_router = APIRouter()
api_router.include_router(books.router, prefix="/books", tags=["books"])
api_router.include_router(pages.router, prefix="/pages", tags=["pages"])
