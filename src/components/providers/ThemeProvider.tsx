"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/providers/AuthProvider";

type Theme = "dark" | "light";

/** Must match --theme-duration in globals.css. */
const THEME_FADE_MS = 250;

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
    // Arm the cross-fade for the length of the swap, then disarm it.
    //
    // The colour transition used to live on `*` permanently, which meant every
    // element in the document carried a six-property 250 ms transition for the
    // entire session — paid on every hover, every focus ring, every price
    // update, to serve one button nobody presses twice a day. It is now opt-in
    // for exactly as long as the theme is changing.
    const root = document.documentElement;
    root.classList.add("theme-anim");
    window.setTimeout(() => root.classList.remove("theme-anim"), THEME_FADE_MS + 60);

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
