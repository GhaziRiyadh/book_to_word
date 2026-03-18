import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import axios from "axios"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"

const API_URL = "http://localhost:8000/api/v1"

type Book = {
  id: string
  title: string
  status: string
  created_at: string
}

export function DashboardPage() {
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)
  const [processingBookId, setProcessingBookId] = useState<string | null>(null)

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

  const handleReprocess = async (bookId: string) => {
    try {
      setProcessingBookId(bookId)
      await axios.post(`${API_URL}/books/${bookId}/process`)
      await fetchBooks()
    } catch (error) {
      console.error("Failed to reprocess book", error)
    } finally {
      setProcessingBookId(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>الكتب والمستندات</CardTitle>
          <CardDescription>قائمة بالكتب المرفوعة وحالة معالجتها.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">جاري التحميل...</p>
          ) : books.length === 0 ? (
            <div className="flex flex-col items-center justify-center space-y-3 py-10">
              <p className="text-muted-foreground">لا توجد كتب مرفوعة بعد.</p>
              <Link to="/upload">
                <Button>رفع كتاب جديد</Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">العنوان</TableHead>
                  <TableHead className="text-right">تاريخ الرفع</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {books.map((book) => (
                  <TableRow key={book.id}>
                    <TableCell className="font-medium">{book.title}</TableCell>
                    <TableCell>{new Date(book.created_at).toLocaleString('ar-SA')}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        book.status === 'Completed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' :
                        book.status === 'Processing' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' :
                        book.status === 'Failed' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' :
                        'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                      }`}>
                        {book.status === 'Completed' ? 'مكتمل' :
                         book.status === 'Processing' ? 'جاري المعالجة' :
                         book.status === 'Failed' ? 'فشل' : 'في الانتظار'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Link to={`/books/${book.id}`}>
                          <Button variant="outline" size="sm">
                            {book.status === 'Completed' ? 'عرض النتائج' : 'التفاصيل'}
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          onClick={() => handleReprocess(book.id)}
                          disabled={book.status === 'Processing' || processingBookId === book.id}
                        >
                          {processingBookId === book.id ? 'جاري البدء...' : 'إعادة المعالجة'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
