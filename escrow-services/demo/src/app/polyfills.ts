// Polyfills for browser compatibility
import { Buffer } from 'buffer';

// Make Buffer available globally
(window as any).Buffer = Buffer;
(window as any).global = window;

// Process polyfill - BLOCKFROST_KEY must be set as environment variable
if (!process.env.BLOCKFROST_KEY) {
  throw new Error('BLOCKFROST_KEY environment variable is required for real blockchain interactions');
}

(window as any).process = {
  env: {
    NODE_ENV: 'development',
    BLOCKFROST_KEY: process.env.BLOCKFROST_KEY,
    BLOCKFROST_URL: process.env.BLOCKFROST_URL || 'https://cardano-preview.blockfrost.io/api/v0',
    CARDANO_NETWORK: process.env.CARDANO_NETWORK || 'Preview'
  }
};
