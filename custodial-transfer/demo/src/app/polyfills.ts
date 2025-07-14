// Buffer and process polyfills for browser compatibility
import { Buffer } from 'buffer';
import process from 'process';

// Make them globally available
(globalThis as any).Buffer = Buffer;
(globalThis as any).process = process;

// Global polyfill for Node.js compatibility
(globalThis as any).global = globalThis;

// Polyfill for lodash isEqual if needed
if (!(window as any)._ && !(globalThis as any)._) {
    (globalThis as any)._ = {
        isEqual: (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b)
    };
}
