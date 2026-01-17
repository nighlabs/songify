package services

import (
	"regexp"
	"testing"
)

func TestFriendKeyFormat(t *testing.T) {
	// Test that adjectives and nouns arrays are populated
	if len(adjectives) == 0 {
		t.Error("adjectives array should not be empty")
	}

	if len(nouns) == 0 {
		t.Error("nouns array should not be empty")
	}

	// Verify format pattern matches expected: adjective-noun-number
	pattern := regexp.MustCompile(`^[a-z]+-[a-z]+-\d+$`)

	// Generate some sample keys manually to verify format
	for _, adj := range adjectives[:3] {
		for _, noun := range nouns[:3] {
			key := adj + "-" + noun + "-42"
			if !pattern.MatchString(key) {
				t.Errorf("Key %q does not match expected pattern", key)
			}
		}
	}
}

func TestAdjectivesAndNounsUnique(t *testing.T) {
	adjSet := make(map[string]bool)
	for _, adj := range adjectives {
		if adjSet[adj] {
			t.Errorf("Duplicate adjective: %s", adj)
		}
		adjSet[adj] = true
	}

	nounSet := make(map[string]bool)
	for _, noun := range nouns {
		if nounSet[noun] {
			t.Errorf("Duplicate noun: %s", noun)
		}
		nounSet[noun] = true
	}
}
