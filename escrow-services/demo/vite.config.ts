import { defineConfig, loadEnv } from 'vite'
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig(({ mode }) => {
  // Load environment variables
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    root: './src',
    build: {
      outDir: '../dist',
      emptyOutDir: true,
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
    server: {
      port: 3002,
      open: true,
    },
    plugins: [
      wasm(),
      topLevelAwait()
    ],
    resolve: {
      alias: {
        '@': new URL('./src', import.meta.url).pathname,
        buffer: 'buffer',
        process: 'process/browser',
        util: 'util',
        stream: 'stream-browserify',
        crypto: 'crypto-browserify',
        os: 'os-browserify/browser',
        path: 'path-browserify',
      },
    },
    define: {
      global: 'globalThis',
      'process.env.BLOCKFROST_KEY': JSON.stringify(env.BLOCKFROST_KEY),
    },
    optimizeDeps: {
      include: [
        'buffer',
        'process',
        'events',
        'util',
        'stream-browserify',
        'crypto-browserify',
        'os-browserify/browser',
        'path-browserify',
        'lodash',
        'lodash/isEqual'
      ]
    }
  };
}) 