import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import axios from "axios"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
// import { ScrollArea } from "@/components/ui/scroll-area" // Unused after refactor to scientific layout
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle2, AlertCircle, FileText, Printer, Download, RefreshCw } from "lucide-react"

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
  const [editingTexts, setEditingTexts] = useState<Record<string, string>>({})
  const [savingPages, setSavingPages] = useState<Record<string, boolean>>({})
  
  const fetchResults = async () => {
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
  }

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>
    
    const fetchStatus = async () => {
      try {
        const res = await axios.get(`${API_URL}/books/${id}/status`)
        setBookStatus(res.data)
        
        // If results are available or processing is done, fetch/refresh results
        fetchResults()

        if (res.data.status === "Completed") {
          clearInterval(interval)
        }
      } catch (error) {
        console.error(error)
      }
    }

    fetchStatus()
    
    // Poll every 3 seconds if processing
    interval = setInterval(() => {
      if (bookStatus?.status !== "Completed" && bookStatus?.status !== "Failed") {
        fetchStatus()
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [id])

  const handleExport = () => {
    window.open(`${API_URL}/books/${id}/export`, "_blank")
  }

  const handlePrint = () => {
    window.print()
  }

  const handleReprocess = async () => {
    try {
      setIsReprocessing(true)
      await axios.post(`${API_URL}/books/${id}/process`)
      setBookStatus(prev => prev ? { ...prev, status: "Processing" } : null)
      setResults([])
    } catch (error) {
      console.error("Failed to reprocess:", error)
    } finally {
      setIsReprocessing(false)
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

  const handleTextChange = (pageId: string, text: string) => {
    setEditingTexts(prev => ({ ...prev, [pageId]: text }))
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-center print:hidden">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">تفاصيل الكتاب</h1>
          <p className="text-muted-foreground mt-1">إدارة الصفحات، مراجعة النصوص، والطباعة العلمية</p>
        </div>
        <div className="space-x-2 space-x-reverse flex">
           <Button
             variant="secondary"
             onClick={handleReprocess}
             disabled={bookStatus?.status === "Processing" || isReprocessing}
           >
             <RefreshCw className={`h-4 w-4 ml-2 ${isReprocessing || bookStatus?.status === "Processing" ? "animate-spin" : ""}`} />
             {isReprocessing ? "جاري البدء..." : "إعادة المعالجة"}
           </Button>
           <Button variant="outline" onClick={handlePrint}>
             <Printer className="h-4 w-4 ml-2" />
             طباعة
           </Button>
           <Button onClick={handleExport}>
             <Download className="h-4 w-4 ml-2" />
             تصدير نصي
           </Button>
        </div>
      </div>

      {/* Global Progress Bar */}
      <Card className="print:hidden">
        <CardContent className="pt-6">
          <div className="flex justify-between items-end mb-2">
            <div className="space-y-1">
              <p className="text-sm font-medium">تقدم المعالجة الإجمالي</p>
              <p className="text-2xl font-bold">{bookStatus?.progress || "0/0"}</p>
            </div>
            <p className="text-sm text-muted-foreground">{Math.round(bookStatus?.progress_percent || 0)}%</p>
          </div>
          <Progress value={bookStatus?.progress_percent || 0} className="h-3" />
        </CardContent>
      </Card>

      {bookStatus?.status === "Failed" && (
        <Card className="border-red-500 bg-red-50 print:hidden">
          <CardHeader>
            <CardTitle className="text-red-500 flex items-center">
              <AlertCircle className="h-5 w-5 ml-2" />
              فشل المعالجة
            </CardTitle>
            <CardDescription className="text-red-700">حدث خطأ غير متوقع أثناء المعالجة.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleReprocess} variant="destructive" disabled={isReprocessing}>
              {isReprocessing ? "جاري البدء..." : "إعادة المحاولة"}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-8">
        {results.length === 0 && bookStatus?.status === "Processing" ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-10 w-10 animate-spin mb-4" />
            <p>جاري تحضير الصفحات للمعالجة...</p>
          </div>
        ) : (
          results.map((page) => {
            const imagePathFormatted = page.image_path.replace(/\\/g, "/")
            const imgParts = imagePathFormatted.split("uploads/")
            const relativePath = imgParts.length > 1 ? imgParts[1] : imagePathFormatted
            const imageUrl = `${BACKEND_URL}/uploads/${relativePath}`
            
            const isProcessing = page.status === "Processing" || page.status === "Pending"
            const isCompleted = page.status === "Completed"
            const isPublished = page.status === "Published"

            return (
              <Card key={page.id} className={`overflow-hidden transition-all duration-300 ${isProcessing ? "border-blue-200 shadow-md ring-1 ring-blue-100" : ""} print:shadow-none print:border-none print:mb-0 print:break-after-page`}>
                <CardHeader className="bg-muted/30 px-6 py-4 print:hidden border-b">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-lg">صفحة {page.page_number}</span>
                      <Badge variant={isPublished ? "default" : isCompleted ? "secondary" : isProcessing ? "outline" : "destructive"} className={isProcessing ? "animate-pulse" : ""}>
                        {isPublished ? "منشور ✓" : isCompleted ? "مكتمل" : isProcessing ? "جاري المعالجة..." : "فشل"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                       {isPublished && (
                         <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => handlePublishPage(page.id, "Completed")}>
                           إعادة للمراجعة
                         </Button>
                       )}
                       {(isCompleted || isPublished) && (
                         <span className="text-sm font-medium text-muted-foreground flex items-center">
                           <CheckCircle2 className="h-4 w-4 ml-1 text-green-500" />
                           دقة الذكاء: {Math.round(page.confidence * 100)}%
                         </span>
                       )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {isPublished ? (
                    /* Published View - Side by side with original image for reference in UI */
                    <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x lg:divide-x-reverse print:block">
                      {/* Original Image Column (Hidden in print) */}
                      <div className="p-4 bg-muted/10 flex items-start justify-center min-h-[400px] border-l print:hidden">
                        <div className="relative group ring-1 ring-black/5 rounded-lg overflow-hidden bg-white shadow-sm">
                          <img src={imageUrl} alt={`Page ${page.page_number}`} className="max-w-full max-h-[700px] object-contain" />
                        </div>
                      </div>

                      {/* Professional Book Style Column */}
                      <div className="p-6 lg:p-10 flex flex-col bg-muted/5 print:p-0 print:bg-white">
                        <div className="scientific-page-container w-full bg-white border shadow-sm print:border-none print:shadow-none p-8 lg:p-12 print:p-[20mm]">
                          {/* Book Header for Scientific Layout */}
                          <div className="flex justify-between items-baseline mb-12 border-b-2 border-black pb-2 px-2 font-serif text-xl font-bold">
                             <span className="flex-1 text-right">{bookStatus?.title || "المقدمة"}</span>
                             <span className="">{page.page_number}</span>
                             {/* <span className="flex-1 text-left">{page.page_number % 2 === 0 ? "الفقه الإسلامي" : "أصول الفقه"}</span> */}
                          </div>
                          
                          <div 
                           className="scientific-page-content px-4 min-h-[600px] print:text-justify text-xs htm-content"
                           dangerouslySetInnerHTML={{ __html: editingTexts[page.id] }}
                        />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Review/Editor View */
                    <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x lg:divide-x-reverse print:hidden">
                      {/* Image Column */}
                      <div className={`p-4 bg-muted/10 flex items-start justify-center min-h-[400px] border-l ${isProcessing ? "opacity-50" : ""}`}>
                        <div className="relative group ring-1 ring-black/5 rounded-lg overflow-hidden bg-white shadow-sm">
                          <img src={imageUrl} alt={`Page ${page.page_number}`} className="max-w-full max-h-[700px] object-contain" />
                          {isProcessing && (
                            <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] flex items-center justify-center">
                              <div className="flex flex-col items-center gap-2">
                                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                                <span className="text-sm font-semibold text-blue-800">جاري التحليل...</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Editor Column */}
                      <div className="p-6 flex flex-col">
                        {isProcessing ? (
                          <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-20 lg:py-0">
                             <FileText className="h-12 w-12 mb-4 opacity-20" />
                             <p className="text-center">النص سيظهر هنا بمجرد انتهاء الذكاء الاصطناعي من القراءة</p>
                          </div>
                        ) : (
                          <>
                            <div className="flex-1">
                              <div className="mb-4 flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">مراجعة وتعديل النص</h3>
                                <Button 
                                  size="sm" 
                                  onClick={() => handlePublishPage(page.id, "Published")}
                                  disabled={savingPages[page.id]}
                                >
                                  {savingPages[page.id] ? (
                                    <Loader2 className="h-4 w-4 animate-spin ml-2" />
                                  ) : (
                                    <CheckCircle2 className="h-4 w-4 ml-2" />
                                  )}
                                  اعتماد ونشر
                                </Button>
                              </div>
                              
                              <Textarea
                                dir="rtl"
                                value={editingTexts[page.id] || ""}
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleTextChange(page.id, e.target.value)}
                                className="min-h-[500px] text-lg leading-relaxed font-serif resize-none border-none focus-visible:ring-1 focus-visible:ring-ring bg-white p-4"
                                placeholder="اكتب أو عدل النص هنا..."
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
