import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
      },
      colors: {
        // Brand accent — metallic gold. (Token still named `pitch` since it's
        // referenced app-wide; the palette is gold.)
        pitch: {
          DEFAULT: "#e3b53f",
          50: "#fbf3d9",
          300: "#f0d68a",
          400: "#e3b53f",
          500: "#c99a2e",
          600: "#a67c1f",
        },
        gold: {
          DEFAULT: "#e3b53f",
          300: "#f0d68a",
          400: "#e3b53f",
          500: "#c99a2e",
          600: "#a67c1f",
        },
        ink: {
          900: "#0a0a0b",
          800: "#101011",
          700: "#18181b",
          600: "#26262a",
        },
        readiness: {
          green: "#34d399",
          yellow: "#fbbf24",
          red: "#fb5d6b",
        },
        // Tailwind's own slate-500 and slate-600 do not pass WCAG AA on this
        // background — measured 4.18:1 and 2.63:1 against #09090a, where normal
        // text needs 4.5:1. They were used for helper text and small print in
        // ~160 places, which is exactly the copy that most needs to be legible
        // in daylight on a phone at the side of a pitch.
        //
        // Overridden here rather than find-and-replaced across every file: one
        // definition, no chance of missing a site, and `text-slate-500` keeps
        // meaning "muted" wherever it already appears. The three muted tiers
        // stay visually distinct — 4.9, 6.2 and 7.8 against the page.
        //
        // Re-measured 2026-08-02 against BOTH the page (#09090a) and the .card
        // surface (ink-800 at 70% over it, the worse of the two). Every text
        // token in use passes AA for normal text:
        //
        //   slate-100 17.6  slate-200 15.7  slate-300 13.0  slate-400 7.5
        //   slate-500  6.0  slate-600  4.8  pitch-400 10.1  sky-300  11.6
        //   readiness red 6.3 / green 10.0 / yellow 11.6
        //
        // slate-700 (#334155) is 1.86:1 and is NOT overridden — it is below AA
        // even for large text. Do not use it for text on these surfaces; the
        // three uses it had (struck-through shopping items) are now slate-600.
        slate: {
          600: "#717f96", // was #475569 (2.63:1) → 4.76:1 on card
          500: "#8391a6", // was #64748b (4.18:1) → 6.03:1 on card
        },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(227,181,63,0.30), 0 8px 40px -8px rgba(227,181,63,0.35)",
        card: "0 1px 0 0 rgba(255,255,255,0.06) inset, 0 20px 40px -24px rgba(0,0,0,0.85)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both",
        "scale-in": "scale-in 0.4s cubic-bezier(0.22,1,0.36,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
