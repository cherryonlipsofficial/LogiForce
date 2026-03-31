import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Chunk splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-charts': ['recharts'],
          'vendor-utils': ['axios', 'react-hot-toast', 'react-hook-form'],
        },
      },
    },
    // Generate source maps for error tracking (but not inline)
    sourcemap: 'hidden',
    // Warn on large chunks
    chunkSizeWarningLimit: 500,
  },
  // Ensure env vars are available
  envPrefix: 'VITE_',
});
