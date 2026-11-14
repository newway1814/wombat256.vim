import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// /api requests are forwarded to the Flask backend during development.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
