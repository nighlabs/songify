package services

import (
	"context"
	"crypto/rand"
	"fmt"
	"math/big"
	"strings"

	"github.com/songify/backend/internal/db"
	"github.com/tyler-smith/go-bip39/wordlists"
)

// wordlist is the BIP39 English wordlist (2048 words).
// Using two words plus a number gives 2048 × 2048 × 100 = 419 million combinations.
var wordlist = wordlists.English

// FriendKeyService generates unique, human-readable keys for session sharing.
// Keys follow the pattern "word-word-number" (e.g., "apple-river-42").
type FriendKeyService struct {
	queries *db.Queries
}

// NewFriendKeyService creates a FriendKeyService with its own random source.
func NewFriendKeyService(queries *db.Queries) *FriendKeyService {
	return &FriendKeyService{
		queries: queries,
	}
}

// cryptoRandIntn returns a cryptographically secure random int in [0, n).
// Panics on failure — OS entropy exhaustion is catastrophic.
func cryptoRandIntn(n int) int {
	v, err := rand.Int(rand.Reader, big.NewInt(int64(n)))
	if err != nil {
		panic(fmt.Sprintf("crypto/rand failed: %v", err))
	}
	return int(v.Int64())
}

// Generate creates a unique friend key, retrying if collisions occur.
// Returns an error if no unique key can be found after 100 attempts.
func (s *FriendKeyService) Generate(ctx context.Context) (string, error) {
	maxAttempts := 100
	for i := 0; i < maxAttempts; i++ {
		word1 := wordlist[cryptoRandIntn(len(wordlist))]
		word2 := wordlist[cryptoRandIntn(len(wordlist))]
		num := cryptoRandIntn(100)
		key := fmt.Sprintf("%s-%s-%d", word1, word2, num)

		exists, err := s.queries.FriendKeyExists(ctx, key)
		if err != nil {
			return "", fmt.Errorf("failed to check key existence: %w", err)
		}

		if exists == 0 {
			return key, nil
		}
	}
	return "", fmt.Errorf("failed to generate unique key after %d attempts", maxAttempts)
}

// GenerateName creates a random identity name without uniqueness checking.
// Returns a PascalCase name like "HappyTiger42".
func (s *FriendKeyService) GenerateName() string {
	word1 := wordlist[cryptoRandIntn(len(wordlist))]
	word2 := wordlist[cryptoRandIntn(len(wordlist))]
	num := cryptoRandIntn(100)
	return fmt.Sprintf("%s%s%d", capitalize(word1), capitalize(word2), num)
}

// capitalize returns the string with its first letter uppercased.
func capitalize(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
