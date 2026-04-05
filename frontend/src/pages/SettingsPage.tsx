import { useEffect, useState } from "react"
import axios from "axios"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const API_URL = "http://localhost:8000"

type SettingsPayload = {
  project_name: string
  api_prefix: string
  log_level: string
  ai: {
    provider: string
    openrouter_model: string
    openrouter_base_url: string
    openrouter_title: string
    openrouter_has_referer: boolean
    gemini_model: string
    ollama_model: string
    ollama_base_url: string
    hf_model_id: string
    hf_offline_mode: boolean
    hf_allow_cpu_fallback: boolean
  }
  adapter_health: {
    provider: string
    ready: boolean
    last_error: string | null
  }
}

export function SettingsPage() {
  const [data, setData] = useState<SettingsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadSettings = async (isRefresh: boolean = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      const res = await axios.get(`${API_URL}/api/v1/settings`)
      setData(res.data)
    } catch (error) {
      console.error("Failed to load settings", error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadSettings()
  }, [])

  if (loading) {
    return <p className="text-sm text-muted-foreground">جاري تحميل الإعدادات...</p>
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>الإعدادات</CardTitle>
          <CardDescription>تعذر تحميل الإعدادات الحالية.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => loadSettings(true)}>إعادة المحاولة</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">الإعدادات</h1>
          <p className="text-muted-foreground mt-1">عرض إعدادات التشغيل الحالية وحالة مزود الذكاء الاصطناعي.</p>
        </div>
        <Button variant="outline" onClick={() => loadSettings(true)} disabled={refreshing}>
          {refreshing ? "جاري التحديث..." : "تحديث"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>حالة الخدمة</CardTitle>
          <CardDescription>الحالة الفعلية للمحول النشط من الخادم.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">المزود:</span>
            <Badge variant="outline">{data.adapter_health.provider}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">الجاهزية:</span>
            <Badge variant={data.adapter_health.ready ? "secondary" : "destructive"}>
              {data.adapter_health.ready ? "جاهز" : "غير جاهز"}
            </Badge>
          </div>
          {data.adapter_health.last_error ? (
            <p className="text-xs text-red-600">آخر خطأ: {data.adapter_health.last_error}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>إعدادات عامة</CardTitle>
          <CardDescription>إعدادات أساسية مقروءة من بيئة التشغيل.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <p className="text-muted-foreground">اسم المشروع</p>
            <p className="font-medium">{data.project_name}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">مسار API</p>
            <p className="font-medium">{data.api_prefix}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">مستوى السجلات</p>
            <p className="font-medium">{data.log_level}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">المزود النشط</p>
            <p className="font-medium">{data.ai.provider}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>إعدادات مزودات الذكاء</CardTitle>
          <CardDescription>قيم التشغيل الحالية لكل مزود (بدون مفاتيح سرية).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 text-sm">
          <div className="rounded-md border p-4">
            <p className="font-semibold mb-2">OpenRouter</p>
            <p><span className="text-muted-foreground">Model:</span> {data.ai.openrouter_model}</p>
            <p><span className="text-muted-foreground">Base URL:</span> {data.ai.openrouter_base_url}</p>
            <p><span className="text-muted-foreground">Title:</span> {data.ai.openrouter_title || "-"}</p>
            <p><span className="text-muted-foreground">Has Referer:</span> {data.ai.openrouter_has_referer ? "Yes" : "No"}</p>
          </div>

          <div className="rounded-md border p-4">
            <p className="font-semibold mb-2">HuggingFace</p>
            <p><span className="text-muted-foreground">Model:</span> {data.ai.hf_model_id}</p>
            <p><span className="text-muted-foreground">Offline Mode:</span> {data.ai.hf_offline_mode ? "Enabled" : "Disabled"}</p>
            <p><span className="text-muted-foreground">CPU Fallback:</span> {data.ai.hf_allow_cpu_fallback ? "Enabled" : "Disabled"}</p>
          </div>

          <div className="rounded-md border p-4">
            <p className="font-semibold mb-2">Gemini / Ollama</p>
            <p><span className="text-muted-foreground">Gemini Model:</span> {data.ai.gemini_model}</p>
            <p><span className="text-muted-foreground">Ollama Model:</span> {data.ai.ollama_model}</p>
            <p><span className="text-muted-foreground">Ollama URL:</span> {data.ai.ollama_base_url}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
