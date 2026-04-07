import { useState, useRef } from "react"
import { useNavigate } from "react-router-dom"
import axios from "axios"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { UploadCloud, File as FileIcon, FileImage, X, Loader2 } from "lucide-react"

const API_URL = "http://localhost:8000/api/v1"

export function UploadPage() {
  const [title, setTitle] = useState("")
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { toast } = useToast()

  // --- Drag and Drop Handlers ---
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const newFiles = Array.from(e.dataTransfer.files)
      // Filter out non-PDF/Images if needed, or just warn
      setSelectedFiles((prev) => [...prev, ...newFiles])
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    if (e.target.files && e.target.files[0]) {
      const newFiles = Array.from(e.target.files)
      setSelectedFiles((prev) => [...prev, ...newFiles])
    }
  }

  const removeFile = (indexToRemove: number) => {
    setSelectedFiles((prev) => prev.filter((_, index) => index !== indexToRemove))
  }

  const onZoneClick = () => {
    inputRef.current?.click()
  }

  // --- Upload Handler ---
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title || selectedFiles.length === 0) {
        toast({
            title: "بيانات ناقصة",
            description: "تأكد من إدخال عنوان الكتاب واختيار ملف واحد على الأقل.",
            variant: "destructive"
        })
        return
    }

    setUploading(true)
    const formData = new FormData()
    formData.append("title", title)
    
    selectedFiles.forEach(file => {
        formData.append("files", file)
    })

    try {
      const res = await axios.post(`${API_URL}/books/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      })
      
      const bookId = res.data.book_id

      toast({
        title: "تم الرفع بنجاح",
        description: "تم رفع الكتاب. سيتم نقلك للصفحة الخاصة به لتبدأ المعالجة.",
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
    <div className="max-w-2xl mx-auto space-y-8 pb-12">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-extrabold tracking-tight text-gradient">رفع مستند جديد</h1>
        <p className="text-muted-foreground text-lg">أضف كتابك ليقوم النظام بتحليله واستخراج النصوص منه بدقة عالية.</p>
      </div>

      <Card className="premium-shadow border-none bg-card/50 backdrop-blur-sm overflow-hidden">
        {/* Top decorative gradient bar */}
        <div className="h-2 w-full bg-gradient-to-r from-primary via-blue-500 to-indigo-500" />
        
        <form onSubmit={handleUpload}>
          <CardContent className="space-y-8 p-8 pt-6">
            <div className="space-y-3">
              <Label htmlFor="title" className="text-base font-semibold">عنوان الكتاب أو المستند <span className="text-destructive">*</span></Label>
              <Input 
                id="title" 
                placeholder="مثال: رسالة الماجستير، كتاب التاريخ الجزء الأول..." 
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
                required 
                className="text-lg py-6 bg-background/50 focus-visible:ring-primary/50 transition-all border-muted"
                disabled={uploading}
              />
            </div>
            
            <div className="space-y-3">
              <Label className="text-base font-semibold">الملفات (PDF أو مجموعة صور) <span className="text-destructive">*</span></Label>
              
              {/* Drag & Drop Zone */}
              <div 
                className={`relative group rounded-2xl border-2 border-dashed transition-all duration-300 ease-in-out cursor-pointer p-10 flex flex-col items-center justify-center text-center space-y-4
                  ${dragActive 
                    ? "border-primary bg-primary/5 scale-[1.01]" 
                    : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
                  }
                  ${uploading ? "opacity-50 pointer-events-none" : ""}
                `}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={onZoneClick}
              >
                <input 
                  ref={inputRef}
                  type="file" 
                  multiple 
                  accept=".pdf,image/*" 
                  onChange={handleChange} 
                  className="hidden"
                />
                
                <div className="p-4 bg-background rounded-full shadow-sm group-hover:scale-110 transition-transform duration-300">
                  <UploadCloud className={`h-10 w-10 ${dragActive ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                
                <div>
                  <p className="text-lg font-medium mb-1">
                    اسحب وأفلت الملفات هنا، أو <span className="text-primary font-bold">استعرض ملفاتك</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    يدعم ملف PDF واحد، أو مجموعة صور (PNG, JPG).
                  </p>
                </div>
                
                {/* Visual overlay when dragging */}
                {dragActive && (
                  <div className="absolute inset-0 bg-primary/5 rounded-2xl flex items-center justify-center" />
                )}
              </div>

              {/* File Previews */}
              {selectedFiles.length > 0 && (
                <div className="pt-4 space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">الملفات المحددة ({selectedFiles.length})</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {selectedFiles.map((file, idx) => {
                      const isPdf = file.name.toLowerCase().endsWith('.pdf')
                      return (
                        <div key={`${file.name}-${idx}`} className="flex items-center justify-between p-3 bg-muted/40 rounded-xl border border-muted/50 group/item hover:bg-muted/80 transition-colors">
                          <div className="flex items-center space-x-3 space-x-reverse overflow-hidden">
                            <div className="p-2 bg-background rounded-lg shadow-sm shrink-0">
                                {isPdf ? (
                                    <FileIcon className="h-5 w-5 text-red-500" />
                                ) : (
                                    <FileImage className="h-5 w-5 text-blue-500" />
                                )}
                            </div>
                            <div className="truncate">
                              <p className="text-sm font-medium truncate" title={file.name}>{file.name}</p>
                              <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                            </div>
                          </div>
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0 opacity-50 group-hover/item:opacity-100 transition-opacity rounded-full bg-background/50 hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeFile(idx)
                            }}
                            disabled={uploading}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="p-8 pt-0">
            <Button 
              type="submit" 
              size="lg" 
              className="w-full text-lg font-bold rounded-xl h-14 shadow-lg hover:shadow-primary/25 transition-all" 
              disabled={uploading || selectedFiles.length === 0}
            >
              {uploading ? (
                 <>
                   <Loader2 className="ml-2 h-6 w-6 animate-spin" />
                   جاري رفع الملفات...
                 </>
              ) : (
                "بدء الرفع"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
