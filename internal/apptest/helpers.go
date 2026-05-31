package apptest

import "strconv"

// EmptyJSON marks response bodies that tests do not inspect.
type EmptyJSON struct{}

// Int64SlicePtr returns a pointer to values.
func Int64SlicePtr(values ...int64) *[]int64 {
	copied := append([]int64{}, values...)
	return &copied
}

// FormatID formats a numeric API identifier for path or query construction.
func FormatID(id int64) string {
	return strconv.FormatInt(id, 10)
}

// IDPath appends an integer identifier to a collection path.
func IDPath(collection string, id int64) string {
	return collection + "/" + FormatID(id)
}
