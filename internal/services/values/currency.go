package values

import (
	"strings"

	"golang.org/x/text/currency"
)

const cryptoCurrencyPrefix = "C::"

// ValidCurrencyCode reports whether code is a fiat ISO 4217 code or a crypto token ticker prefixed with C::.
func ValidCurrencyCode(code string) bool {
	if strings.HasPrefix(code, cryptoCurrencyPrefix) {
		return len(code) > len(cryptoCurrencyPrefix) && strings.TrimSpace(code) == code
	}

	unit, err := currency.ParseISO(code)
	if err != nil {
		return false
	}

	return unit.String() == code
}
