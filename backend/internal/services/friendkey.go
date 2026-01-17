package services

import (
	"context"
	"fmt"
	"math/rand"
	"time"

	"github.com/songify/backend/internal/db"
)

var adjectives = []string{
	"happy", "silly", "clever", "brave", "swift",
	"gentle", "wild", "calm", "bright", "cool",
	"fuzzy", "lucky", "jolly", "merry", "zesty",
	"peppy", "cozy", "funky", "snappy", "groovy",
}

var nouns = []string{
	"tiger", "panda", "dolphin", "eagle", "koala",
	"penguin", "otter", "fox", "owl", "bear",
	"rabbit", "monkey", "whale", "parrot", "turtle",
	"zebra", "lion", "wolf", "deer", "hawk",
}

type FriendKeyService struct {
	queries *db.Queries
	rng     *rand.Rand
}

func NewFriendKeyService(queries *db.Queries) *FriendKeyService {
	return &FriendKeyService{
		queries: queries,
		rng:     rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

func (s *FriendKeyService) Generate(ctx context.Context) (string, error) {
	maxAttempts := 100
	for i := 0; i < maxAttempts; i++ {
		adj := adjectives[s.rng.Intn(len(adjectives))]
		noun := nouns[s.rng.Intn(len(nouns))]
		num := s.rng.Intn(100)
		key := fmt.Sprintf("%s-%s-%d", adj, noun, num)

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
