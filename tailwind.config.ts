import type { Config } from "tailwindcss";

/**
 * FreshKart design tokens — mirrors Section 3 of the Figma design brief.
 * Brand red (#e23744, Zomato-style) primary, orange accent, Tailwind grays.
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
          50: "#fff1f2",
          100: "#ffe1e3",
          200: "#ffc8cd",
          300: "#fba1a9",
          400: "#f56b78",
          500: "#e23744", // PRIMARY — Zomato red
          600: "#c81e2c",
          700: "#a81824",
          800: "#8a1620",
          900: "#73171f",
        },
        accent: {
          50: "#fff8ed",
          100: "#ffefd4",
          200: "#ffdca8",
          300: "#ffc170",
          400: "#ff9d37",
          500: "#ff8014", // secondary buttons, revenue stat
          600: "#f0640a",
          700: "#c74c0b",
          800: "#9e3d10",
          900: "#7f3411",
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
