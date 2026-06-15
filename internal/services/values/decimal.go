package values

import (
	"errors"
	"fmt"
	"strings"

	"github.com/govalues/decimal"
)

const decimalScale = 8

// Decimal validation sentinel errors identify why parsing failed.
var (
	ErrDecimalWhitespace    = errors.New("decimal has surrounding whitespace or is empty")
	ErrDecimalSigned        = errors.New("decimal is signed")
	ErrDecimalPlusSign      = errors.New("decimal uses explicit plus sign")
	ErrDecimalMissingDigits = errors.New("decimal is missing digits")
	ErrDecimalFractionScale = errors.New("decimal has invalid fractional scale")
	ErrDecimalIntegerDigits = errors.New("decimal has too many integer digits")
	ErrDecimalInvalidDigit  = errors.New("decimal contains invalid digits")
	ErrDecimalTotalDigits   = errors.New("decimal has too many total digits")
	ErrDecimalPrecision     = errors.New("decimal exceeds precision")
	ErrDecimalZero          = errors.New("decimal is zero")
	ErrDecimalNegative      = errors.New("decimal is negative")
)

// Decimal is a DECIMAL(18,8) application value backed by github.com/govalues/decimal.
type Decimal struct {
	value decimal.Decimal
}

// ParseDecimal parses a signed DECIMAL(18,8) value.
func ParseDecimal(value string) (Decimal, error) {
	return parseDecimal(value, decimalAllowSigned, decimalAllowZero)
}

// ParseNonZeroDecimal parses a signed DECIMAL(18,8) value that must not be zero.
func ParseNonZeroDecimal(value string) (Decimal, error) {
	return parseDecimal(value, decimalAllowSigned, decimalForbidZero)
}

// ParsePositiveDecimal parses a DECIMAL(18,8) value greater than zero.
func ParsePositiveDecimal(value string) (Decimal, error) {
	parsed, err := parseDecimal(value, decimalForbidSigned, decimalForbidZero)
	if err != nil {
		return Decimal{}, err
	}
	if parsed.value.IsNeg() {
		return Decimal{}, ErrDecimalNegative
	}

	return parsed, nil
}

// ParseNonNegativeDecimal parses a DECIMAL(18,8) value greater than or equal to zero.
func ParseNonNegativeDecimal(value string) (Decimal, error) {
	parsed, err := parseDecimal(value, decimalForbidSigned, decimalAllowZero)
	if err != nil {
		return Decimal{}, err
	}
	if parsed.value.IsNeg() {
		return Decimal{}, ErrDecimalNegative
	}

	return parsed, nil
}

// DecimalFromLibrary validates and wraps a decimal library value.
func DecimalFromLibrary(value decimal.Decimal) (Decimal, error) {
	return enforceDecimalConstraints(value)
}

// LibraryDecimal returns the underlying decimal library value.
func (d Decimal) LibraryDecimal() decimal.Decimal {
	return d.value
}

// IsZero reports whether d is numerically zero.
func (d Decimal) IsZero() bool {
	return d.value.IsZero()
}

// Sign returns -1, 0, or 1 depending on d's sign.
func (d Decimal) Sign() int {
	return d.value.Sign()
}

// Cmp compares d and other numerically.
func (d Decimal) Cmp(other Decimal) int {
	return d.value.Cmp(other.value)
}

// Add returns d+other while preserving DECIMAL(18,8) constraints.
func (d Decimal) Add(other Decimal) (Decimal, error) {
	sum, err := d.value.AddExact(other.value, decimalScale)
	if err != nil {
		return Decimal{}, fmt.Errorf("add decimal: %w", err)
	}

	return enforceDecimalConstraints(sum)
}

// Neg returns -d while preserving DECIMAL(18,8) constraints.
func (d Decimal) Neg() Decimal {
	return Decimal{value: d.value.Neg()}
}

// Abs returns the absolute value of d.
func (d Decimal) Abs() Decimal {
	return Decimal{value: d.value.Abs()}
}

// String formats d with exactly 8 fractional digits.
func (d Decimal) String() string {
	return d.value.Pad(decimalScale).String()
}

type decimalSignPolicy bool

const (
	decimalAllowSigned  decimalSignPolicy = true
	decimalForbidSigned decimalSignPolicy = false
)

type decimalZeroPolicy bool

const (
	decimalAllowZero  decimalZeroPolicy = true
	decimalForbidZero decimalZeroPolicy = false
)

func parseDecimal(value string, signPolicy decimalSignPolicy, zeroPolicy decimalZeroPolicy) (Decimal, error) {
	normalized, err := normalizeDecimalString(value, signPolicy)
	if err != nil {
		return Decimal{}, err
	}

	parsed, err := decimal.ParseExact(normalized, decimalScale)
	if err != nil {
		return Decimal{}, fmt.Errorf("%w: %w", ErrDecimalPrecision, err)
	}

	wrapped, err := enforceDecimalConstraints(parsed)
	if err != nil {
		return Decimal{}, err
	}
	if zeroPolicy == decimalForbidZero && wrapped.value.IsZero() {
		return Decimal{}, ErrDecimalZero
	}

	return wrapped, nil
}

func normalizeDecimalString(value string, signPolicy decimalSignPolicy) (string, error) {
	if strings.TrimSpace(value) != value || value == "" {
		return "", ErrDecimalWhitespace
	}

	sign := ""
	if strings.HasPrefix(value, "-") {
		if signPolicy == decimalForbidSigned {
			return "", ErrDecimalSigned
		}
		sign = "-"
		value = strings.TrimPrefix(value, "-")
	} else if strings.HasPrefix(value, "+") {
		return "", ErrDecimalPlusSign
	}
	if value == "" {
		return "", ErrDecimalMissingDigits
	}

	parts := strings.Split(value, ".")
	if len(parts) > 2 || parts[0] == "" {
		return "", ErrDecimalMissingDigits
	}
	if len(parts) == 2 && (parts[1] == "" || len(parts[1]) > decimalScale) {
		return "", ErrDecimalFractionScale
	}
	if len(parts[0]) > 10 {
		return "", ErrDecimalIntegerDigits
	}

	digitCount := 0
	for _, part := range parts {
		for i := range part {
			if part[i] < '0' || part[i] > '9' {
				return "", ErrDecimalInvalidDigit
			}
			digitCount++
		}
	}
	if digitCount > 18 {
		return "", ErrDecimalTotalDigits
	}

	fraction := ""
	if len(parts) == 2 {
		fraction = parts[1]
	}
	fraction += strings.Repeat("0", decimalScale-len(fraction))

	return sign + parts[0] + "." + fraction, nil
}

func enforceDecimalConstraints(value decimal.Decimal) (Decimal, error) {
	if value.Scale() > decimalScale {
		return Decimal{}, ErrDecimalFractionScale
	}
	value = value.Pad(decimalScale)
	if value.Prec() > 18 {
		return Decimal{}, ErrDecimalPrecision
	}
	whole, _, ok := value.Int64(decimalScale)
	if !ok {
		return Decimal{}, ErrDecimalIntegerDigits
	}
	if whole > 9999999999 || whole < -9999999999 {
		return Decimal{}, ErrDecimalIntegerDigits
	}

	return Decimal{value: value}, nil
}
