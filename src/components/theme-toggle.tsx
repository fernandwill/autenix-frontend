import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme-provider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="relative h-10 w-10 rounded-full"
      onClick={toggleTheme}
      aria-label="Toggle color theme"
    >
      <Sun
        className={`h-5 w-5 transition-transform duration-200 ${theme === "dark" ? "scale-0" : "scale-100"}`}
      />
      <Moon
        className={`absolute h-5 w-5 transition-transform duration-200 ${theme === "dark" ? "scale-100" : "scale-0"}`}
      />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
