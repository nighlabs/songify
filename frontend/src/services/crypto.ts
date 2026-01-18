import { scrypt } from 'scrypt-js'

// Scrypt-based password hash
// N=16384, r=8, p=1 are recommended parameters for interactive logins
// More GPU/ASIC resistant than PBKDF2
export async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder()
  const passwordData = encoder.encode(password)
  const saltData = encoder.encode(salt.toLowerCase())

  // N=16384 (2^14), r=8, p=1, dkLen=32
  const derivedKey = await scrypt(passwordData, saltData, 16384, 8, 1, 32)

  const hashArray = Array.from(derivedKey)
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Hash friend access key for transmission
// Uses UTC day as salt (same as admin portal password)
export async function hashFriendKey(friendKey: string): Promise<string> {
  const utcDay = new Date().getUTCDate().toString()
  return hashPassword(friendKey.toLowerCase().trim(), utcDay)
}
