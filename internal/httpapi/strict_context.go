package httpapi

import (
	"mina.local/mina/internal/services"
)

func positivePathID(id int64, name string) error {
	if id <= 0 {
		return services.InvalidRequest(name + " must be a positive integer")
	}

	return nil
}
