/** @type {import('tailwindcss').Config} */
export default {
  content: ["./entrypoints/**/*.{html,tsx,ts}", "./components/**/*.{tsx,ts}"],
  theme: {
    extend: {
      colors: {
        "frozen-water": "var(--frozen-water)",
        "pacific-blue": "var(--pacific-blue)",
        "yale-blue": "var(--yale-blue)",
        "pale-sky": "var(--pale-sky)",
        "fresh-sky": "var(--fresh-sky)",
      },
      fontFamily: {
        castoro: ["Castoro", "serif"],
      },
    },
  },
  plugins: [],
};
