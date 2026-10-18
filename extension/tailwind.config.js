/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./entrypoints/**/*.{html,tsx,ts}",
    "./components/**/*.{tsx,ts}",
    "./lib/**/*.{tsx,ts}",
  ],
  theme: {
    extend: {
      colors: {
        "frozen-water": "var(--frozen-water)",
        "pacific-blue": "var(--pacific-blue)",
        "yale-blue": "var(--yale-blue)",
        "pale-sky": "var(--pale-sky)",
        "fresh-sky": "var(--fresh-sky)",
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        geist: ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        brand: ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        castoro: ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
