import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import axios from "axios"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { BookOpen, Clock, CheckCircle2, Plus, ArrowRight, RefreshCw, Loader2, Search, FileCheck, Trash2 } from "lucide-react"


const API_URL = "http://localhost:8000/api/v1"

type Book = {
  id: string
  title: string
  status: string
  created_at: string
  pages_count?: number
  thumbnail?: string
}

export function DashboardPage() {
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)
  const [processingBookId, setProcessingBookId] = useState<string | null>(null)
  const [deletingBookId, setDeletingBookId] = useState<string | null>(null)

  const [globalSearchQuery, setGlobalSearchQuery] = useState("")
  const [globalSearchMode, setGlobalSearchMode] = useState<"semantic" | "keyword">("keyword")
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false)
  const [globalSearchResults, setGlobalSearchResults] = useState<any[]>([])

  useEffect(() => {
    fetchBooks()
  }, [])

  const fetchBooks = async () => {
    try {
      const res = await axios.get(`${API_URL}/books`)
      setBooks(res.data.books)
    } catch (error) {
      console.error("Failed to fetch books", error)
    } finally {
      setLoading(false)
    }
  }

  // Polling for updates when books are being processed
  useEffect(() => {
    const hasProcessingBooks = books.some(b => b.status === "Processing" || b.status === "Pending")
    let interval: ReturnType<typeof setInterval>
    
    if (hasProcessingBooks) {
       interval = setInterval(() => {
           fetchBooks()
       }, 3000)
    }
    
    return () => {
       if (interval) clearInterval(interval)
    }
  }, [books])

  const handleReprocess = async (bookId: string) => {
    try {
      setProcessingBookId(bookId)
      // Call the book-level process endpoint which handles things in the background
      await axios.post(`${API_URL}/books/${bookId}/process`)
      await fetchBooks()
    } catch (error) {
      console.error("Failed to reprocess book", error)
    } finally {
      setProcessingBookId(null)
    }
  }

  const handleDeleteBook = async (bookId: string) => {
    const confirmed = window.confirm("هل تريد حذف هذا الكتاب نهائياً؟ سيتم حذف كل الصفحات والملفات المرتبطة به.")
    if (!confirmed) return

    try {
      setDeletingBookId(bookId)
      await axios.delete(`${API_URL}/books/${bookId}`)
      await fetchBooks()
    } catch (error) {
      console.error("Failed to delete book", error)
    } finally {
      setDeletingBookId(null)
    }
  }

  const handleGlobalSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!globalSearchQuery.trim()) {
      setGlobalSearchResults([])
      return
    }
    try {
      setIsSearchingGlobal(true)
      const res = await axios.get(`${API_URL}/books/global/search`, {
        params: { query: globalSearchQuery, mode: globalSearchMode }
      })
      setGlobalSearchResults(res.data.results)
    } catch (error) {
      console.error("Search failed:", error)
    } finally {
      setIsSearchingGlobal(false)
    }
  }

  const stats = {

    total: books.length,
    completed: books.filter(b => b.status === "Completed").length,
    processing: books.filter(b => b.status === "Processing" || b.status === "Pending").length,
  }

  // Helper to get image URL
  const getImageUrl = (path?: string) => {
    if (!path) return null
    if (path.startsWith('http')) return path
    // Remove the leading slash if it exists and we're appending to a base that has one, 
    // or just ensure we don't have double slashes
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    return `http://localhost:8000${cleanPath}`
  }

  return (
    <div className="space-y-10 pb-12">
      {/* Header & Stats */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-gradient mb-2">مرحباً بك</h1>
          <p className="text-muted-foreground text-lg">إليك ملخص لمستنداتك ومعالجاتك الحالية.</p>
        </div>
        <Link to="/upload">
          <Button size="lg" className="rounded-full px-8 shadow-lg hover:shadow-primary/20 transition-all">
            <Plus className="ml-2 h-5 w-5" />
            رفع كتاب جديد
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="premium-shadow border-none bg-gradient-to-br from-primary/10 to-transparent">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-bold tracking-wider">إجمالي الكتب</CardDescription>
            <CardTitle className="text-4xl">{stats.total}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-xs text-muted-foreground">
               <BookOpen className="h-3 w-3 ml-1" />
               مستند في المكتبة
            </div>
          </CardContent>
        </Card>
        <Card className="premium-shadow border-none bg-gradient-to-br from-green-500/10 to-transparent">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-bold tracking-wider">مكتملة</CardDescription>
            <CardTitle className="text-4xl text-green-600 dark:text-green-400">{stats.completed}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-xs text-muted-foreground">
               <CheckCircle2 className="h-3 w-3 ml-1 text-green-500" />
               جاهزة للعرض
            </div>
          </CardContent>
        </Card>
        <Card className="premium-shadow border-none bg-gradient-to-br from-blue-500/10 to-transparent">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-bold tracking-wider">قيد المعالجة</CardDescription>
            <CardTitle className="text-4xl text-blue-600 dark:text-blue-400">{stats.processing}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-xs text-muted-foreground">
               <Clock className="h-3 w-3 ml-1 text-blue-500" />
               يتم تحليلها الآن
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Global Search Bar */}
      <div className="mb-10 max-w-3xl mx-auto">
         <form onSubmit={handleGlobalSearch} className="relative flex items-center shadow-2xl rounded-xl group focus-within:ring-2 focus-within:ring-primary/50 transition-all">
           <input 
             type="text" 
             placeholder={globalSearchMode === "keyword" ? "ابحث في جميع مكتباتك عن كلمات..." : "بحث دلالي (بالمعنى) عبر كل الكتب..."} 
             value={globalSearchQuery}
             onChange={(e) => {
               setGlobalSearchQuery(e.target.value)
               if (!e.target.value) setGlobalSearchResults([])
             }}
             className="w-full h-14 pr-12 pl-28 rounded-xl border border-primary/20 bg-background/80 backdrop-blur-sm text-base focus-visible:outline-none placeholder:text-muted-foreground/50 transition-all shadow-inner"
           />
           <Button 
             type="submit" 
             variant="ghost" 
             className="absolute right-2 top-2 bottom-2 h-10 w-10 p-0 rounded-lg hover:bg-primary/10 text-primary"
           >
             {isSearchingGlobal ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
           </Button>
           
           <div className="absolute left-2 top-2.5 flex bg-muted/50 rounded-lg p-1 border border-border/50">
              <button 
                type="button"
                onClick={() => setGlobalSearchMode("keyword")}
                className={`text-xs px-3 py-1.5 rounded-md transition-all duration-300 ${globalSearchMode === "keyword" ? "bg-background shadow-md font-bold text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >كلمات</button>
              <button 
                type="button"
                onClick={() => setGlobalSearchMode("semantic")}
                className={`text-xs px-3 py-1.5 rounded-md transition-all duration-300 ${globalSearchMode === "semantic" ? "bg-background shadow-md font-bold text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >دلالي</button>
           </div>
         </form>
      </div>

      {/* Global Search Results or Grid List */}
      <div>
        {globalSearchResults.length > 0 ? (
           <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                   <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-l from-primary to-primary/60">نتائج البحث عبر المكتبة</h2>
                   <Badge variant="outline" className="text-primary border-primary/20 bg-primary/5">{globalSearchResults.length} نتيجة</Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setGlobalSearchResults([]); setGlobalSearchQuery(""); }}>
                  عودة للمكتبة
                </Button>
             </div>
             
             <div className="flex flex-col gap-4">
                {globalSearchResults.map((r, idx) => (
                  <Card key={`${r.id}-${idx}`} className="group hover:border-primary/50 transition-all duration-300 overflow-hidden premium-shadow bg-card/60 backdrop-blur-sm">
                    <CardContent className="p-0">
                      <Link to={`/books/${r.book_id}?page=${r.page_number}`} className="flex flex-col sm:flex-row p-6 items-start gap-6 cursor-pointer">
                        <div className="bg-primary/5 p-4 rounded-2xl group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                           <FileCheck className="h-8 w-8 text-primary group-hover:text-primary-foreground transition-colors" />
                        </div>
                        <div className="flex-1 space-y-2 w-full">
                           <div className="flex items-start justify-between gap-4">
                              <div>
                                <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors">{r.book_title}</h3>
                                <div className="flex gap-2 items-center text-sm font-medium text-muted-foreground/80">
                                   <span>صفحة {r.page_number}</span>
                                </div>
                              </div>
                              {globalSearchMode === "semantic" && (
                                <Badge variant="secondary" className="font-mono bg-primary/10 text-primary hover:bg-primary/20">
                                  دقة: {Math.round(r.score * 100)}%
                                </Badge>
                              )}
                           </div>
                           <p className="text-sm text-muted-foreground/90 leading-relaxed font-serif p-4 bg-muted/30 rounded-xl" dir="rtl">
                             {r.extracted_text}
                           </p>
                        </div>
                      </Link>
                    </CardContent>
                  </Card>
                ))}
             </div>
           </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
               <h2 className="text-2xl font-bold">المستندات الأخيرة</h2>
               <div className="h-px flex-1 bg-muted mx-4 hidden md:block" />
            </div>

            {loading ? (

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {[1,2,3].map(i => (
               <Card key={i} className="h-64 animate-pulse bg-muted/50 border-none" />
             ))}
          </div>
        ) : books.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 bg-muted/10 rounded-3xl border-2 border-dashed border-muted">
            <div className="bg-background p-6 rounded-full shadow-xl mb-6">
              <BookOpen className="h-12 w-12 text-muted-foreground opacity-20" />
            </div>
            <h3 className="text-xl font-bold mb-2">لا توجد كتب بعد</h3>
            <p className="text-muted-foreground mb-8 text-center max-w-sm">ابدأ برفع أول كتاب لك ليقوم الذكاء الاصطناعي بمعالجته وتحويله إلى نص قابل للبحث.</p>
            <Link to="/upload">
              <Button variant="outline" className="rounded-full px-8">رفع مستندك الأول</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {books.map((book) => (
              <Card key={book.id} className="group overflow-hidden premium-shadow border-none hover:-translate-y-2 transition-all duration-300 bg-card/40 backdrop-blur-sm">
                <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                  {book.thumbnail ? (
                    <img 
                      src={getImageUrl(book.thumbnail)!} 
                      alt={book.title}
                      className="object-cover w-full h-full group-hover:scale-110 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/30">
                      <BookOpen className="h-12 w-12 text-muted-foreground/20" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                    <span className="text-white text-xs font-medium">عرض المزيد</span>
                  </div>
                  <Badge className="absolute top-3 left-3 shadow-lg" variant={
                    book.status === 'Completed' ? 'default' :
                    book.status === 'Processing' ? 'secondary' :
                    book.status === 'Failed' ? 'destructive' : 'outline'
                  }>
                    {book.status === 'Completed' ? 'مكتمل' :
                     book.status === 'Processing' ? 'جاري المعالجة' :
                     book.status === 'Failed' ? 'فشل' : 'في الانتظار'}
                  </Badge>
                </div>
                
                <CardHeader className="p-4">
                  <div className="flex justify-between items-center mb-1">
                     <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                       {new Date(book.created_at).toLocaleDateString('ar-SA')}
                     </span>
                  </div>
                  <CardTitle className="text-lg line-clamp-1 group-hover:text-primary transition-colors">{book.title}</CardTitle>
                </CardHeader>
                
                <CardFooter className="px-4 pb-4 pt-0 flex gap-2">
                   <Link to={`/books/${book.id}`} className="flex-1">
                      <Button className="w-full rounded-lg font-bold" variant="secondary">
                        نتائج OCR
                        <ArrowRight className="mr-2 h-4 w-4" />
                      </Button>
                   </Link>
                   <Button 
                     size="icon" 
                     variant="ghost" 
                     className="rounded-lg hover:bg-primary/10"
                     onClick={() => handleReprocess(book.id)}
                     disabled={book.status === 'Processing' || processingBookId === book.id}
                   >
                     {processingBookId === book.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                   </Button>
                   <Button 
                     size="icon" 
                     variant="ghost" 
                     className="rounded-lg hover:bg-destructive/10 hover:text-destructive"
                     onClick={() => handleDeleteBook(book.id)}
                     disabled={deletingBookId === book.id || book.status === 'Processing'}
                   >
                     {deletingBookId === book.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                   </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
        </>
        )}
      </div>
    </div>

  )
}
