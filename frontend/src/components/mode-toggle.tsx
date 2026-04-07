import { Moon, Sun, Monitor } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"

export function ModeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => {
        if (theme === "light") setTheme("dark")
        else if (theme === "dark") setTheme("system")
        else setTheme("light")
      }}
      title={
        theme === "light"
          ? "الوضع الداكن"
          : theme === "dark"
          ? "وضع النظام"
          : "الوضع الفاتح"
      }
    >
      {theme === "light" && <Sun className="h-[1.2rem] w-[1.2rem] transition-all" />}
      {theme === "dark" && <Moon className="h-[1.2rem] w-[1.2rem] transition-all" />}
      {theme === "system" && <Monitor className="h-[1.2rem] w-[1.2rem] transition-all" />}
      <span className="sr-only">تبديل السمة</span>
    </Button>
  )
}
