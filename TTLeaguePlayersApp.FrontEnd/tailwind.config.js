/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary-base': '#012169',   // Pantone 280 C
        'main-text': '#FFFFFF',      // Readability White
        'secondary-text': '#C8C9C7', // Pantone Cool Gray 3 C
        'action-accent': '#E4002B',  // Pantone 185 C
      },
      fontFamily: {
        // Using system sans-serif stack as default for now, can be updated if fonts are specified later
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
