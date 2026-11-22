/**
 * Browser polyfill for `@solana/web3.js` Buffer usage.
 * Import once from the client Providers tree before wallet-adapter.
 */
import { Buffer } from 'buffer'

const g = globalThis as typeof globalThis & { Buffer?: typeof Buffer }
if (!g.Buffer) g.Buffer = Buffer
