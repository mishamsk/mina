// Package email provides app-agnostic email address helpers.
package email

import (
	"strings"
	"unicode"
)

// Normalize returns the canonical form Mina uses for email identity comparisons.
func Normalize(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

// Valid reports whether value has Mina's minimal email-address shape.
func Valid(value string) bool {
	return value != "" && strings.Contains(value, "@") && strings.IndexFunc(value, unicode.IsControl) < 0
}
