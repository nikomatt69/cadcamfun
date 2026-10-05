/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  presets: [require("./tailwind-preset.cjs")],
  theme: {
    extend: {
      animation: {
        fadeIn: "fadeIn 0.3s ease-in-out",
        slideInDown: "slideInDown 0.3s ease-in-out",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        spin: "spin 1s linear infinite"
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideInDown: { "0%": { transform: "translateY(-1rem)", opacity: "0" }, "100%": { transform: "translateY(0)", opacity: "1" } },
        pulse: { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.7" } }
      }
    }
  },
  plugins: [require("tailwind-scrollbar")({ nocompatible: true })]
}
