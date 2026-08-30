package services

// CreationUnavailableReason is a stable explanation for an unavailable proposed FQN.
type CreationUnavailableReason string

const (
	CreationUnavailableInvalidFQN        CreationUnavailableReason = "invalid_fqn"
	CreationUnavailablePathConflict      CreationUnavailableReason = "path_conflict"
	CreationUnavailableReservedNamespace CreationUnavailableReason = "reserved_namespace"
)

// CreationAvailability reports whether one proposed FQN can be created.
type CreationAvailability struct {
	Available bool
	Reason    *CreationUnavailableReason
}

// UnavailableCreation constructs a false availability with a stable reason.
func UnavailableCreation(reason CreationUnavailableReason) CreationAvailability {
	return CreationAvailability{Reason: &reason}
}
