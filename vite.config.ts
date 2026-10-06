import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // Pré-bundleiza dependências pesadas para evitar transformação on-demand
    // (cada arquivo .tsx era compilado em ~2s na primeira requisição).
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'lucide-react',
        'motion',
        'papaparse',
        'jspdf',
        'jspdf-autotable',
        '@google/genai',
        'firebase/app',
        'firebase/auth',
        'firebase/firestore'
      ]
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      warmup: {
        clientFiles: ['./src/main.tsx', './src/App.tsx', './src/views/ReconciliationView.tsx']
      },
      // Proxy all /api requests to the Express backend server
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
