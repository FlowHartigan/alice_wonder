import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    fs: { allow: [
      fileURLToPath(new URL('.', import.meta.url)),
      fileURLToPath(new URL('../../packages/shared', import.meta.url)),
      fileURLToPath(new URL('../../assets/official/plateau-principal-fr.webp', import.meta.url)),
    ] },
    proxy: { '/socket.io': { target: 'http://127.0.0.1:3000', ws: true } },
  },
});
