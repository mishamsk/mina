package services

import (
	"sort"
	"strings"
)

// FQNLeafState is the leaf state needed to derive implicit hierarchy groups.
type FQNLeafState struct {
	FQN      string
	IsHidden bool
}

// FQNGroupState is an implicit hierarchy group derived from active leaves.
type FQNGroupState struct {
	FQN       string
	ParentFQN *string
	Level     int
	IsHidden  bool
}

// FQNAtOrUnder reports whether fqn equals path or is below path at a segment boundary.
func FQNAtOrUnder(fqn string, path string) bool {
	return fqn == path || strings.HasPrefix(fqn, path+":")
}

func fqnGroupPrefixes(fqn string) []string {
	prefixes := []string{}
	for index, value := range fqn {
		if value == ':' {
			prefixes = append(prefixes, fqn[:index])
		}
	}

	return prefixes
}

// DeriveFQNGroupStates derives implicit groups from active leaves.
func DeriveFQNGroupStates(leaves []FQNLeafState, includeHidden bool) []FQNGroupState {
	type aggregate struct {
		leafCount       int
		hiddenLeafCount int
	}

	groups := map[string]aggregate{}
	for _, leaf := range leaves {
		for _, prefix := range fqnGroupPrefixes(leaf.FQN) {
			group := groups[prefix]
			group.leafCount++
			if leaf.IsHidden {
				group.hiddenLeafCount++
			}
			groups[prefix] = group
		}
	}

	states := make([]FQNGroupState, 0, len(groups))
	for fqn, group := range groups {
		isHidden := group.leafCount > 0 && group.leafCount == group.hiddenLeafCount
		if isHidden && !includeHidden {
			continue
		}
		states = append(states, FQNGroupState{
			FQN:       fqn,
			ParentFQN: fqnParent(fqn),
			Level:     fqnLevel(fqn),
			IsHidden:  isHidden,
		})
	}
	sort.Slice(states, func(i, j int) bool {
		return states[i].FQN < states[j].FQN
	})

	return states
}

func fqnParent(fqn string) *string {
	index := strings.LastIndex(fqn, ":")
	if index < 0 {
		return nil
	}
	parent := fqn[:index]
	return &parent
}

func fqnLevel(fqn string) int {
	return strings.Count(fqn, ":")
}

// FQNPathConflict reports whether candidate equals, extends, or is a
// segment-boundary path prefix of existing.
func FQNPathConflict(candidate string, existing string) bool {
	return candidate == existing ||
		strings.HasPrefix(candidate, existing+":") ||
		strings.HasPrefix(existing, candidate+":")
}

// ValidateFQN validates Mina colon-separated hierarchical names.
func ValidateFQN(fqn string) error {
	if strings.TrimSpace(fqn) != fqn || fqn == "" {
		return InvalidRequest("fqn must be non-empty without leading or trailing whitespace")
	}
	if strings.HasPrefix(fqn, ":") || strings.HasSuffix(fqn, ":") || strings.Contains(fqn, "::") {
		return InvalidRequest("fqn must be colon-separated with non-empty segments")
	}
	for segment := range strings.SplitSeq(fqn, ":") {
		if strings.TrimSpace(segment) != segment || segment == "" {
			return InvalidRequest("fqn segments must be non-empty without leading or trailing whitespace")
		}
	}

	return nil
}
