import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "react-router-dom"
import axios from "axios"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
// import { ScrollArea } from "@/components/ui/scroll-area" // Unused after refactor to scientific layout
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle2, Printer, Download, RefreshCw, ChevronDown } from "lucide-react"

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
  const [bookStatus, setBookStatus] = useState<BookStatus | null>(null)
  const [results, setResults] = useState<PageResult[]>([])
  const [isReprocessing, setIsReprocessing] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [resumeAttempted, setResumeAttempted] = useState(false)
  const [expandedPageId, setExpandedPageId] = useState<string | null>(null)
  const [editingTexts, setEditingTexts] = useState<Record<string, string>>({})
  const [savingPages, setSavingPages] = useState<Record<string, boolean>>({})
  
  // Advanced Search & Navigation State
  const [searchQuery, setSearchQuery] = useState("")
  const [searchMode, setSearchMode] = useState<"semantic" | "keyword">("keyword")
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [gotoPage, setGotoPage] = useState("")
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

    const init = async () => {
      await fetchBookStatus(false)
      await fetchResults()
    }
    init()
  }, [id, fetchBookStatus, fetchResults])

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>

    // Poll every 3 seconds only while a book is processing.
    interval = setInterval(() => {
      if (currentBookStatusRef.current === "Processing") {
        fetchBookStatus(true)
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [id, fetchBookStatus])


  const handleReprocess = async () => {
    try {
      setIsReprocessing(true)

      const statusRes = await axios.get(`${API_URL}/books/${id}/status`)
      setBookStatus(statusRes.data)
      currentBookStatusRef.current = "Processing"
      const pages = (statusRes.data.pages || [])
        .slice()
        .sort((a: { page_number: number }, b: { page_number: number }) => a.page_number - b.page_number)

      for (const page of pages) {
        if (page.status === "Published" || page.status === "Completed") {
          continue
        }
        await axios.post(`${API_URL}/pages/${page.id}/process`)
        setExpandedPageId(page.id)
        setTimeout(() => scrollToPage(page.page_number), 100)
        await fetchResults()
      }

      setBookStatus(prev => prev ? { ...prev, status: "Processing" } : null)
      await fetchBookStatus(true)
    } catch (error) {
      console.error("Failed to reprocess:", error)
    } finally {
      setIsReprocessing(false)
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
        if (statusRes.data.status === "Processing") {
          setResumeAttempted(true)
          await handleReprocess()
          return
        }

        setResumeAttempted(true)
      } catch (error) {
        console.error("Failed to resume processing after refresh:", error)
        setResumeAttempted(true)
      }
    }

    resumeAfterRefresh()
  }, [id, resumeAttempted, isReprocessing])

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
         setTimeout(() => scrollToPage(num), 100)
       }
    }
    setGotoPage("")
  }

  const scrollToPage = (pageNumber: number) => {
    const element = document.getElementById(`page-${pageNumber}`)
    if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6 overflow-hidden px-4 sm:px-6">
      {/* Side Navigation Sidebar */}
      <aside className="w-64 flex-shrink-0 border-l bg-muted/10 rounded-lg flex flex-col print:hidden">
        <div className="p-4 border-b">
           <h2 className="font-bold text-lg mb-4">فهرس الصفحات</h2>
           <form onSubmit={handleGotoPage} className="flex gap-2">
              <input 
                type="number" 
                placeholder="رقم..."
                className="flex-1 h-9 rounded-md border bg-background px-3 text-sm"
                value={gotoPage}
                onChange={(e) => setGotoPage(e.target.value)}
              />
              <Button type="submit" size="sm" variant="secondary">انتقل</Button>
           </form>
        </div>
        
        <div className="p-4 border-b space-y-2">
           <p className="text-xs font-semibold uppercase text-muted-foreground">تصفية حسب الحالة</p>
           <div className="flex flex-wrap gap-1">
              <Button size="sm" variant={statusFilter === "all" ? "default" : "outline"} className="text-[9px] h-6 px-2" onClick={() => setStatusFilter("all")}>الكل</Button>
              <Button size="sm" variant={statusFilter === "needs_review" ? "default" : "outline"} className="text-[9px] h-6 px-2" onClick={() => setStatusFilter("needs_review")}>مراجعة</Button>
              <Button size="sm" variant={statusFilter === "published" ? "default" : "outline"} className="text-[9px] h-6 px-2" onClick={() => setStatusFilter("published")}>منشور</Button>
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
      <div className="flex-1 flex flex-col min-w-0 pb-20 overflow-y-auto scrollbar-hide">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 sticky top-0 bg-background/80 backdrop-blur pb-4 z-10 print:hidden">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{bookStatus?.title || "جاري التحميل..."}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline">{bookStatus?.progress} صفحة معالجة</Badge>
              <Badge variant={bookStatus?.status === "Processing" ? "secondary" : "default"}>{bookStatus?.status}</Badge>
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
                   onChange={(e) => setSearchQuery(e.target.value)}
                   className="w-full h-10 pr-10 pl-24 rounded-md border border-input bg-background/50 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                 />
                 <Button 
                   type="submit" 
                   variant="ghost" 
                   size="sm" 
                   className="absolute right-0 top-0 h-10 px-3 hover:bg-transparent"
                 >
                   {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
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
              </form>
            </div>

            <div className="flex gap-2">
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

        {/* Search Results */}
        {searchResults.length > 0 && (
          <Card className="mb-6 border-blue-200 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-900/10 print:hidden overflow-hidden">
            <CardHeader className="bg-blue-100/50 dark:bg-blue-900/20 py-2 flex flex-row items-center justify-between">
              <CardTitle className="text-xs">نتائج ({searchMode === "keyword" ? "كلمات" : "دلالي"}): {searchResults.length}</CardTitle>
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setSearchResults([])}>إغلاق</Button>
            </CardHeader>
            <CardContent className="p-0 max-h-[300px] overflow-y-auto divide-y dark:divide-blue-900/50">
              {searchResults.map((r) => (
                <div 
                  key={r.id} 
                  className="p-3 hover:bg-blue-100/30 dark:hover:bg-blue-900/20 cursor-pointer transition-colors"
                  onClick={() => { setExpandedPageId(r.id); scrollToPage(r.page_number); }}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-xs">صفحة {r.page_number}</span>
                    {searchMode === "semantic" && <Badge variant="secondary" className="text-[9px]">دقة: {Math.round(r.score * 100)}%</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2" dir="rtl">{r.extracted_text}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Page List Rendering */}
        <div className="space-y-8">
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
                <CardHeader className="bg-muted/30 px-6 py-3 print:hidden border-b cursor-pointer" onClick={() => setExpandedPageId(prev => prev === page.id ? null : page.id)}>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="font-bold">صفحة {page.page_number}</span>
                      <Badge variant={isPublished ? "default" : page.status === "Completed" ? "secondary" : "outline"}>
                        {isPublished ? "منشور" : page.status === "Completed" ? "بانتظار المراجعة" : "معالجة..."}
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
                        {isPublished ? (
                          <div className="scientific-page-container w-full bg-white dark:bg-card border dark:border-border shadow-sm print:border-none print:shadow-none p-8 lg:p-12 print:p-[20mm]">
                             <div className="flex justify-between items-baseline mb-12 border-b-2 border-black dark:border-foreground pb-2 px-2 font-serif text-xl font-bold">
                               <span className="flex-1 text-right">{bookStatus?.title}</span>
                               <span>{page.page_number}</span>
                             </div>
                             <div 
                               className="scientific-page-content px-4 min-h-[600px] print:text-justify text-xs htm-content"
                               dangerouslySetInnerHTML={{ __html: editingTexts[page.id] }}
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
