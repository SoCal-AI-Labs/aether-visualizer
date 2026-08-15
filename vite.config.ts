import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['electron-audio-loopback'],
            },
          },
        },
        async onstart({ startup }) {
          try {
            await startup()
          } catch {
            // Windows taskkill fails if the previous Electron PID is already gone.
            await startup().catch(() => undefined)
          }
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            rollupOptions: {
              output: {
                format: 'cjs',
                entryFileNames: 'preload.cjs',
                inlineDynamicImports: true,
              },
            },
          },
        },
      },
      renderer: {},
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
})
