import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [solidPlugin(), tailwindcss()],
  root: '.',
  server: {
    port: 5173,
    // Handle connection errors gracefully
    hmr: {
      overlay: true,
    },
    watch: {
      // Ignore watching node_modules and .git
      ignored: ['**/node_modules/**', '**/.git/**']
    }
  },
  // Suppress ECONNRESET errors
  clearScreen: false,
})
