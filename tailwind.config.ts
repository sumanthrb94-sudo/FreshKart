import type { Config } from "tailwindcss";

/**
 * Green Basket design tokens.
 * Royal/emerald green primary, lime-green accent, Tailwind grays.
 * Semantic colors use CSS variables for light/dark mode support.
 */
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#ecfdf5",
          100: "#d1fae5",
          200: "#a7f3d0",
          300: "#6ee7b7",
          400: "#34d399",
          500: "#059669", // PRIMARY — royal emerald green
          600: "#047857",
          700: "#065f46",
          800: "#064e3b",
          900: "#022c22",
        },
        accent: {
          50: "#f7fee7",
          100: "#ecfccb",
          200: "#d9f99d",
          300: "#bef264",
          400: "#a3e635",
          500: "#84cc16", // secondary buttons, revenue stat
          600: "#65a30d",
          700: "#4d7c0f",
          800: "#3f6212",
          900: "#365314",
        },
        // Zomato-style near-black "ink" surfaces (dark splash / loaders).
        ink: {
          950: "#0d0d0f",
          900: "#161618",
          800: "#1f2024",
          700: "#2b2c31",
        },
        // Semantic tokens — CSS variables enable light/dark mode switching
        canvas: "var(--color-canvas)",
        surface: "var(--color-surface)",
        raised: "var(--color-raised)",
        line: "var(--color-line)",
        fg: {
          DEFAULT: "var(--color-fg)",
          muted: "var(--color-fg-muted)",
          subtle: "var(--color-fg-subtle)",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "14px" }],
      },
      borderRadius: {
        card: "12px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,.06), 0 1px 2px -1px rgba(0,0,0,.04)",
        "card-hover": "0 8px 24px -6px rgba(0,0,0,.12)",
        "cart-bar": "0 10px 30px -10px rgba(0,0,0,.25)",
        phone: "0 50px 90px -28px rgba(60,12,18,.45), 0 0 0 1px rgba(0,0,0,.04)",
      },
      maxWidth: {
        // The app shell is mobile-first but no longer constrained to phone-width
        // on desktop. This token controls the centered max-width on larger screens.
        app: "1280px",
      },
      keyframes: {
        rise: {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        fade: { from: { opacity: "0" }, to: { opacity: "1" } },
        pop: {
          "0%": { transform: "scale(.5)", opacity: "0" },
          "60%": { transform: "scale(1.08)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        floatSlow: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-16px)" },
        },
      },
      animation: {
        rise: "rise .28s cubic-bezier(.22,1,.36,1)",
        fade: "fade .2s ease-out",
        pop: "pop .4s cubic-bezier(.22,1,.36,1)",
        float: "float 3s ease-in-out infinite",
        "float-slow": "floatSlow 5.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
