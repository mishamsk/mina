package values

import (
	"fmt"
	"time"
)

const civilDateLayout = "2006-01-02"

// CivilDate is a calendar date with no time-of-day or location component.
type CivilDate struct {
	value time.Time
}

// ParseCivilDate parses a date that exactly matches YYYY-MM-DD.
func ParseCivilDate(value string) (CivilDate, error) {
	if len(value) != len(civilDateLayout) {
		return CivilDate{}, fmt.Errorf("civil date must use YYYY-MM-DD format")
	}

	parsed, err := time.Parse(civilDateLayout, value)
	if err != nil || parsed.Format(civilDateLayout) != value {
		return CivilDate{}, fmt.Errorf("civil date must use YYYY-MM-DD format")
	}

	return CivilDate{value: parsed}, nil
}

// CivilDateFromTime creates a civil date from value's UTC calendar date component.
func CivilDateFromTime(value time.Time) CivilDate {
	year, month, day := value.UTC().Date()

	return CivilDate{value: time.Date(year, month, day, 0, 0, 0, 0, time.UTC)}
}

// Time returns the UTC midnight representation of d.
func (d CivilDate) Time() time.Time {
	return d.value
}

// String formats d as YYYY-MM-DD.
func (d CivilDate) String() string {
	return d.value.Format(civilDateLayout)
}
