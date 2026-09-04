import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT ?? '5173';
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? '/';
const isDevelopment = process.env.NODE_ENV !== 'production';

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    ...(isDevelopment ? [runtimeErrorOverlay()] : []),
    ...(isDevelopment && process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    // Reduce Vercel build work during the expensive chunk-rendering phase.
    reportCompressedSize: false,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // Keep large third-party dependency graphs out of the application chunk.
        // This makes Vite/Rollup's final rendering phase much less memory-intensive.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/')
          ) {
            return 'react-vendor';
          }

          if (id.includes('/@radix-ui/')) return 'radix-vendor';
          if (id.includes('/recharts/') || id.includes('/d3-')) return 'charts-vendor';
          if (id.includes('/framer-motion/')) return 'motion-vendor';
          if (id.includes('/lucide-react/')) return 'icons-vendor';
          if (id.includes('/@clerk/')) return 'clerk-vendor';

          return 'vendor';
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
