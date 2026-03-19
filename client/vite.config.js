import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// server configuration functions
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});