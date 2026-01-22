package services

import (
	"context"
	"fmt"
	"math/rand"
	"strings"
	"time"

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
	rng     *rand.Rand
}

// NewFriendKeyService creates a FriendKeyService with its own random source.
func NewFriendKeyService(queries *db.Queries) *FriendKeyService {
	return &FriendKeyService{
		queries: queries,
		rng:     rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

// Generate creates a unique friend key, retrying if collisions occur.
// Returns an error if no unique key can be found after 100 attempts.
func (s *FriendKeyService) Generate(ctx context.Context) (string, error) {
	maxAttempts := 100
	for i := 0; i < maxAttempts; i++ {
		word1 := wordlist[s.rng.Intn(len(wordlist))]
		word2 := wordlist[s.rng.Intn(len(wordlist))]
		num := s.rng.Intn(100)
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
	word1 := wordlist[s.rng.Intn(len(wordlist))]
	word2 := wordlist[s.rng.Intn(len(wordlist))]
	num := s.rng.Intn(100)
	return fmt.Sprintf("%s%s%d", capitalize(word1), capitalize(word2), num)
}

// capitalize returns the string with its first letter uppercased.
func capitalize(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
