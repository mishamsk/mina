// Package fuzzyrank provides entity-neutral matching and ordering for type-ahead candidates.
package fuzzyrank

import (
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/lithammer/fuzzysearch/fuzzy"
)

type tier uint8

const (
	tierAll tier = iota
	tierExact
	tierPrefix
	tierSubstring
	tierOneEdit
	tierTwoEdits
	tierThreeEdits
	tierSubsequence
)

// Candidate contains entity-neutral search and tie-break fields plus caller-owned data.
type Candidate[T any] struct {
	ID    string
	Title string
	FQN   string
	Terms []string
	Value T
}

type matchedCandidate[T any] struct {
	Candidate Candidate[T]
	Tier      tier
}

// Rank returns matching candidates ordered by best tier, title, FQN, and stable ID.
func Rank[T any](query string, candidates []Candidate[T]) []Candidate[T] {
	normalizedQuery := normalize(query)
	matches := make([]matchedCandidate[T], 0, len(candidates))
	for _, candidate := range candidates {
		tier, ok := bestTier(normalizedQuery, candidate.Terms)
		if !ok {
			continue
		}
		matches = append(matches, matchedCandidate[T]{Candidate: candidate, Tier: tier})
	}

	sort.SliceStable(matches, func(i, j int) bool {
		left := matches[i]
		right := matches[j]
		return left.Tier < right.Tier ||
			(left.Tier == right.Tier && (left.Candidate.Title < right.Candidate.Title ||
				(left.Candidate.Title == right.Candidate.Title && (left.Candidate.FQN < right.Candidate.FQN ||
					(left.Candidate.FQN == right.Candidate.FQN && left.Candidate.ID < right.Candidate.ID)))))
	})

	ordered := make([]Candidate[T], len(matches))
	for index, match := range matches {
		ordered[index] = match.Candidate
	}
	return ordered
}

// Limit bounds ranked candidates while retaining a literal exact-FQN match.
func Limit[T any](query string, candidates []Candidate[T], limit int) []Candidate[T] {
	if limit <= 0 {
		return nil
	}
	if len(candidates) <= limit {
		return candidates
	}
	for _, candidate := range candidates[limit:] {
		if candidate.FQN != query {
			continue
		}
		bounded := make([]Candidate[T], 0, limit)
		bounded = append(bounded, candidates[:limit-1]...)
		return append(bounded, candidate)
	}
	return candidates[:limit]
}

func bestTier(normalizedQuery string, terms []string) (tier, bool) {
	if normalizedQuery == "" {
		return tierAll, true
	}

	best := tierSubsequence + 1
	for _, term := range terms {
		tier, ok := matchTier(normalizedQuery, term)
		if ok && tier < best {
			best = tier
		}
	}
	return best, best <= tierSubsequence
}

func matchTier(normalizedQuery string, term string) (tier, bool) {
	normalizedTerm := normalize(term)
	switch {
	case normalizedTerm == normalizedQuery:
		return tierExact, true
	case strings.HasPrefix(normalizedTerm, normalizedQuery):
		return tierPrefix, true
	case strings.Contains(normalizedTerm, normalizedQuery):
		return tierSubstring, true
	}

	distance := fuzzy.LevenshteinDistance(normalizedQuery, normalizedTerm)
	if distance > 0 && distance <= maxEditDistance(normalizedQuery) {
		return tierOneEdit + tier(distance-1), true
	}
	if orderedSubsequenceMatch(normalizedQuery, normalizedTerm) {
		return tierSubsequence, true
	}
	return 0, false
}

func orderedSubsequenceMatch(query string, term string) bool {
	queryTokens := searchTokens(query)
	if len(queryTokens) <= 1 {
		return fuzzy.MatchNormalizedFold(query, term)
	}

	termTokens := searchTokens(term)
	termIndex := 0
	for _, queryToken := range queryTokens {
		matched := false
		for termIndex < len(termTokens) {
			termToken := termTokens[termIndex]
			termIndex++
			if fuzzy.MatchNormalizedFold(queryToken, termToken) {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}
	return true
}

func searchTokens(value string) []string {
	return strings.FieldsFunc(value, func(character rune) bool {
		return character == ':' || unicode.IsSpace(character)
	})
}

func maxEditDistance(normalizedQuery string) int {
	switch utf8.RuneCountInString(normalizedQuery) {
	case 0:
		return 0
	case 1, 2, 3, 4:
		return 1
	case 5, 6, 7, 8:
		return 2
	default:
		return 3
	}
}

func normalize(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}
