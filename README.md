# Book-to-Word: Arabic OCR & Scientific Publisher

An open-source, AI-powered system designed to convert Arabic books (PDF/Images) into high-quality, editable digital text with a focus on scientific and professional printing layouts.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.9%2B-blue.svg)
![React](https://img.shields.io/badge/react-19-61dafb.svg)

## 🌟 Key Features

- **Multi-AI Adapter System**: Seamlessly switch between **Gemini**, **OpenAI (GPT-4o)**, **DeepSeek**, and **Ollama (Offline)** via environment variables.
- **Real-Time Progress Tracking**: Monitor the OCR process page-by-page with a global progress bar.
- **Human-in-the-Loop Editing**: Review and correct extracted text side-by-side with the original scan.
- **Professional Scientific Layout**: 
  - One-click transformation from raw OCR to a formatted book page.
  - Optimized for **A4 printing** with proper margins and borders.
  - High-quality Arabic typography using **Cairo** for UI and **IBM Plex Sans Arabic** for print.
- **HTML-Rich Extraction**: Supports bold, italic, and heading structures directly from the AI output.

## 🛠 Tech Stack

- **Backend**: FastAPI (Python), SQLAlchemy (Async), SQLite.
- **Frontend**: React (Vite), Tailwind CSS, Lucide Icons, Shadcn UI components.
- **AI Integration**: Google Generative AI, OpenAI SDK, Ollama (Local API).
- **Document Processing**: Poppler (via `pdf2image`), Pillow.

## 🚀 Getting Started

### Prerequisites

- Python 3.9+
- Node.js 18+
- [Poppler](https://poppler.freedesktop.org/) (Required for PDF processing)
  - **Windows**: Install via `conda install -c cordova poppler` or download binaries and add to PATH.
  - **Linux**: `sudo apt-get install poppler-utils`

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/book_to_word.git
   cd book_to_word
   ```

2. **Backend Setup**:
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Frontend Setup**:
   ```bash
   cd ../frontend
   npm install
   ```

### Configuration

Create a `.env` file in the `backend` directory based on `.env.example`:

```env
# AI Provider (gemini, openai, deepseek, ollama)
AI_PROVIDER=gemini

# API Keys
GEMINI_API_KEY=your_gemini_key
OPENAI_API_KEY=your_openai_key
DEEPSEEK_API_KEY=your_deepseek_key

# Ollama (Offline OCR)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2-vision

# Optional: Poppler Path (if not in PATH)
# POPPLER_PATH=C:\path\to\poppler\bin
```

### Running the Project

1. **Start Backend**:
   ```bash
   cd backend
   uvicorn main:app --reload
   ```

2. **Start Frontend**:
   ```bash
   cd frontend
   npm run dev
   ```

The application will be available at `http://localhost:5173`.

## 📖 Usage Guide

1. **Upload**: Drop a PDF or a set of images on the dashboard.
2. **Process**: Wait for the AI to analyze each page. You'll see real-time updates.
3. **Review**: Click on a book to see results. Use the editor to fix any OCR errors while comparing with the original image.
4. **Publish**: Click "اعتماد ونشر" (Approve and Publish) to finalise the page.
5. **Print**: Use the "طباعة" (Print) button to get a professional, book-formatted copy.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---
*Created with ❤️ for the Arabic scientific community.*
