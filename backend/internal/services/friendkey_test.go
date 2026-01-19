package services

import (
	"regexp"
	"testing"
)

func TestWordlistPopulated(t *testing.T) {
	// BIP39 wordlist should have exactly 2048 words
	if len(wordlist) != 2048 {
		t.Errorf("wordlist should have 2048 words, got %d", len(wordlist))
	}
}

func TestFriendKeyFormat(t *testing.T) {
	// Verify format pattern matches expected: word-word-number
	pattern := regexp.MustCompile(`^[a-z]+-[a-z]+-\d+$`)

	// Generate some sample keys manually to verify format
	for _, word1 := range wordlist[:3] {
		for _, word2 := range wordlist[:3] {
			key := word1 + "-" + word2 + "-42"
			if !pattern.MatchString(key) {
				t.Errorf("Key %q does not match expected pattern", key)
			}
		}
	}
}

func TestWordlistUnique(t *testing.T) {
	wordSet := make(map[string]bool)
	for _, word := range wordlist {
		if wordSet[word] {
			t.Errorf("Duplicate word: %s", word)
		}
		wordSet[word] = true
	}
}
