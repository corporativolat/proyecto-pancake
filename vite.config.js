import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: [
      '.ngrok-free.dev',
      '.ngrok-free.app',
      '.ngrok.io',
      '.ngrok.app',
      '.trycloudflare.com',
      'localhost'
    ]
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'gsap-vendor': ['gsap', '@gsap/react'],
          'chart-vendor': ['chart.js', 'react-chartjs-2'],
          'supabase-vendor': ['@supabase/supabase-js']
        }
      }
    },
    chunkSizeWarningLimit: 600
  }
});
