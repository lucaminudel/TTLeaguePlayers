import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react({
    babel: {
      plugins: [["babel-plugin-react-compiler", { target: "18" }]],
    },
  })],
  define: {
    // Expose ENVIRONMENT to the browser
    'import.meta.env.ENVIRONMENT': JSON.stringify(process.env.ENVIRONMENT ?? 'dev'),
    // Fix for amazon-cognito-identity-js global object requirement
    global: 'globalThis'
  },
})
