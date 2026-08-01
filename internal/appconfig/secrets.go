package appconfig

import (
	"fmt"
	"os"
)

// DatabaseEncryptionKeyEnvironment is the sole accepted source for the
// database encryption key. The key is deliberately outside Config and settings
// snapshots.
const DatabaseEncryptionKeyEnvironment = "MINA_DATABASE_ENCRYPTION_KEY"

// DatabaseEncryptionKeyFromEnvironment returns the process database encryption
// key without admitting it to the ordinary configuration system.
func DatabaseEncryptionKeyFromEnvironment() (string, error) {
	key, present := os.LookupEnv(DatabaseEncryptionKeyEnvironment)
	if present && key == "" {
		return "", fmt.Errorf("%s must not be empty", DatabaseEncryptionKeyEnvironment)
	}

	return key, nil
}
