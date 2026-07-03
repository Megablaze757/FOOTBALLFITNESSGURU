import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        // Electric "pitch" accent
        pitch: {
          DEFAULT: "#a3e635",
          50: "#f7fee7",
          400: "#a3e635",
          500: "#84cc16",
          600: "#65a30d",
        },
        ink: {
          900: "#080b12",
          800: "#0c111b",
          700: "#121826",
          600: "#1a2233",
        },
        readiness: {
          green: "#34d399",
          yellow: "#fbbf24",
          red: "#fb5d6b",
        },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(163,230,53,0.25), 0 8px 40px -8px rgba(163,230,53,0.35)",
        card: "0 1px 0 0 rgba(255,255,255,0.06) inset, 0 20px 40px -24px rgba(0,0,0,0.8)",
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
