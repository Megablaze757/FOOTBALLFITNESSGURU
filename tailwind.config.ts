import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
      },
      /* ═══════════════════════════════════════════════════════════════════
         EVERY COLOUR IS A CSS VARIABLE, SO TWO THEMES COST ZERO CALL SITES.

         The values live in lib/theme.ts and are written into app/globals.css
         under :root and [data-theme]. About 2,900 colour utilities across 160
         files change meaning with the theme and not one of them was edited —
         which is the same argument the slate override below was already
         written on: one definition, no chance of missing a site.

         `rgb(var(--x) / <alpha-value>)` is what makes `bg-white/[0.04]` and
         `text-slate-400/60` keep working. A plain `var(--x)` breaks every
         opacity modifier in the app.
         ═══════════════════════════════════════════════════════════════════ */
      colors: {
        pitch: {
          DEFAULT: "rgb(var(--pitch-400) / <alpha-value>)",
          50: "#fbf3d9",
          300: "rgb(var(--pitch-300) / <alpha-value>)",
          400: "rgb(var(--pitch-400) / <alpha-value>)",
          500: "rgb(var(--pitch-500) / <alpha-value>)",
          600: "rgb(var(--pitch-600) / <alpha-value>)",
        },
        /* Gold as TEXT. Separate from `pitch` because no single value is both a
           readable label on a white page and a recognisable gold button — the
           first attempt darkened the one token and turned every button brown. */
        accent: {
          DEFAULT: "rgb(var(--accent-400) / <alpha-value>)",
          300: "rgb(var(--accent-300) / <alpha-value>)",
          400: "rgb(var(--accent-400) / <alpha-value>)",
          500: "rgb(var(--accent-500) / <alpha-value>)",
          600: "rgb(var(--accent-600) / <alpha-value>)",
        },
        gold: {
          DEFAULT: "rgb(var(--pitch-400) / <alpha-value>)",
          300: "rgb(var(--pitch-300) / <alpha-value>)",
          400: "rgb(var(--pitch-400) / <alpha-value>)",
          500: "rgb(var(--pitch-500) / <alpha-value>)",
          600: "rgb(var(--pitch-600) / <alpha-value>)",
        },

        /* DOES NOT FLIP, deliberately. `text-ink-900` is not "dark text", it
           is "the label on a gold button" — it has to stay dark in both
           themes or that button becomes unreadable in one of them. Surfaces
           that used to be ink are `surface-*` below, and those do flip. */
        ink: {
          900: "#0a0a0b",
          800: "#101011",
          700: "#18181b",
          600: "#26262a",
        },

        /* The page and the things stacked on it. */
        surface: {
          DEFAULT: "rgb(var(--surface-base) / <alpha-value>)",
          base: "rgb(var(--surface-base) / <alpha-value>)",
          raised: "rgb(var(--surface-raised) / <alpha-value>)",
          high: "rgb(var(--surface-high) / <alpha-value>)",
        },

        /* WHITE IS A TOKEN. 582 utilities are `bg-white/[0.04]` or
           `border-white/10` — a light wash over a dark page. On a light page a
           white wash is invisible and every card border in the app vanishes,
           so this resolves to a near-black tint there instead. The two places
           that genuinely need a fixed white say so with an arbitrary value. */
        white: "rgb(var(--tint) / <alpha-value>)",

        /* The label on a bright accent — a gold button, a coloured pill.
           Near-black in dark, white in light, because light mode needs a DARK
           gold to be readable as text and dark-on-dark is not a button. */
        "on-accent": "rgb(var(--on-accent) / <alpha-value>)",

        readiness: {
          green: "rgb(var(--readiness-green) / <alpha-value>)",
          yellow: "rgb(var(--readiness-yellow) / <alpha-value>)",
          red: "rgb(var(--readiness-red) / <alpha-value>)",
        },

        sky: {
          300: "rgb(var(--sky-300) / <alpha-value>)",
          400: "rgb(var(--sky-400) / <alpha-value>)",
        },

        /* A HIGHER NUMBER IS MORE MUTED here, which is the reverse of
           Tailwind's own scale and is relied on by ~1,570 utilities. The
           ordering is enforced by lib/theme.test.ts in both themes, along with
           AA for every one of them on every surface it can sit on. */
        slate: {
          100: "rgb(var(--slate-100) / <alpha-value>)",
          200: "rgb(var(--slate-200) / <alpha-value>)",
          300: "rgb(var(--slate-300) / <alpha-value>)",
          400: "rgb(var(--slate-400) / <alpha-value>)",
          500: "rgb(var(--slate-500) / <alpha-value>)",
          600: "rgb(var(--slate-600) / <alpha-value>)",
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
        /* The three dots while the coach is composing an answer. Staggered by
           delay at the call site so they ripple rather than blink together. */
        "typing-dot": {
          "0%, 60%, 100%": { opacity: "0.25", transform: "translateY(0)" },
          "30%": { opacity: "1", transform: "translateY(-3px)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both",
        "scale-in": "scale-in 0.4s cubic-bezier(0.22,1,0.36,1) both",
        "typing-dot": "typing-dot 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
