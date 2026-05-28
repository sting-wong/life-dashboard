import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#E6F4ED",
          100: "#C0E4D1",
          200: "#96CEB0",
          300: "#6AB88E",
          400: "#3FA86C",
          500: "#28975C",
          600: "#1A7A4A",
          700: "#155E3A",
          800: "#0F4529",
          900: "#0A2E1C",
          950: "#061E12",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      gridTemplateColumns: {
        "15": "repeat(15, minmax(0, 1fr))",
      },
      boxShadow: {
        "card": "0 1px 3px rgba(15, 23, 42, 0.04), 0 1px 2px rgba(15, 23, 42, 0.03)",
        "card-hover": "0 4px 16px rgba(15, 23, 42, 0.06), 0 2px 4px rgba(15, 23, 42, 0.04)",
        "container": "0 0 0 1px rgba(15, 23, 42, 0.04), 0 16px 40px rgba(15, 23, 42, 0.06)",
        "sidebar": "1px 0 0 rgba(15, 23, 42, 0.04)",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
} satisfies Config;
