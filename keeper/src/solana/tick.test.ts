import { Keypair } from '@solana/web3.js'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadKeypair, resolveKeypairEnv, runSolanaTick } from './tick'

describe('solana tick helpers', () => {
  it('loads keypair from JSON byte array and rejects non-array', () => {
    const kp = Keypair.generate()
    const raw = JSON.stringify(Array.from(kp.secretKey))
    const loaded = loadKeypair(raw)
    expect(loaded.publicKey.equals(kp.publicKey)).toBe(true)
    expect(() => loadKeypair('not-json-array')).toThrow(/JSON byte array/)
  })

  it('resolveKeypairEnv reads filesystem path', () => {
    const kp = Keypair.generate()
    const dir = mkdtempSync(join(tmpdir(), 'scoop-keeper-'))
    const path = join(dir, 'id.json')
    const raw = JSON.stringify(Array.from(kp.secretKey))
    writeFileSync(path, raw)
    expect(resolveKeypairEnv(raw)).toBe(raw)
    expect(resolveKeypairEnv(path)).toBe(raw)
  })

  it('runSolanaTick short-circuits without keypair / invalid key', async () => {
    const missing = await runSolanaTick({
      SOLANA_RPC_URL: 'http://127.0.0.1:8899',
      SOLANA_PROGRAM_ID: 'FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT',
      SOLANA_KEEPER_KEYPAIR: '',
    })
    expect(missing).toEqual({
      triggered: false,
      reason: 'keypair-missing',
      readyIds: [],
    })

    const bad = await runSolanaTick({
      SOLANA_RPC_URL: 'http://127.0.0.1:8899',
      SOLANA_PROGRAM_ID: 'FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT',
      SOLANA_KEEPER_KEYPAIR: 'nope',
    })
    expect(bad.reason).toBe('keypair-invalid')
    expect(bad.triggered).toBe(false)
  })
})
