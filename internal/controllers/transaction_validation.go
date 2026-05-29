package controllers

import (
	"strings"
	"time"
)

func validateEffectiveDate(effectiveDate string) error {
	if len(effectiveDate) != len("2006-01-02") {
		return invalidRequest("effective_date must use YYYY-MM-DD format")
	}
	parsed, err := time.Parse("2006-01-02", effectiveDate)
	if err != nil || parsed.Format("2006-01-02") != effectiveDate {
		return invalidRequest("effective_date must use YYYY-MM-DD format")
	}

	return nil
}

func validateCurrency(currency *string) error {
	if currency == nil {
		return nil
	}
	if len(*currency) != 3 {
		return invalidRequest("currency must be a three-letter uppercase code")
	}
	for i := range *currency {
		if (*currency)[i] < 'A' || (*currency)[i] > 'Z' {
			return invalidRequest("currency must be a three-letter uppercase code")
		}
	}

	return nil
}

func validateExternalIdentifiers(externalID *string, externalSystem *string) error {
	if externalID == nil && externalSystem == nil {
		return nil
	}
	if externalID == nil || externalSystem == nil {
		return invalidRequest("external_id and external_system must be provided together")
	}
	if strings.TrimSpace(*externalID) != *externalID || *externalID == "" {
		return invalidRequest("external_id must be non-empty without leading or trailing whitespace")
	}
	if strings.TrimSpace(*externalSystem) != *externalSystem || *externalSystem == "" {
		return invalidRequest("external_system must be non-empty without leading or trailing whitespace")
	}

	return nil
}
