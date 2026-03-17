import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import axios from "axios"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"

const API_URL = "http://localhost:8000/api/v1"
const BACKEND_URL = "http://localhost:8000"

type PageResult = {
  page_number: number
  image_path: string
  extracted_text: string
  confidence: number
  status: string
}

type BookStatus = {
  status: string
  progress: string
  pages: { page_number: number, status: string }[]
}

export function BookDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const [bookStatus, setBookStatus] = useState<BookStatus | null>(null)
  const [results, setResults] = useState<PageResult[]>([])
  
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>
    
    const fetchStatus = async () => {
      try {
        const res = await axios.get(`${API_URL}/books/${id}/status`)
        setBookStatus(res.data)
        
        if (res.data.status === "Completed") {
          fetchResults()
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
  }, [id, bookStatus?.status])

  const fetchResults = async () => {
    try {
      const res = await axios.get(`${API_URL}/books/${id}/results`)
      setResults(res.data.results)
    } catch (error) {
      console.error(error)
    }
  }

  const handleExport = () => {
    window.open(`${API_URL}/books/${id}/export`, "_blank")
  }

  const handlePrint = () => {
    window.print()
  }

  // Calculate percentage
  let percentage = 0
  if (bookStatus && bookStatus.progress) {
    const [completed, total] = bookStatus.progress.split("/").map(Number)
    percentage = total > 0 ? (completed / total) * 100 : 0
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">تفاصيل الكتاب</h1>
        <div className="space-x-2 space-x-reverse flex">
           <Button variant="outline" onClick={handlePrint}>طباعة</Button>
           <Button onClick={handleExport}>تصدير ملف نصي</Button>
        </div>
      </div>

      {(bookStatus?.status === "Pending" || bookStatus?.status === "Processing") && (
        <Card>
          <CardHeader>
            <CardTitle>جاري المعالجة</CardTitle>
            <CardDescription>يتم الآن تحليل الصور واستخراج النصوص...</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={percentage} />
            <p className="text-sm text-center text-muted-foreground">{bookStatus.progress} صفحة منجزة</p>
          </CardContent>
        </Card>
      )}

      {bookStatus?.status === "Failed" && (
        <Card className="border-red-500">
          <CardHeader>
            <CardTitle className="text-red-500">فشل المعالجة</CardTitle>
            <CardDescription>حدث خطأ غير متوقع أثناء المعالجة.</CardDescription>
          </CardHeader>
        </Card>
      )}

      {bookStatus?.status === "Completed" && results.length > 0 && (
        <div className="space-y-8">
          {results.map((page, index) => {
            // Fix path to frontend URL
            // Replace backslashes and point to /uploads/
            const imagePathFormatted = page.image_path.replace(/\\/g, "/")
            const imgParts = imagePathFormatted.split("uploads/")
            const relativePath = imgParts.length > 1 ? imgParts[1] : imagePathFormatted
            const imageUrl = `${BACKEND_URL}/uploads/${relativePath}`

            return (
              <Card key={index} className="overflow-hidden print:shadow-none print:border-none">
                <CardHeader className="bg-muted/50 print:hidden">
                  <CardTitle className="flex justify-between">
                    <span>صفحة {page.page_number}</span>
                    <span className="text-sm font-normal text-muted-foreground">تطابق التعرف: {Math.round(page.confidence * 100)}%</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x md:divide-x-reverse print:block">
                    {/* Image Column */}
                    <div className="p-4 bg-muted/20 flex items-start justify-center min-h-[500px] print:hidden">
                      <img src={imageUrl} alt={`Page ${page.page_number}`} className="max-w-full max-h-[800px] object-contain shadow-sm border" />
                    </div>
                    {/* Text Column */}
                    <div className="p-6 print:p-0">
                      <ScrollArea className="h-[500px] w-full print:h-auto">
                        <div className="whitespace-pre-wrap font-serif text-lg leading-loose min-h-full">
                          {page.extracted_text || <span className="text-muted-foreground italic">لم يتم استخراج نص من هذه الصفحة.</span>}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
