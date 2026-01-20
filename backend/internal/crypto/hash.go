// Package crypto provides cryptographic utilities for password and key hashing.
package crypto

import (
	"encoding/hex"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/scrypt"
)

// Scrypt parameters matching the frontend implementation.
// N=16384 (2^14), r=8, p=1 are recommended for interactive logins.
const (
	scryptN      = 16384
	scryptR      = 8
	scryptP      = 1
	scryptKeyLen = 32
)

// HashWithScrypt hashes an input string using scrypt with the given salt.
// The salt is lowercased before use. Returns hex-encoded hash.
// Parameters match the frontend: N=16384, r=8, p=1, keyLen=32.
func HashWithScrypt(input, salt string) string {
	saltBytes := []byte(strings.ToLower(salt))
	dk, err := scrypt.Key([]byte(input), saltBytes, scryptN, scryptR, scryptP, scryptKeyLen)
	if err != nil {
		return ""
	}
	return hex.EncodeToString(dk)
}

// HashFriendKey hashes a friend access key for comparison with client-provided hash.
// Normalizes the key (lowercase, trim) and uses UTC day as salt.
func HashFriendKey(friendKey string) string {
	normalizedKey := strings.ToLower(strings.TrimSpace(friendKey))
	utcDay := strconv.Itoa(time.Now().UTC().Day())
	return HashWithScrypt(normalizedKey, utcDay)
}
