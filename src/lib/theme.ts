import type { AppPreferences } from "../types";

let systemThemeListener: ((e: MediaQueryListEvent) => void) | null = null;
let currentMql: MediaQueryList | null = null;

/**
 * Resolves the effective visual theme ("dark" or "light") given a setting ("dark" | "light" | "system").
 */
export function resolveEffectiveTheme(themeSetting: "dark" | "light" | "system" | string): "dark" | "light" {
  if (themeSetting === "light") return "light";
  if (themeSetting === "dark") return "dark";
  // System theme: query matchMedia
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "dark";
}

/**
 * Applies visual theme, accent color, and animation intensity to document.documentElement
 * and coordinates system appearance media query changes.
 */
export function applyThemePreferences(preferences: Partial<AppPreferences>) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const root = document.documentElement;
  const theme = preferences.theme || "dark";
  const accent = preferences.accent_color || "violet";
  const animations = preferences.animation_intensity || "full";

  // Clean up any previous matchMedia listener
  if (currentMql && systemThemeListener) {
    currentMql.removeEventListener("change", systemThemeListener);
    systemThemeListener = null;
    currentMql = null;
  }

  const effectiveTheme = resolveEffectiveTheme(theme);

  // 1. Theme (data-theme & dark/light classes)
  root.setAttribute("data-theme", effectiveTheme);
  root.classList.remove("dark", "light");
  root.classList.add(effectiveTheme);

  // 2. Accent color
  root.setAttribute("data-accent", accent);

  // 3. Animation intensity
  root.setAttribute("data-animations", animations);

  // Cache in localStorage to eliminate theme flicker on cold restart
  try {
    localStorage.setItem("myclean_pref_theme", theme);
    localStorage.setItem("myclean_effective_theme", effectiveTheme);
    localStorage.setItem("myclean_accent", accent);
    localStorage.setItem("myclean_animations", animations);
  } catch {
    // Ignore storage quota or disabled storage errors
  }

  // If set to "system", listen to dynamic macOS dark/light mode switching
  if (theme === "system" && window.matchMedia) {
    currentMql = window.matchMedia("(prefers-color-scheme: dark)");
    systemThemeListener = (e: MediaQueryListEvent) => {
      const nextTheme = e.matches ? "dark" : "light";
      root.setAttribute("data-theme", nextTheme);
      root.classList.remove("dark", "light");
      root.classList.add(nextTheme);
      try {
        localStorage.setItem("myclean_effective_theme", nextTheme);
      } catch {}
    };
    currentMql.addEventListener("change", systemThemeListener);
  }
}

/**
 * Hydrates theme state from localStorage synchronously before React renders.
 */
export function initializeThemeFromCache() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  try {
    const cachedTheme = localStorage.getItem("myclean_pref_theme") || "dark";
    const cachedAccent = (localStorage.getItem("myclean_accent") || "violet") as any;
    const cachedAnimations = (localStorage.getItem("myclean_animations") || "full") as any;

    applyThemePreferences({
      theme: cachedTheme as any,
      accent_color: cachedAccent,
      animation_intensity: cachedAnimations,
    });
  } catch {
    // Fallback to dark
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.classList.add("dark");
  }
}
