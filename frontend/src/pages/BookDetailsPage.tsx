import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useParams, useLocation, useNavigate } from "react-router-dom"
import axios from "axios"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
// import { ScrollArea } from "@/components/ui/scroll-area" // Unused after refactor to scientific layout
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle2, Printer, Download, RefreshCw, ChevronDown, Layers, Search, FileCheck, ArrowRight, ArrowLeft, Trash2, CircleStop, Scissors } from "lucide-react"

const API_URL = "http://localhost:8000/api/v1"
const BACKEND_URL = "http://localhost:8000"

type PageResult = {
  id: string
  page_number: number
  image_path: string
  extracted_text: string
  confidence: number
  status: string
}

type BookStatus = {
  status: string
  title: string
  progress: string
  progress_percent: number
  pages: { id: string, page_number: number, status: string }[]
}

export function BookDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const [bookStatus, setBookStatus] = useState<BookStatus | null>(null)
  const [results, setResults] = useState<PageResult[]>([])
  const [isReprocessing, setIsReprocessing] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isPublishingAll, setIsPublishingAll] = useState(false)
  const [resumeAttempted, setResumeAttempted] = useState(false)
  const [expandedPageId, setExpandedPageId] = useState<string | null>(null)
  const [editingTexts, setEditingTexts] = useState<Record<string, string>>({})
  const [savingPages, setSavingPages] = useState<Record<string, boolean>>({})
  const [isDeletingBook, setIsDeletingBook] = useState(false)
  const [isStoppingBook, setIsStoppingBook] = useState(false)
  const [isResplittingPages, setIsResplittingPages] = useState(false)
  
  // Advanced Search & Navigation State
  const [searchQuery, setSearchQuery] = useState("")
  const [searchMode, setSearchMode] = useState<"semantic" | "keyword">("keyword")
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [gotoPage, setGotoPage] = useState("")
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [showRecent, setShowRecent] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  
  const isStatusPollingRef = useRef(false)
  const lastStatusKeyRef = useRef("")
  const currentBookStatusRef = useRef<string>("")

  const buildStatusKey = (status: BookStatus) => {
    const pagesKey = (status.pages || [])
      .map((p) => `${p.id}:${p.status}`)
      .join("|")
    return `${status.status}::${pagesKey}`
  }
  
  const fetchResults = useCallback(async () => {
    if (!id) {
      return
    }
    try {
      const res = await axios.get(`${API_URL}/books/${id}/results`)
      setResults(res.data.results)
      
      // Update book status with title if available
      if (res.data.title) {
        setBookStatus(prev => prev ? { ...prev, title: res.data.title } : null)
      }
      
      // Initialize editing texts
      const initialTexts: Record<string, string> = {}
      res.data.results.forEach((page: PageResult) => {
        initialTexts[page.id] = page.extracted_text || ""
      })
      setEditingTexts(initialTexts)
    } catch (error) {
      console.error(error)
    }
  }, [id])


  const fetchBookStatus = useCallback(async (refreshResultsIfChanged: boolean = true) => {
    if (!id || isStatusPollingRef.current) {
      return
    }

    isStatusPollingRef.current = true
    try {
      const res = await axios.get(`${API_URL}/books/${id}/status`)
      const nextStatus = res.data as BookStatus
      setBookStatus(nextStatus)
      currentBookStatusRef.current = nextStatus.status

      const nextKey = buildStatusKey(nextStatus)
      const changed = nextKey !== lastStatusKeyRef.current
      if (changed) {
        lastStatusKeyRef.current = nextKey
        if (refreshResultsIfChanged) {
          await fetchResults()
        }
      }
    } catch (error) {
      console.error(error)
    } finally {
      isStatusPollingRef.current = false
    }
  }, [id, fetchResults])

  useEffect(() => {
    currentBookStatusRef.current = bookStatus?.status || ""
  }, [bookStatus?.status])

  useEffect(() => {
    lastStatusKeyRef.current = ""
    currentBookStatusRef.current = ""

    // Load recent searches from localStorage
    const saved = localStorage.getItem(`recent_searches_${id}`)
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved))
      } catch (e) {
        console.error("Failed to parse recent searches", e)
      }
    }

    const init = async () => {
      await fetchBookStatus(false)
      await fetchResults()
    }
    init()
  }, [id, fetchBookStatus, fetchResults])

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>

    // Poll every 3 seconds while the upload/processing job is still running.
    interval = setInterval(() => {
      if (currentBookStatusRef.current === "Processing" || currentBookStatusRef.current === "Pending") {
        fetchBookStatus(true)
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [id, fetchBookStatus])


  const handleReprocess = async () => {
    try {
      setIsReprocessing(true)
      
      // Optistically set to Processing to jumpstart the UI and polling
      setBookStatus(prev => prev ? { ...prev, status: "Processing" } : null)
      currentBookStatusRef.current = "Processing"

      // Hit the book-level endpoint which will intelligently process remaining pages sequentially
      await axios.post(`${API_URL}/books/${id}/process`)

      await fetchBookStatus(true)
      await fetchResults()
    } catch (error) {
      console.error("Failed to reprocess:", error)
    } finally {
      setIsReprocessing(false)
    }
  }

  const handleDeleteBook = async () => {
    if (!id) return

    const confirmed = window.confirm("هل تريد حذف هذا الكتاب نهائياً؟ سيتم حذف كل الصفحات والملفات المرتبطة به.")
    if (!confirmed) return

    try {
      setIsDeletingBook(true)
      await axios.delete(`${API_URL}/books/${id}`)
      navigate("/")
    } catch (error) {
      console.error("Failed to delete book:", error)
    } finally {
      setIsDeletingBook(false)
    }
  }

  const handleStopBook = async () => {
    if (!id) return

    try {
      setIsStoppingBook(true)
      await axios.post(`${API_URL}/books/${id}/stop`)
      await fetchBookStatus(true)
      await fetchResults()
    } catch (error) {
      console.error("Failed to stop book processing:", error)
    } finally {
      setIsStoppingBook(false)
    }
  }

  const handleResplitPages = async () => {
    if (!id) return

    const confirmed = window.confirm("هل تريد إعادة تقطيع الصفحات من ملف PDF الأصلي؟ سيتم حذف نتائج OCR الحالية للصفحات.")
    if (!confirmed) return

    try {
      setIsResplittingPages(true)
      await axios.post(`${API_URL}/books/${id}/resplit-pages`)
      await fetchBookStatus(true)
      await fetchResults()
    } catch (error) {
      console.error("Failed to re-split pages:", error)
    } finally {
      setIsResplittingPages(false)
    }
  }

  useEffect(() => {
    setResumeAttempted(false)
  }, [id])

  useEffect(() => {
    const resumeAfterRefresh = async () => {
      if (!id || resumeAttempted || isReprocessing) {
        return
      }

      try {
        const statusRes = await axios.get(`${API_URL}/books/${id}/status`)
        setBookStatus(statusRes.data)
        currentBookStatusRef.current = statusRes.data.status

        setResumeAttempted(true)
      } catch (error) {
        console.error("Failed to resume processing after refresh:", error)
        setResumeAttempted(true)
      }
    }

    resumeAfterRefresh()
  }, [id, resumeAttempted, isReprocessing])

  // Handle auto-scroll for global search links
  useEffect(() => {
    if (results.length > 0) {
      const searchParams = new URLSearchParams(location.search)
      const targetPageStr = searchParams.get("page")
      if (targetPageStr) {
        const targetPageNum = parseInt(targetPageStr, 10)
        const targetPage = results.find((p) => p.page_number === targetPageNum)
        if (targetPage) {
          setExpandedPageId(targetPage.id)
          setTimeout(() => scrollToPage(targetPageNum, targetPage.status), 500)
        }
      }
    }
  }, [results, location.search])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }
    try {
      setIsSearching(true)
      const res = await axios.get(`${API_URL}/books/${id}/search`, {
        params: { query: searchQuery, mode: searchMode }
      })
      setSearchResults(res.data.results)
      
      // Update recent searches
      if (searchQuery.trim()) {
        const updated = [searchQuery, ...recentSearches.filter(s => s !== searchQuery)].slice(0, 5)
        setRecentSearches(updated)
        localStorage.setItem(`recent_searches_${id}`, JSON.stringify(updated))
      }
      setShowRecent(false)
    } catch (error) {
      console.error("Search failed:", error)
    } finally {
      setIsSearching(false)
    }
  }

  const handleGotoPage = (e: React.FormEvent) => {
    e.preventDefault()
    const num = parseInt(gotoPage)
    if (!isNaN(num)) {
       const page = results.find(p => p.page_number === num)
       if (page) {
         setExpandedPageId(page.id)
         scrollToPage(num, page.status)
       }
    }
    setGotoPage("")
  }

  const scrollToPage = (pageNumber: number, targetStatus?: string) => {
    // If the page is filtered out, reset filter to 'all'
    if (statusFilter !== "all" && targetStatus) {
       const isNeedsReview = targetStatus === "Completed" && statusFilter === "needs_review"
       const isPublished = targetStatus === "Published" && statusFilter === "published"
       if (!isNeedsReview && !isPublished) {
         setStatusFilter("all")
       }
    } else if (statusFilter !== "all") {
       setStatusFilter("all")
    }

    // Wait for filter to apply and elements to render
    setTimeout(() => {
      const element = document.getElementById(`page-${pageNumber}`)
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" })
      }
    }, 100)
  }

  const handlePublishAll = async () => {
    try {
      setIsPublishingAll(true)
      const payload = {
         pages: results.map(p => ({
             page_id: p.id,
             extracted_text: editingTexts[p.id] || ""
         }))
      }
      await axios.post(`${API_URL}/books/${id}/publish_all`, payload)
      
      // Refresh results to show new statuses
      await fetchResults()
      await fetchBookStatus(true)
    } catch (error) {
      console.error("Failed to publish all:", error)
    } finally {
      setIsPublishingAll(false)
    }
  }

  const handlePublishPage = async (pageId: string, status: string = "Published") => {
    try {
      setSavingPages(prev => ({ ...prev, [pageId]: true }))
      const formData = new FormData()
      formData.append("extracted_text", editingTexts[pageId])
      formData.append("status", status)
      
      await axios.put(`${API_URL}/pages/${pageId}/ocr`, formData)
      
      // Refresh results to show new status
      fetchResults()
    } catch (error) {
      console.error("Failed to update page:", error)
    } finally {
      setSavingPages(prev => ({ ...prev, [pageId]: false }))
    }
  }

  const handleRegeneratePage = async (pageId: string) => {
    try {
      setSavingPages(prev => ({ ...prev, [pageId]: true }))
      await axios.post(`${API_URL}/pages/${pageId}/process`)
      const currentPage = results.find((p) => p.id === pageId)
      if (currentPage) {
        setExpandedPageId(pageId)
        setTimeout(() => scrollToPage(currentPage.page_number), 100)
      }
      
      // Refresh results and book status to show "Processing"
      fetchResults()
      const statusRes = await axios.get(`${API_URL}/books/${id}/status`)
      setBookStatus(statusRes.data)
    } catch (error) {
      console.error("Failed to regenerate page:", error)
    } finally {
      setSavingPages(prev => ({ ...prev, [pageId]: false }))
    }
  }


  const filteredResults = results.filter(p => {
    if (statusFilter === "all") return true
    if (statusFilter === "needs_review") return p.status === "Completed"
    if (statusFilter === "published") return p.status === "Published"
    return true
  })

  const isWaitingForPages = (bookStatus?.status === "Processing" || bookStatus?.status === "Pending") && results.length === 0

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6 overflow-hidden px-4 sm:px-6">
      {/* Side Navigation Sidebar */}
      <aside className="w-64 flex-shrink-0 border-l bg-muted/10 rounded-lg flex flex-col print:hidden">
        <div className="p-4 border-b">
           <div className="flex items-center gap-2 mb-4">
             <div className="bg-primary/10 p-1.5 rounded-lg">
               <Layers className="h-4 w-4 text-primary" />
             </div>
             <h2 className="font-bold text-base">فهرس الصفحات</h2>
           </div>
           <form onSubmit={handleGotoPage} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <input 
                  type="number" 
                  placeholder="رقم..."
                  className="w-full h-9 rounded-md border bg-background pl-8 pr-3 text-sm focus-visible:ring-1 focus-visible:ring-primary outline-none transition-all"
                  value={gotoPage}
                  onChange={(e) => setGotoPage(e.target.value)}
                />
              </div>
              <Button type="submit" size="sm" variant="secondary" className="h-9">انتقل</Button>
           </form>
        </div>
        
        <div className="p-4 border-b space-y-3">
           <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">تصفية حسب الحالة</p>
           <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant={statusFilter === "all" ? "default" : "outline"} className="text-[10px] h-7 px-3 rounded-full" onClick={() => setStatusFilter("all")}>الكل</Button>
              <Button size="sm" variant={statusFilter === "needs_review" ? "default" : "outline"} className="text-[10px] h-7 px-3 rounded-full" onClick={() => setStatusFilter("needs_review")}>مراجعة</Button>
              <Button size="sm" variant={statusFilter === "published" ? "default" : "outline"} className="text-[10px] h-7 px-3 rounded-full" onClick={() => setStatusFilter("published")}>منشور</Button>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
           {results.map(p => (
             <button
               key={p.id}
               onClick={() => { setExpandedPageId(p.id); scrollToPage(p.page_number); }}
               className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${expandedPageId === p.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
             >
               <span className="font-medium">صفحة {p.page_number}</span>
               <div className={`h-2 w-2 rounded-full ${p.status === "Published" ? "bg-green-500" : p.status === "Completed" ? "bg-blue-500" : "bg-muted-foreground"}`} />
             </button>
           ))}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 overflow-y-auto scrollbar-hide px-2">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 sticky top-0 bg-background/80 backdrop-blur pb-4 z-10 print:hidden">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
               <Link to="/" className="hover:text-primary transition-colors">الرئيسية</Link>
               <span>/</span>
               <span className="text-foreground font-medium truncate max-w-[200px]">{bookStatus?.title || "..."}</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-gradient">{bookStatus?.title || "جاري التحميل..."}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary uppercase text-[10px] font-bold tracking-wider">{bookStatus?.progress} صفحات</Badge>
              <Badge
                variant={bookStatus?.status === "Processing" ? "secondary" : bookStatus?.status === "Stopped" ? "destructive" : "default"}
                className="uppercase text-[10px] font-bold tracking-wider"
              >
                {bookStatus?.status}
              </Badge>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            {/* Search Bar with Mode Toggle */}
            <div className="flex flex-col gap-2 flex-1 min-w-[350px]">
              <form onSubmit={handleSearch} className="relative flex items-center">
                <input 
                  type="text" 
                  placeholder={searchMode === "keyword" ? "بحث عن كلمات محددة..." : "بحث دلالي (بالمعنى)..."} 
                  value={searchQuery}
                  onFocus={() => setShowRecent(true)}
                  onBlur={() => setTimeout(() => setShowRecent(false), 200)}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-10 pr-10 pl-24 rounded-md border border-input bg-background/50 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                
                {/* Recent Searches Dropdown */}
                {showRecent && recentSearches.length > 0 && !searchResults.length && (
                  <div className="absolute top-11 left-0 right-0 z-[60] bg-background border rounded-lg shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="p-2 border-b bg-muted/30">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-2">عمليات بحث أخيرة</p>
                    </div>
                    <div className="p-1">
                      {recentSearches.map((s, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className="w-full text-right px-3 py-2 text-xs hover:bg-primary/5 rounded-md flex items-center justify-between group transition-colors"
                          onClick={() => { setSearchQuery(s); }}
                        >
                          <span>{s}</span>
                          <Search className="h-3 w-3 text-muted-foreground opacity-30 group-hover:opacity-100" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <Button 
                  type="submit" 
                  variant="ghost" 
                  size="sm" 
                  className="absolute right-0 top-0 h-10 px-3 hover:bg-transparent"
                >
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
                <div className="absolute left-2 top-1.5 flex bg-muted rounded p-0.5 border">
                   <button 
                     type="button"
                     onClick={() => setSearchMode("keyword")}
                     className={`text-[9px] px-2 py-1 rounded transition-colors ${searchMode === "keyword" ? "bg-background shadow-sm font-bold" : "text-muted-foreground"}`}
                   >كلمات</button>
                   <button 
                     type="button"
                     onClick={() => setSearchMode("semantic")}
                     className={`text-[9px] px-2 py-1 rounded transition-colors ${searchMode === "semantic" ? "bg-background shadow-sm font-bold" : "text-muted-foreground"}`}
                   >دلالي</button>
                </div>

                {/* Search Results Dropdown */}
                {searchResults.length > 0 && (
                  <Card className="absolute top-12 left-0 right-0 z-50 shadow-2xl border border-primary/20 bg-background/95 backdrop-blur-md overflow-hidden rounded-xl animate-in fade-in slide-in-from-top-2 duration-300">
                    <CardHeader className="bg-muted/30 py-2.5 flex flex-row items-center justify-between border-b px-4 transition-all">
                      <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">نتائج ({searchMode === "keyword" ? "كلمات" : "دلالي"}): {searchResults.length}</CardTitle>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full hover:bg-destructive/10 hover:text-destructive" onClick={() => setSearchResults([])}>×</Button>
                    </CardHeader>
                    <CardContent className="p-0 max-h-[400px] overflow-y-auto divide-y dark:divide-primary/10">
                      {searchResults.map((r) => (
                        <div 
                          key={r.id} 
                          className="group p-4 hover:bg-primary/5 cursor-pointer transition-all border-b last:border-b-0"
                          onClick={() => { 
                            setExpandedPageId(r.id); 
                            scrollToPage(r.page_number, r.status); 
                            setSearchResults([]); // Close dropdown on selection
                          }}
                        >
                          <div className="flex justify-between items-center mb-1.5">
                            <div className="flex items-center gap-2">
                              <div className="bg-primary/10 p-1.5 rounded-lg text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                                <FileCheck className="h-3.5 w-3.5" />
                              </div>
                              <span className="font-bold text-xs tracking-tight">صفحة {r.page_number}</span>
                            </div>
                            {searchMode === "semantic" && (
                              <Badge variant="outline" className="text-[8px] font-bold border-primary/30 text-primary bg-primary/5 uppercase px-1.5 py-0">
                                دقة: {Math.round(r.score * 100)}%
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2" dir="rtl">{r.extracted_text}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </form>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={handleResplitPages}
                disabled={isResplittingPages || bookStatus?.status === "Processing"}
              >
                {isResplittingPages ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Scissors className="h-4 w-4 ml-2" />}
                إعادة تقطيع الصفحات
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleStopBook}
                disabled={isStoppingBook || !(bookStatus?.status === "Processing" || bookStatus?.status === "Pending")}
                className="border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                {isStoppingBook ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <CircleStop className="h-4 w-4 ml-2" />}
                إيقاف
              </Button>
              <Button size="sm" variant="default" onClick={handlePublishAll} disabled={isPublishingAll || results.length === 0} className="bg-green-600 hover:bg-green-700 text-white">
                {isPublishingAll ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 ml-2" />}
                نشر الكل
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="h-4 w-4 ml-2" />
                طباعة
              </Button>
              <Button size="sm" onClick={async () => {
                setIsExporting(true)
                window.open(`${API_URL}/books/${id}/export`, "_blank")
                setIsExporting(false)
              }} disabled={isExporting}>
                <Download className="h-4 w-4 ml-2" />
                {isExporting ? "..." : "تصدير Word"}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleDeleteBook}
                disabled={isDeletingBook || bookStatus?.status === "Processing"}
              >
                {isDeletingBook ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Trash2 className="h-4 w-4 ml-2" />}
                حذف الكتاب
              </Button>
            </div>
          </div>
        </header>

        {/* Global Progress */}
        <div className="mb-6 print:hidden">
           <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-medium">تقدم المعالجة</span>
              <span className="text-xs text-muted-foreground">{Math.round(bookStatus?.progress_percent || 0)}%</span>
           </div>
           <Progress value={bookStatus?.progress_percent || 0} className="h-1.5" />
        </div>


        {/* Page List Rendering */}
        <div className="space-y-8">
          {isWaitingForPages && (
            <Card className="border-dashed border-primary/30 bg-primary/5">
              <CardContent className="p-6 flex items-center gap-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <div>
                  <p className="font-semibold">جاري تجهيز الصفحات في الخلفية</p>
                  <p className="text-sm text-muted-foreground">سيظهر المحتوى هنا تلقائياً بعد اكتمال تحويل الملفات ثم بدء OCR.</p>
                </div>
              </CardContent>
            </Card>
          )}
          {filteredResults.map((page) => {
            const imagePathFormatted = page.image_path.replace(/\\/g, "/")
            const imgParts = imagePathFormatted.split("uploads/")
            const relativePath = imgParts.length > 1 ? imgParts[1] : imagePathFormatted
            const imageUrl = `${BACKEND_URL}/uploads/${relativePath}`
            const isProcessing = page.status === "Processing" || page.status === "Pending"
            const isPublished = page.status === "Published"

            return (
              <Card 
                key={page.id} 
                id={`page-${page.page_number}`}
                className={`overflow-hidden transition-all duration-300 ${expandedPageId === page.id ? "ring-2 ring-primary shadow-lg" : "opacity-80 hover:opacity-100"} print:shadow-none print:border-none print:mb-0 print:break-after-page`}
              >
                <CardHeader className="bg-muted/30 px-6 py-3 print:hidden border-b cursor-pointer group hover:bg-muted/50 transition-colors" onClick={() => setExpandedPageId(prev => prev === page.id ? null : page.id)}>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className="bg-background p-1.5 rounded-md border shadow-sm group-hover:scale-110 transition-transform">
                        <FileCheck className={`h-4 w-4 ${isPublished ? "text-green-500" : "text-muted-foreground opacity-20"}`} />
                      </div>
                      <span className="font-bold text-lg">صفحة {page.page_number}</span>
                      <Badge variant={isPublished ? "default" : page.status === "Completed" ? "secondary" : "outline"} className="rounded-full px-3 text-[10px]">
                        {isPublished ? "تم النشر" : page.status === "Completed" ? "بانتظار المراجعة" : "معالجة..."}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                       <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleRegeneratePage(page.id); }} disabled={isProcessing}>
                         <RefreshCw className={`h-3 w-3 ${savingPages[page.id] ? "animate-spin" : ""}`} />
                       </Button>
                       <ChevronDown className={`h-4 w-4 transition-transform ${expandedPageId === page.id ? "rotate-180" : ""}`} />
                    </div>
                  </div>
                </CardHeader>
                
                {expandedPageId === page.id && (
                  <CardContent className="p-0">
                    <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x lg:divide-x-reverse print:block">
                      {/* Image Preview */}
                      <div className="p-4 bg-muted/10 flex items-start justify-center min-h-[400px] border-l dark:border-border print:hidden relative">
                         <div className="relative group ring-1 ring-black/5 dark:ring-white/5 rounded-lg overflow-hidden bg-white dark:bg-muted shadow-sm">
                           <img src={imageUrl} alt={`Page ${page.page_number}`} className="max-w-full max-h-[700px] object-contain" />
                           {isProcessing && (
                             <div className="absolute inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center">
                               <div className="flex flex-col items-center gap-2">
                                 <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                 <span className="text-sm font-semibold">جاري التحليل...</span>
                               </div>
                             </div>
                           )}
                         </div>
                      </div>

                      {/* Content / Editor */}
                      <div className="p-6 flex flex-col bg-background print:p-0 print:bg-white border-r">
                        <div className="flex items-center justify-between mb-4 print:hidden">
                           <div className="flex gap-2">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 rounded-full"
                                disabled={page.page_number <= 1}
                                onClick={() => {
                                  const prev = results.find(p => p.page_number === page.page_number - 1)
                                  if (prev) { setExpandedPageId(prev.id); scrollToPage(prev.page_number, prev.status); }
                                }}
                              >
                                <ArrowRight className="h-4 w-4 ml-1" />
                                السابق
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 rounded-full"
                                disabled={page.page_number >= results.length}
                                onClick={() => {
                                  const next = results.find(p => p.page_number === page.page_number + 1)
                                  if (next) { setExpandedPageId(next.id); scrollToPage(next.page_number, next.status); }
                                }}
                              >
                                التالي
                                <ArrowLeft className="h-4 w-4 mr-1" />
                              </Button>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">تحرير المحتوى</span>
                              {isPublished && (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-6 text-[10px] rounded-full hover:bg-primary/10 hover:text-primary transition-all px-2"
                                  onClick={() => handlePublishPage(page.id, "Completed")}
                                  disabled={savingPages[page.id]}
                                >
                                  <RefreshCw className={`h-3 w-3 ml-1 ${savingPages[page.id] ? "animate-spin" : ""}`} />
                                  تعديل مجدداً
                                </Button>
                              )}
                            </div>
                         </div>
                        {isPublished ? (
                          <div className="scientific-page-container w-full bg-white dark:bg-[#ffffff] border dark:border-white/10 shadow-2xl print:border-none print:shadow-none p-8 lg:p-16 print:p-[20mm] rounded-sm self-center max-w-[850px] transition-all hover:shadow-primary/5 select-text" style={{ minHeight: '1100px' }}>
                             {/* Decorative header lines */}
                             <div className="flex justify-between items-baseline mb-16 border-b-2 border-black/80 pb-4 px-4 font-serif text-xl font-extrabold tracking-widest text-black/90">
                                <span className="uppercase text-sm tracking-[0.2em]">{bookStatus?.title || "DOC-ID"}</span>
                                <span className="italic text-base">-{page.page_number}-</span>
                             </div>
                             <div 
                               className="scientific-page-content px-4 min-h-[800px] print:text-justify text-xl leading-[2.2] font-serif text-black text-right"
                               dir="rtl"
                               dangerouslySetInnerHTML={{ __html: (editingTexts[page.id] || "").replace(/\n/g, '<br/>') }}
                             />
                          </div>
                        ) : (
                          <div className="flex flex-col h-full">
                            <div className="mb-4 flex items-center justify-between">
                              <h3 className="text-sm font-semibold text-muted-foreground uppercase">مراجعة النص والتحرير</h3>
                              <Button 
                                size="sm" 
                                onClick={() => handlePublishPage(page.id, "Published")}
                                disabled={savingPages[page.id] || isProcessing}
                              >
                                {savingPages[page.id] ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <CheckCircle2 className="h-4 w-4 ml-2" />}
                                اعتماد ونشر
                              </Button>
                            </div>
                            <Textarea
                              dir="rtl"
                              value={editingTexts[page.id] || ""}
                              onChange={(e) => setEditingTexts(prev => ({ ...prev, [page.id]: e.target.value }))}
                              className="flex-1 min-h-[500px] text-lg leading-relaxed font-serif resize-none border-none focus-visible:ring-1 focus-visible:ring-ring bg-transparent p-4"
                              placeholder="اكتب أو عدل النص هنا..."
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
