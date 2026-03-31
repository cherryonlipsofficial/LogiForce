import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Chunk splitting for better caching
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-router-dom')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@tanstack/react-query')) {
            return 'vendor-query';
          }
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) {
            return 'vendor-charts';
          }
          if (id.includes('node_modules/axios') || id.includes('node_modules/react-hot-toast') || id.includes('node_modules/react-hook-form')) {
            return 'vendor-utils';
          }
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
