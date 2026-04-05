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
      const res = await axios.post(`${API_URL}/books/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      })
      
      const bookId = res.data.book_id

      toast({
        title: "تم الرفع بنجاح",
        description: "تم رفع الكتاب فقط. ابدأ المعالجة من زر إعادة المعالجة.",
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
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={uploading}>
              {uploading ? "جاري الرفع..." : "رفع فقط"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
