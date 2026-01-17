import { describe, it, expect } from 'vitest'
import { hashPassword } from './crypto'

describe('hashPassword', () => {
  it('should return a hex string', async () => {
    const hash = await hashPassword('password', 'salt')
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should return consistent results for same input', async () => {
    const hash1 = await hashPassword('password', 'salt')
    const hash2 = await hashPassword('password', 'salt')
    expect(hash1).toBe(hash2)
  })

  it('should return different results for different passwords', async () => {
    const hash1 = await hashPassword('password1', 'salt')
    const hash2 = await hashPassword('password2', 'salt')
    expect(hash1).not.toBe(hash2)
  })

  it('should return different results for different salts', async () => {
    const hash1 = await hashPassword('password', 'salt1')
    const hash2 = await hashPassword('password', 'salt2')
    expect(hash1).not.toBe(hash2)
  })

  it('should be case-insensitive for salt (uses lowercase)', async () => {
    const hash1 = await hashPassword('password', 'Salt')
    const hash2 = await hashPassword('password', 'salt')
    expect(hash1).toBe(hash2)
  })
})
