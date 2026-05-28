import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4444,
    strictPort: true,  // error instead of auto-incrementing to 4445 (backend port)
  },
})
