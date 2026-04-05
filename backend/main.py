import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from api.v1.api import api_router
from core.config import settings
from services import get_adapter_health

logger = logging.getLogger("ocr_service")

@asynccontextmanager
async def lifespan(app: FastAPI):
    health = get_adapter_health()
    if not health["ready"]:
        logger.warning(
            "AI adapter is not ready at startup. Provider=%s, last_error=%s",
            health["provider"],
            health["last_error"],
        )
    yield

app = FastAPI(title=settings.PROJECT_NAME, lifespan=lifespan)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded images statically
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# Include API Router
app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/")
def read_root():
    return {"message": f"Welcome to the {settings.PROJECT_NAME} API"}


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "ai_adapter": get_adapter_health(),
    }
