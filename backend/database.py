import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from dotenv import load_dotenv
load_dotenv()

# Fallback to sqlite if DATABASE_URL is not set
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./ocr_database.db")

engine = create_async_engine(
    DATABASE_URL,
    echo=True,
    **({"connect_args": {"check_same_thread": False}} if DATABASE_URL.startswith("sqlite") else {})
)

AsyncSessionLocal = async_sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,   # prevents lazy-load after commit in async context
)

Base = declarative_base()

# Dependency
async def get_async_db():
    async with AsyncSessionLocal() as db:
        try:
            yield db
        finally:
            await db.close()
