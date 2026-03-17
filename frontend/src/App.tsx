import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom"
import { UploadPage } from "./pages/UploadPage"
import { DashboardPage } from "./pages/DashboardPage"
import { BookDetailsPage } from "./pages/BookDetailsPage"
import { BookOpen, UploadCloud, LayoutDashboard } from "lucide-react"
import { Toaster } from "@/components/ui/toaster"

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-background font-sans text-foreground">
        <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container flex h-16 items-center space-x-4 sm:justify-between sm:space-x-0">
            <div className="flex gap-6 md:gap-10">
              <Link to="/" className="flex items-center space-x-2">
                <BookOpen className="h-6 w-6" />
                <span className="inline-block font-bold">Arabic OCR</span>
              </Link>
              <nav className="flex gap-6">
                <Link
                  to="/"
                  className="flex items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <LayoutDashboard className="h-4 w-4 mr-2" />
                  اللوحة الرئيسية
                </Link>
                <Link
                  to="/upload"
                  className="flex items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <UploadCloud className="h-4 w-4 mr-2" />
                  رفع ملف جديد
                </Link>
              </nav>
            </div>
          </div>
        </header>

        <main className="container mx-auto py-6" dir="rtl">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/books/:id" element={<BookDetailsPage />} />
          </Routes>
        </main>
      </div>
      <Toaster />
    </Router>
  )
}

export default App
