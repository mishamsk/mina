package services

import "strings"

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
