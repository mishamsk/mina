package values

import (
	"fmt"
	"time"
)

// AuditTimestamp is a UTC-normalized timestamp used for audit fields.
type AuditTimestamp struct {
	value time.Time
}

// ParseAuditTimestamp parses an RFC3339 timestamp and normalizes it to UTC.
func ParseAuditTimestamp(value string) (AuditTimestamp, error) {
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return AuditTimestamp{}, fmt.Errorf("audit timestamp must use RFC3339 format")
	}

	return AuditTimestampFromTime(parsed), nil
}

// AuditTimestampFromTime creates a UTC-normalized audit timestamp.
func AuditTimestampFromTime(value time.Time) AuditTimestamp {
	return AuditTimestamp{value: value.UTC()}
}

// Time returns the UTC time represented by t.
func (t AuditTimestamp) Time() time.Time {
	return t.value
}

// String formats t as a UTC RFC3339 timestamp.
func (t AuditTimestamp) String() string {
	return t.value.Format(time.RFC3339)
}
