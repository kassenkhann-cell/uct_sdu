/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: {
    relative: true,
    files: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  },
  theme: {
    extend: {
      colors: {
        radar: {
          green: "#22c55e",
          yellow: "#f59e0b",
          red: "#ef4444",
          blue: "#3b82f6"
        }
      },
      boxShadow: {
        panel: "0 18px 45px -24px rgba(0,0,0,.75)"
      }
    }
  },
  plugins: []
};
