import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The backend (FastAPI, http://localhost:8000) allows this exact origin, so keep the port fixed.
export default defineConfig({
  plugins: [react()],
  server: { host: 'localhost', port: 5173, strictPort: true, open: true },
})
