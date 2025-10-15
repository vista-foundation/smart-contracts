// Environment configuration

const BLOCKFROST_KEY = process.env.BLOCKFROST_KEY;

if (!BLOCKFROST_KEY) {
  throw new Error('BLOCKFROST_KEY env variable is not set');
}

export const ENV = {
  BLOCKFROST_KEY: BLOCKFROST_KEY!,
  BLOCKFROST_URL: process.env.BLOCKFROST_URL || 'https://cardano-preview.blockfrost.io/api/v0',
  CARDANO_NETWORK: process.env.CARDANO_NETWORK || 'Preview'
} as const;
