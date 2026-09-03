package services

import "time"

// ETag returns the canonical strong validator for an updated-at timestamp.
func ETag(updatedAt time.Time) string {
	return `"` + updatedAt.UTC().Format(time.RFC3339Nano) + `"`
}

// UpdatedAtFromETag parses a canonical timestamp ETag for a conditional write.
func UpdatedAtFromETag(etag string, resource string) (time.Time, error) {
	if !validStrongETag(etag) {
		return time.Time{}, InvalidRequest("If-Match must be a strong " + resource + " ETag")
	}
	updatedAt, err := time.Parse(time.RFC3339Nano, etag[1:len(etag)-1])
	if err != nil || ETag(updatedAt) != etag {
		return time.Time{}, PreconditionFailed(resource + " changed since it was read")
	}
	return updatedAt.UTC(), nil
}

func validStrongETag(etag string) bool {
	if len(etag) < 2 || etag[0] != '"' || etag[len(etag)-1] != '"' {
		return false
	}
	for index := 1; index < len(etag)-1; index++ {
		character := etag[index]
		if character != 0x21 && (character < 0x23 || character > 0x7e) && character < 0x80 {
			return false
		}
	}
	return true
}
