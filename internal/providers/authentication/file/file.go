package file

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/BurntSushi/toml"
	"github.com/gofrs/flock"
	"golang.org/x/crypto/argon2"

	"github.com/mishamsk/mina/internal/services/authentication/administration"
)

const (
	currentFileVersion = 1
	signingSecretBytes = 32
	identifierBytes    = 16
	apiKeyPrefixBytes  = 6
	apiKeySecretBytes  = 32
	fileMode           = 0o600
	directoryMode      = 0o700

	argonMemory       = 64 * 1024
	argonIterations   = 3
	argonParallelism  = 2
	argonSaltBytes    = 16
	argonKeyBytes     = 32
	dummyPasswordHash = "$argon2id$v=19$m=65536,t=3,p=2$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
)

type file struct {
	Version       int      `toml:"version"`
	SigningSecret string   `toml:"signing_secret"`
	Users         []user   `toml:"users"`
	APIKeys       []apiKey `toml:"api_keys"`
}

type user struct {
	ID             string `toml:"id"`
	Email          string `toml:"email"`
	Enabled        bool   `toml:"enabled"`
	PasswordHash   string `toml:"password_hash"`
	SessionVersion uint64 `toml:"session_version"`
}

type apiKey struct {
	ID          string `toml:"id"`
	Label       string `toml:"label"`
	Prefix      string `toml:"prefix"`
	TokenDigest string `toml:"token_digest"`
}

// Manager owns explicit CLI reads and atomic mutations of one authentication file.
type Manager struct {
	path string
}

// NewManager returns a CLI mutation boundary for path.
func NewManager(path string) (*Manager, error) {
	if strings.TrimSpace(path) == "" {
		return nil, errors.New("auth_file is not configured")
	}
	return &Manager{path: filepath.Clean(path)}, nil
}

// Create installs newly built authentication state when the file does not exist.
func (m *Manager) Create(build func() (administration.State, error)) error {
	if err := os.MkdirAll(filepath.Dir(m.path), directoryMode); err != nil {
		return fmt.Errorf("create authentication directory: %w", err)
	}
	return withFileLock(m.path, func() error {
		if _, err := os.Stat(m.path); err == nil {
			return fmt.Errorf("authentication file %s already exists", m.path)
		} else if !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("inspect authentication file %s: %w", m.path, err)
		}
		state, err := build()
		if err != nil {
			return err
		}
		stored := fromAdministrationState(state)
		if err := validateFile(stored); err != nil {
			return err
		}
		return writeNew(m.path, stored)
	})
}

// Read returns service-owned authentication state loaded from the file.
func (m *Manager) Read() (administration.State, error) {
	state, err := readFile(m.path)
	if err != nil {
		return administration.State{}, err
	}
	return toAdministrationState(state), nil
}

// Update atomically applies one service-owned mutation.
func (m *Manager) Update(update func(*administration.State) error) error {
	return withFileLock(m.path, func() error {
		state, err := readFile(m.path)
		if err != nil {
			return err
		}
		serviceState := toAdministrationState(state)
		if err := update(&serviceState); err != nil {
			return err
		}
		if err := m.write(fromAdministrationState(serviceState)); err != nil {
			return err
		}
		return nil
	})
}

// NewSigningSecret creates file-provider signing material.
func (m *Manager) NewSigningSecret() (string, error) {
	return randomString(signingSecretBytes)
}

// NewIdentifier creates a random authentication record identifier.
func (m *Manager) NewIdentifier() (string, error) {
	return randomString(identifierBytes)
}

// HashPassword creates file-provider password credential material.
func (m *Manager) HashPassword(password []byte) (string, error) {
	return hashPassword(password)
}

// NewAPIKey creates file-provider API-key credential material.
func (m *Manager) NewAPIKey() (administration.APIKeyRecord, string, error) {
	prefix, err := randomString(apiKeyPrefixBytes)
	if err != nil {
		return administration.APIKeyRecord{}, "", err
	}
	secret, err := randomString(apiKeySecretBytes)
	if err != nil {
		return administration.APIKeyRecord{}, "", err
	}
	token := "mina_" + prefix + "_" + secret
	digest := sha256.Sum256([]byte(token))
	id, err := randomString(identifierBytes)
	if err != nil {
		return administration.APIKeyRecord{}, "", err
	}
	return administration.APIKeyRecord{ID: id, Prefix: prefix, TokenDigest: hex.EncodeToString(digest[:])}, token, nil
}

func toAdministrationState(state file) administration.State {
	result := administration.State{SigningSecret: state.SigningSecret}
	result.Users = make([]administration.UserRecord, 0, len(state.Users))
	for _, user := range state.Users {
		result.Users = append(result.Users, administration.UserRecord{
			ID: user.ID, Email: user.Email, Enabled: user.Enabled,
			PasswordHash: user.PasswordHash, SessionVersion: user.SessionVersion,
		})
	}
	result.APIKeys = make([]administration.APIKeyRecord, 0, len(state.APIKeys))
	for _, key := range state.APIKeys {
		result.APIKeys = append(result.APIKeys, administration.APIKeyRecord{
			ID: key.ID, Label: key.Label, Prefix: key.Prefix, TokenDigest: key.TokenDigest,
		})
	}
	return result
}

func fromAdministrationState(state administration.State) file {
	result := file{Version: currentFileVersion, SigningSecret: state.SigningSecret}
	result.Users = make([]user, 0, len(state.Users))
	for _, record := range state.Users {
		result.Users = append(result.Users, user{
			ID: record.ID, Email: record.Email, Enabled: record.Enabled,
			PasswordHash: record.PasswordHash, SessionVersion: record.SessionVersion,
		})
	}
	result.APIKeys = make([]apiKey, 0, len(state.APIKeys))
	for _, key := range state.APIKeys {
		result.APIKeys = append(result.APIKeys, apiKey{
			ID: key.ID, Label: key.Label, Prefix: key.Prefix, TokenDigest: key.TokenDigest,
		})
	}
	return result
}

func withFileLock(path string, operation func() error) (err error) {
	lock := flock.New(path + ".lock")
	if err := lock.Lock(); err != nil {
		return fmt.Errorf("lock authentication file: %w", err)
	}
	defer func() {
		if unlockErr := lock.Unlock(); err == nil && unlockErr != nil {
			err = fmt.Errorf("unlock authentication file: %w", unlockErr)
		}
	}()
	return operation()
}

func (m *Manager) write(state file) error {
	if err := validateFile(state); err != nil {
		return err
	}
	return writeAtomic(m.path, state)
}

func readFile(path string) (file, error) {
	var state file
	metadata, err := toml.DecodeFile(path, &state)
	if err != nil {
		return file{}, fmt.Errorf("read authentication file %s: %w", path, err)
	}
	if undecoded := metadata.Undecoded(); len(undecoded) > 0 {
		return file{}, fmt.Errorf("read authentication file %s: unsupported key %s", path, undecoded[0].String())
	}
	if err := validateFile(state); err != nil {
		return file{}, fmt.Errorf("read authentication file %s: %w", path, err)
	}
	return state, nil
}

func validateFile(state file) error {
	if state.Version != currentFileVersion {
		return fmt.Errorf("unsupported authentication file version %d", state.Version)
	}
	secret, err := base64.RawURLEncoding.DecodeString(state.SigningSecret)
	if err != nil || len(secret) != signingSecretBytes {
		return errors.New("invalid signing secret")
	}
	for _, user := range state.Users {
		memory, iterations, parallelism, salt, digest, err := parsePasswordHash(user.PasswordHash)
		if err != nil {
			return fmt.Errorf("user %s has an invalid password hash: %w", user.ID, err)
		}
		if memory != argonMemory || iterations != argonIterations || parallelism != argonParallelism || len(salt) != argonSaltBytes || len(digest) != argonKeyBytes {
			return fmt.Errorf("user %s has unsupported Argon2id parameters", user.ID)
		}
	}
	for _, key := range state.APIKeys {
		digest, err := hex.DecodeString(key.TokenDigest)
		if err != nil || len(digest) != sha256.Size {
			return fmt.Errorf("API key %s has an invalid token digest", key.ID)
		}
	}
	return administration.ValidateState(toAdministrationState(state))
}

func hashPassword(password []byte) (string, error) {
	salt := make([]byte, argonSaltBytes)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return "", fmt.Errorf("generate password salt: %w", err)
	}
	hash := argon2.IDKey(password, salt, argonIterations, argonMemory, argonParallelism, argonKeyBytes)
	return fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s",
		argonMemory, argonIterations, argonParallelism,
		base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(hash)), nil
}

func verifyPassword(encoded string, password []byte) bool {
	memory, iterations, parallelism, salt, expected, err := parsePasswordHash(encoded)
	if err != nil {
		memory, iterations, parallelism, salt, expected, err = parsePasswordHash(dummyPasswordHash)
		if err != nil {
			return false
		}
	}
	actual := argon2.IDKey(password, salt, iterations, memory, parallelism, uint32(len(expected)))
	return subtle.ConstantTimeCompare(actual, expected) == 1
}

func parsePasswordHash(encoded string) (uint32, uint32, uint8, []byte, []byte, error) {
	var memory uint32
	var iterations uint32
	var parallelism uint8
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" || parts[2] != "v=19" {
		return 0, 0, 0, nil, nil, errors.New("unsupported Argon2id encoding")
	}
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &iterations, &parallelism); err != nil || memory == 0 || iterations == 0 || parallelism == 0 {
		return 0, 0, 0, nil, nil, errors.New("invalid Argon2id parameters")
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(salt) == 0 {
		return 0, 0, 0, nil, nil, errors.New("invalid Argon2id salt")
	}
	hash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(hash) == 0 {
		return 0, 0, 0, nil, nil, errors.New("invalid Argon2id digest")
	}
	return memory, iterations, parallelism, salt, hash, nil
}

func randomString(size int) (string, error) {
	value := make([]byte, size)
	if _, err := io.ReadFull(rand.Reader, value); err != nil {
		return "", fmt.Errorf("generate authentication secret: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

func writeAtomic(path string, state file) error {
	temporaryPath, cleanup, err := writeTemporary(path, state)
	if err != nil {
		return err
	}
	defer cleanup()
	if err := os.Rename(temporaryPath, path); err != nil {
		return fmt.Errorf("replace authentication file: %w", err)
	}
	return syncDirectory(filepath.Dir(path))
}

func writeNew(path string, state file) error {
	temporaryPath, cleanup, err := writeTemporary(path, state)
	if err != nil {
		return err
	}
	defer cleanup()
	if err := os.Link(temporaryPath, path); err != nil {
		if errors.Is(err, os.ErrExist) {
			return fmt.Errorf("authentication file %s already exists", path)
		}
		return fmt.Errorf("install authentication file: %w", err)
	}
	return syncDirectory(filepath.Dir(path))
}

func writeTemporary(path string, state file) (string, func(), error) {
	directory := filepath.Dir(path)
	temporary, err := os.CreateTemp(directory, ".mina-auth-*")
	if err != nil {
		return "", func() {}, fmt.Errorf("create authentication file replacement: %w", err)
	}
	temporaryPath := temporary.Name()
	cleanup := func() {
		_ = temporary.Close()
		_ = os.Remove(temporaryPath)
	}
	if err := temporary.Chmod(fileMode); err != nil {
		cleanup()
		return "", func() {}, fmt.Errorf("set authentication file permissions: %w", err)
	}
	if err := toml.NewEncoder(temporary).Encode(state); err != nil {
		cleanup()
		return "", func() {}, fmt.Errorf("encode authentication file: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		cleanup()
		return "", func() {}, fmt.Errorf("sync authentication file: %w", err)
	}
	if err := temporary.Close(); err != nil {
		cleanup()
		return "", func() {}, fmt.Errorf("close authentication file: %w", err)
	}
	return temporaryPath, cleanup, nil
}

func syncDirectory(directory string) error {
	directoryHandle, err := os.Open(directory)
	if err != nil {
		return fmt.Errorf("open authentication directory for sync: %w", err)
	}
	defer func() { _ = directoryHandle.Close() }()
	if err := directoryHandle.Sync(); err != nil {
		return fmt.Errorf("sync authentication directory: %w", err)
	}
	return nil
}
