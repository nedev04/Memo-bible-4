import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "dark" | "light" | "system";
export type FontSize = "normal" | "large" | "xlarge";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  isDark: boolean;
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
  isDark: true,
  fontSize: "large",
  setFontSize: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem("memo_theme") as Theme) || "dark";
  });

  const [fontSize, setFontSizeState] = useState<FontSize>(() => {
    return (localStorage.getItem("memo_fontsize") as FontSize) || "large";
  });

  const [systemIsDark, setSystemIsDark] = useState(() => {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
  });

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const listener = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
    media.addEventListener?.("change", listener);
    return () => media.removeEventListener?.("change", listener);
  }, []);

  const isDark = theme === "system" ? systemIsDark : theme === "dark";

  useEffect(() => {
    const root = document.documentElement;
    const color = isDark ? "#0b111e" : "#f1f5f9";
    if (isDark) {
      root.classList.add("dark");
      root.classList.remove("light");
      root.setAttribute("data-theme", "dark");
      root.style.colorScheme = "dark";
    } else {
      root.classList.remove("dark");
      root.classList.add("light");
      root.setAttribute("data-theme", "light");
      root.style.colorScheme = "light";
    }
    root.style.backgroundColor = color;
    if (document.body) {
      document.body.style.backgroundColor = color;
    }
    // Синхронизируем meta theme-color для строки состояния и системной панели навигации телефона
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    metas.forEach((meta) => {
      meta.setAttribute("content", color);
    });
  }, [isDark]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("font-normal", "font-large", "font-xlarge");
    root.classList.add(`font-${fontSize}`);
    if (fontSize === "normal") {
      root.style.setProperty("--font-scale", "1");
    } else if (fontSize === "large") {
      root.style.setProperty("--font-scale", "1.1");
    } else {
      root.style.setProperty("--font-scale", "1.22");
    }
  }, [fontSize]);

  function setTheme(newTheme: Theme) {
    setThemeState(newTheme);
    localStorage.setItem("memo_theme", newTheme);
  }

  function setFontSize(newSize: FontSize) {
    setFontSizeState(newSize);
    localStorage.setItem("memo_fontsize", newSize);
  }

  return (
    <ThemeContext.Provider
      value={{ theme, setTheme, isDark, fontSize, setFontSize }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
