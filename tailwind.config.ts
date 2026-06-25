import type { Config } from "tailwindcss";

/**
 * FreshKart design tokens — mirrors Section 3 of the Figma design brief.
 * Brand green (#16bd5f) primary, orange accent, Tailwind grays, status colors.
 */
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#effdf4",
          100: "#d8fbe5",
          200: "#b3f5cd",
          300: "#79eaa8",
          400: "#3dd67d",
          500: "#16bd5f", // PRIMARY
          600: "#0a9a4b",
          700: "#0a793e",
          800: "#0d5f34",
          900: "#0c4e2d",
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
        phone: "0 50px 90px -28px rgba(20,40,28,.45), 0 0 0 1px rgba(0,0,0,.04)",
      },
      maxWidth: {
        app: "480px",
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
        // Produce falls from above, converging toward the cart (--dx → 0) and
        // shrinking as it drops "into" the basket, then loops.
        drop: {
          "0%": { transform: "translate(var(--dx, 0px), -10px) rotate(-12deg) scale(.85)", opacity: "0" },
          "12%": { opacity: "1" },
          "65%": { transform: "translate(calc(var(--dx, 0px) * .25), 70px) rotate(6deg) scale(1)", opacity: "1" },
          "88%": { transform: "translate(0px, 96px) scale(.5)", opacity: ".3" },
          "100%": { transform: "translate(0px, 104px) scale(.3)", opacity: "0" },
        },
      },
      animation: {
        rise: "rise .28s cubic-bezier(.22,1,.36,1)",
        fade: "fade .2s ease-out",
        pop: "pop .4s cubic-bezier(.22,1,.36,1)",
        float: "float 3s ease-in-out infinite",
        "float-slow": "floatSlow 5.5s ease-in-out infinite",
        drop: "drop 4s ease-in infinite",
      },
    },
  },
  plugins: [],
};

export default config;
