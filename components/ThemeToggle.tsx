"use client";

import { useEffect, useState } from "react";
import {
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
  isThemePreference,
  resolveTheme,
  type ThemePreference,
} from "@/lib/theme";

const LABEL: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

const HINT: Record<ThemePreference, string> = {
  system: "Follows your phone, including when it switches at night.",
  light: "Always light, whatever your phone is set to.",
  dark: "Always dark, whatever your phone is set to.",
};

/**
 * Light, dark, or whatever the phone says.
 *
 * The choice is written to the document immediately and to localStorage for
 * next time — see themeBootScript(), which reads it back before the first
 * paint so nobody watches the app flash from dark to light on every load.
 *
 * "System" stamps NO attribute, deliberately. The stylesheet's
 * prefers-color-scheme block handles it, and writing an attribute would pin the
 * athlete to whichever mode their phone happened to be in at that second.
 */
export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [systemLight, setSystemLight] = useState(false);

  // After mount: localStorage and matchMedia do not exist during the export.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (isThemePreference(stored)) setPreference(stored);
    } catch { /* private mode — system is a fine default */ }

    const query = window.matchMedia("(prefers-color-scheme: light)");
    setSystemLight(query.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemLight(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  function choose(next: ThemePreference) {
    setPreference(next);
    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch { /* the page still changes, it just won't be remembered */ }

    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);
  }

  const resolved = resolveTheme(preference, systemLight);

  return (
    <div>
      <span className="field-label">Appearance</span>
      <div
        role="radiogroup"
        aria-label="Appearance"
        className="mt-1.5 flex gap-1 rounded-full bg-white/[0.04] p-0.5"
      >
        {THEME_PREFERENCES.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={preference === option}
            onClick={() => choose(option)}
            className={`min-h-[44px] flex-1 rounded-full px-3 text-xs font-semibold transition ${
              preference === option ? "bg-pitch-400 text-on-accent" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {LABEL[option]}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        {HINT[preference]}
        {preference === "system" && ` Right now that is ${resolved}.`}
      </p>
    </div>
  );
}
