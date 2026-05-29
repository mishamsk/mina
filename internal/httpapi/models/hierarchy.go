package models

import "strings"

// HierarchyFields derives colon-path metadata from an FQN.
func HierarchyFields(fqn string) (parentFQN *string, name string, level int) {
	parts := strings.Split(fqn, ":")
	name = parts[len(parts)-1]
	level = len(parts) - 1
	if len(parts) > 1 {
		parent := strings.Join(parts[:len(parts)-1], ":")
		parentFQN = &parent
	}

	return parentFQN, name, level
}
