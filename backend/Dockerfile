FROM python:3.11-slim

# Install system dependencies required for OpenCV, PaddleOCR and pdf2image
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt
# Install PostgreSQL async driver
RUN pip install --no-cache-dir asyncpg

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
