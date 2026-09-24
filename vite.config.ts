import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site at https://<user>.github.io/<repo>/.
// If you name the repository something other than "jita-ledger", change this to match.
export default defineConfig({
  plugins: [react()],
  base: '/jita-ledger/',
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: { output: { manualChunks: { charts: ['recharts'] } } },
  },
});
