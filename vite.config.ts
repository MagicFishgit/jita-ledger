import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * This build's identity: the commit in CI (GitHub sets GITHUB_SHA), the time otherwise. The app carries it
 * (`__BUILD__`) and the site serves it as version.json, so an app left open can tell a newer one is out (version.ts).
 */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const BUILD = env.GITHUB_SHA?.slice(0, 12) || `local-${Date.now()}`;
const versionFile: Plugin = {
  name: 'version-file',
  apply: 'build',
  generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) }); },
};

// GitHub Pages serves the site at https://<user>.github.io/<repo>/.
// If you name the repository something other than "jita-ledger", change this to match.
export default defineConfig({
  plugins: [react(), versionFile],
  base: '/jita-ledger/',
  define: { __BUILD__: JSON.stringify(BUILD) },
  build: {
    chunkSizeWarningLimit: 800,
    // Two pages: the app, and the light one a mail's item link opens (open.html, src/open.ts).
    rollupOptions: { input: { main: 'index.html', open: 'open.html' } },
  },
});
