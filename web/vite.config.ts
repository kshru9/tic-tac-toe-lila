import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  envDir: '../',
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/v2': {
        target: 'https://handsome-courage-production-d68e.up.railway.app',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path
      }
    }
  },
  base: mode === 'production' && process.env.VITE_BASE_PATH 
    ? `/${process.env.VITE_BASE_PATH}/`
    : '/'
}))
