package services

import "strings"

// OptionalStringUpdate carries a nullable string field for partial updates.
type OptionalStringUpdate struct {
	Specified bool
	Value     *string
}

// ValidateDisplayLabel validates an optional explicit entity presentation label.
func ValidateDisplayLabel(label *string) error {
	if label == nil {
		return nil
	}
	if *label == "" || strings.TrimSpace(*label) != *label {
		return InvalidRequest("display_label must be non-empty without leading or trailing whitespace")
	}
	return nil
}

// EffectiveDisplayLabel returns an explicit label or the final one or two FQN segments.
func EffectiveDisplayLabel(fqn string, override *string) string {
	if override != nil {
		return *override
	}
	segments := strings.Split(fqn, ":")
	if len(segments) > 2 {
		segments = segments[len(segments)-2:]
	}
	return strings.Join(segments, ":")
}
