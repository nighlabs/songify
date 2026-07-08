/**
 * Client-side cryptographic hashing utilities.
 *
 * Uses scrypt for password hashing - this is a memory-hard function that
 * provides better resistance to GPU/ASIC attacks than PBKDF2 or bcrypt.
 *
 * Security model:
 * - Passwords are hashed on the client before transmission
 * - The backend stores a hash of the client hash (double hashing)
 * - Time-based salting (UTC day) prevents replay attacks within reason
 * - This is NOT a substitute for HTTPS - just defense in depth
 */

import { scrypt } from 'scrypt-js'

/**
 * Hash a password using scrypt.
 *
 * Parameters: N=16384 (2^14), r=8, p=1, dkLen=32
 * These are recommended for interactive logins (~100ms on modern hardware).
 *
 * @param password - The plaintext password
 * @param salt - Salt value (e.g., admin name or UTC day)
 * @returns Hex-encoded 32-byte hash
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder()
  const passwordData = encoder.encode(password)
  const saltData = encoder.encode(salt.toLowerCase())

  const derivedKey = await scrypt(passwordData, saltData, 16384, 8, 1, 32)

  const hashArray = Array.from(derivedKey)
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Hash the BIP39-style friend access key for transmission.
 * Uses UTC day as salt to prevent simple replay attacks.
 *
 * Note: The backend uses the same UTC day salt, so this will fail
 * if the client/server are in different UTC days (edge case at midnight).
 *
 * @param friendKey - The BIP39 mnemonic (e.g., "happy tiger 42")
 * @returns Hex-encoded hash for API transmission
 */
export async function hashFriendKey(friendKey: string): Promise<string> {
  const utcDay = new Date().getUTCDate().toString()
  return hashPassword(friendKey.toLowerCase().trim(), utcDay)
}

/**
 * Client-side encryption of the admin's Spotify token blob.
 *
 * The admin can opt in to persisting their Spotify auth token to the backend so
 * it moves with them across devices. To keep the sensitive refresh token safe
 * even if the database is compromised, the blob is encrypted client-side with a
 * key derived from the session password (AES-GCM). The backend only ever stores
 * opaque ciphertext it cannot decrypt.
 *
 * The derived key bytes (not the password) are cached in localStorage so
 * encryption/decryption still works after a plain page refresh, when the
 * plaintext password is no longer available. Storing the key bytes locally is no
 * more sensitive than the raw Spotify token, which the SDK already keeps in
 * localStorage on the same device.
 */

/** localStorage key holding the base64-encoded AES key bytes. */
const TOKEN_ENC_KEY_STORAGE = 'songify-spotify-enc-key'

/** Distinct salt suffix so this key differs from the password hash sent to the server. */
const TOKEN_ENC_SALT_SUFFIX = ':spotify-token-enc'

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Derive an AES-256 key from the session password and cache it in localStorage.
 * Call this at the two moments the plaintext password is available: session
 * creation and admin rejoin.
 */
export async function deriveAndStoreTokenKey(password: string, adminName: string): Promise<void> {
  const encoder = new TextEncoder()
  const passwordData = encoder.encode(password)
  const saltData = encoder.encode(adminName.toLowerCase() + TOKEN_ENC_SALT_SUFFIX)
  const keyBytes = await scrypt(passwordData, saltData, 16384, 8, 1, 32)
  localStorage.setItem(TOKEN_ENC_KEY_STORAGE, bytesToBase64(new Uint8Array(keyBytes)))
}

/** Whether a derived encryption key is available on this device. */
export function hasTokenKey(): boolean {
  return localStorage.getItem(TOKEN_ENC_KEY_STORAGE) !== null
}

/** Remove the cached encryption key (called on logout). */
export function clearTokenKey(): void {
  localStorage.removeItem(TOKEN_ENC_KEY_STORAGE)
}

async function importKey(): Promise<CryptoKey | null> {
  const b64 = localStorage.getItem(TOKEN_ENC_KEY_STORAGE)
  if (!b64) return null
  const bytes = base64ToBytes(b64)
  return crypto.subtle.importKey('raw', bytes as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

/**
 * Encrypt a plaintext string with the cached key.
 * @returns base64(iv || ciphertext), or null if no key is available.
 */
export async function encryptToken(plaintext: string): Promise<string | null> {
  const key = await importKey()
  if (!key) return null
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, encoded as BufferSource)
  )
  const combined = new Uint8Array(iv.length + ct.length)
  combined.set(iv, 0)
  combined.set(ct, iv.length)
  return bytesToBase64(combined)
}

/**
 * Decrypt a base64(iv || ciphertext) string produced by encryptToken().
 * @returns the plaintext, or null if no key is available or decryption fails.
 */
export async function decryptToken(payload: string): Promise<string | null> {
  const key = await importKey()
  if (!key) return null
  try {
    const combined = base64ToBytes(payload)
    const iv = combined.slice(0, 12)
    const ct = combined.slice(12)
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ct as BufferSource)
    return new TextDecoder().decode(plain)
  } catch {
    return null
  }
}
