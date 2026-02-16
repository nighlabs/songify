// Package crypto provides cryptographic utilities for password and key hashing.
package crypto

import (
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/scrypt"
)

// friendKeyHashCache caches HashFriendKey results keyed by "friendKey:utcDay".
// Old entries for previous days stay in memory harmlessly (bounded by sessionCount * 31).
var friendKeyHashCache sync.Map

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
func HashWithScrypt(input, salt string) (string, error) {
	saltBytes := []byte(strings.ToLower(salt))
	dk, err := scrypt.Key([]byte(input), saltBytes, scryptN, scryptR, scryptP, scryptKeyLen)
	if err != nil {
		return "", fmt.Errorf("scrypt key derivation failed: %w", err)
	}
	return hex.EncodeToString(dk), nil
}

// HashFriendKey hashes a friend access key for comparison with client-provided hash.
// Normalizes the key (lowercase, trim) and uses UTC day as salt.
// Results are cached per key+day to avoid repeated scrypt computation.
func HashFriendKey(friendKey string) (string, error) {
	normalizedKey := strings.ToLower(strings.TrimSpace(friendKey))
	utcDay := strconv.Itoa(time.Now().UTC().Day())
	cacheKey := normalizedKey + ":" + utcDay

	if cached, ok := friendKeyHashCache.Load(cacheKey); ok {
		return cached.(string), nil
	}

	hash, err := HashWithScrypt(normalizedKey, utcDay)
	if err != nil {
		return "", err
	}

	friendKeyHashCache.Store(cacheKey, hash)
	return hash, nil
}
