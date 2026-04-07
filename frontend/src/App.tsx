import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom"
import { UploadPage } from "./pages/UploadPage"
import { DashboardPage } from "./pages/DashboardPage"
import { BookDetailsPage } from "./pages/BookDetailsPage"
import { SettingsPage } from "./pages/SettingsPage"
import { BookOpen, PlusCircle, LayoutDashboard, SlidersHorizontal } from "lucide-react"
import { Toaster } from "@/components/ui/toaster"
import { ThemeProvider } from "./components/theme-provider"
import { ModeToggle } from "./components/mode-toggle"

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <Router>
        <div className="min-h-screen bg-background font-sans text-foreground">
        <header className="sticky top-0 z-50 w-full glass-morphism">
          <div className="container mx-auto flex h-16 items-center px-4 md:px-8">
            <div className="flex gap-8 items-center">
              <Link to="/" className="flex items-center space-x-2 space-x-reverse group">
                 <div className="bg-primary p-1.5 rounded-lg group-hover:scale-110 transition-transform">
                   <BookOpen className="h-6 w-6 text-primary-foreground" />
                 </div>
                 <span className="text-xl font-bold tracking-tight text-gradient">قارئ الكتب الذكي</span>
              </Link>
              
              <nav className="hidden md:flex items-center gap-6">
                <Link 
                  to="/" 
                  className="flex items-center text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                >
                  <LayoutDashboard className="h-4 w-4 ml-2" />
                  اللوحة الرئيسية
                </Link>
                <Link 
                  to="/upload" 
                  className="flex items-center text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                >
                  <PlusCircle className="h-4 w-4 ml-2" />
                  رفع كتاب
                </Link>
                <Link 
                  to="/settings" 
                  className="flex items-center text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                >
                  <SlidersHorizontal className="h-4 w-4 ml-2" />
                  الإعدادات
                </Link>
              </nav>
            </div>
            
            <div className="flex flex-1 items-center justify-end gap-4">
              <ModeToggle />
            </div>
          </div>
        </header>

          <main className="container mx-auto py-6" dir="rtl">
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/books/:id" element={<BookDetailsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
        <Toaster />
      </Router>
    </ThemeProvider>
  )
}

export default App
