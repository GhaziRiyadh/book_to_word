import { useState } from "react"
import { useNavigate } from "react-router-dom"
import axios from "axios"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

const API_URL = "http://localhost:8000/api/v1"

export function UploadPage() {
  const [title, setTitle] = useState("")
  const [files, setFiles] = useState<FileList | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progressText, setProgressText] = useState("")
  const navigate = useNavigate()
  const { toast } = useToast()

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title || !files || files.length === 0) return

    setUploading(true)
    const formData = new FormData()
    formData.append("title", title)
    
    for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i])
    }

    try {
      setProgressText("جاري رفع الملفات...")
      const res = await axios.post(`${API_URL}/books/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      })
      
      const bookId = res.data.book_id

      // Sequential front-end driven processing: process each page after previous completes.
      const statusRes = await axios.get(`${API_URL}/books/${bookId}/status`)
      const pages = (statusRes.data.pages || [])
        .slice()
        .sort((a: { page_number: number }, b: { page_number: number }) => a.page_number - b.page_number)

      let processedCount = 0
      const totalPages = pages.length
      for (const page of pages) {
        if (page.status === "Published") {
          processedCount += 1
          continue
        }

        setProgressText(`جاري معالجة الصفحة ${page.page_number} من ${totalPages}...`)
        await axios.post(`${API_URL}/pages/${page.id}/process`, null, {
          params: { background: false }
        })
        processedCount += 1
      }

      toast({
        title: "تم الرفع بنجاح",
        description: `اكتملت معالجة ${processedCount} صفحة بنجاح.`,
      })
      navigate(`/books/${bookId}`)
    } catch (error) {
      console.error(error)
      toast({
        title: "حدث خطأ",
        description: "لم يتم رفع الكتاب، يرجى المحاولة مرة أخرى.",
        variant: "destructive"
      })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>رفع ملف جديد</CardTitle>
          <CardDescription>ارفع كتاب بصيغة PDF أو مجموعة من صور الصفحات للبدء باستخراج النصوص.</CardDescription>
        </CardHeader>
        <form onSubmit={handleUpload}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">عنوان الكتاب أو المستند</Label>
              <Input 
                id="title" 
                placeholder="أدخل العنوان هنا..." 
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
                required 
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="file">الملفات (PDF أو صور)</Label>
              <Input 
                id="file" 
                type="file" 
                multiple 
                accept=".pdf,image/*" 
                onChange={(e) => setFiles(e.target.files)} 
                required 
                className="cursor-pointer"
              />
              <p className="text-xs text-muted-foreground mt-1">يمكنك تحديد ملف PDF واحد أو عدة صور معاً.</p>
            </div>
            {uploading && progressText ? (
              <p className="text-sm text-muted-foreground">{progressText}</p>
            ) : null}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={uploading}>
              {uploading ? "جاري التنفيذ..." : "رفع وبدء المعالجة"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
