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
