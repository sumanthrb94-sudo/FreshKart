"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/providers/AuthProvider";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggleTheme: () => {},
});

/** No client storage — before sign-in (or while the profile is still
 *  loading) the OS-level preference decides; the layout's inline script
 *  applies the same check before hydration to avoid a flash. */
function systemTheme(): Theme {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user, updateProfile } = useAuth();
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  // The signed-in account's saved preference wins once known; otherwise
  // follow the system setting. Re-runs whenever the profile (re)loads so
  // switching accounts on the same device picks up that account's theme.
  useEffect(() => {
    setMounted(true);
    setTheme(user?.theme ?? systemTheme());
  }, [user?.theme]);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light");
    } else {
      root.classList.remove("light");
    }
  }, [theme, mounted]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      if (user) updateProfile({ theme: next }).catch(() => {});
      return next;
    });
  }, [user, updateProfile]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
