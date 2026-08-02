package administration

import (
	"errors"
	"fmt"
	"strings"

	emailaddress "github.com/mishamsk/mina/internal/x/email"
)

// User is the secret-free representation returned by administration operations.
type User struct {
	ID             string
	Email          string
	Enabled        bool
	SessionVersion uint64
}

// APIKey is the secret-free representation returned by administration operations.
type APIKey struct {
	ID     string
	Label  string
	Prefix string
}

// State is the service-owned authentication state persisted by a provider.
type State struct {
	SigningSecret string
	Users         []UserRecord
	APIKeys       []APIKeyRecord
}

// UserRecord is mutable user state, including provider-created credential material.
type UserRecord struct {
	ID             string
	Email          string
	Enabled        bool
	PasswordHash   string
	SessionVersion uint64
}

// APIKeyRecord is mutable API-key state, including provider-created credential material.
type APIKeyRecord struct {
	ID          string
	Label       string
	Prefix      string
	TokenDigest string
}

// Provider persists authentication state and creates credential material.
type Provider interface {
	Create(func() (State, error)) error
	Read() (State, error)
	Update(func(*State) error) error
	NewSigningSecret() (string, error)
	NewIdentifier() (string, error)
	HashPassword(password []byte) (string, error)
	NewAPIKey() (APIKeyRecord, string, error)
}

// ValidateState checks service-owned authentication state invariants.
func ValidateState(state State) error {
	if len(state.Users) == 0 {
		return errors.New("at least one authentication user is required")
	}
	userIDs := make(map[string]struct{}, len(state.Users))
	for index, user := range state.Users {
		if user.ID == "" {
			return fmt.Errorf("user %d has an empty ID", index+1)
		}
		if _, exists := userIDs[user.ID]; exists {
			return fmt.Errorf("duplicate user ID %q", user.ID)
		}
		userIDs[user.ID] = struct{}{}
		normalizedEmail, err := normalizeUserEmail(user.Email)
		if err != nil || user.Email != normalizedEmail {
			return fmt.Errorf("user %s has an invalid normalized email", user.ID)
		}
		if userEmailExists(state.Users[:index], user.Email) {
			return fmt.Errorf("duplicate user email %q", user.Email)
		}
		if user.SessionVersion == 0 {
			return fmt.Errorf("user %s has an invalid session version", user.ID)
		}
	}

	keyIDs := make(map[string]struct{}, len(state.APIKeys))
	prefixes := make(map[string]struct{}, len(state.APIKeys))
	for index, key := range state.APIKeys {
		if key.ID == "" || key.Prefix == "" {
			return fmt.Errorf("API key %d has an empty required field", index+1)
		}
		label, err := normalizeAPIKeyLabel(key.Label)
		if err != nil || key.Label != label {
			return fmt.Errorf("API key %d has an invalid label", index+1)
		}
		if _, exists := keyIDs[key.ID]; exists {
			return fmt.Errorf("duplicate API key ID %q", key.ID)
		}
		keyIDs[key.ID] = struct{}{}
		if apiKeyLabelExists(state.APIKeys[:index], key.Label) {
			return fmt.Errorf("duplicate API key label %q", key.Label)
		}
		if _, exists := prefixes[key.Prefix]; exists {
			return fmt.Errorf("duplicate API key prefix %q", key.Prefix)
		}
		prefixes[key.Prefix] = struct{}{}
	}
	return nil
}

// Service owns CLI-only authentication administration use cases.
type Service struct {
	provider Provider
}

// New returns an authentication administration service.
func New(provider Provider) *Service {
	return &Service{provider: provider}
}

// Initialize creates authentication state with its first enabled user.
func (s *Service) Initialize(email string, password []byte) (User, error) {
	var created UserRecord
	err := s.provider.Create(func() (State, error) {
		secret, err := s.provider.NewSigningSecret()
		if err != nil {
			return State{}, err
		}
		created, err = s.newUser(email, password)
		if err != nil {
			return State{}, err
		}
		return State{SigningSecret: secret, Users: []UserRecord{created}}, nil
	})
	return created.view(), err
}

// Users returns all users without credential material.
func (s *Service) Users() ([]User, error) {
	state, err := s.provider.Read()
	if err != nil {
		return nil, err
	}
	result := make([]User, 0, len(state.Users))
	for _, user := range state.Users {
		result = append(result, user.view())
	}
	return result, nil
}

// AddUser appends one enabled user.
func (s *Service) AddUser(email string, password []byte) (User, error) {
	var created UserRecord
	err := s.provider.Update(func(state *State) error {
		var err error
		created, err = s.newUser(email, password)
		if err != nil {
			return err
		}
		if userEmailExists(state.Users, created.Email) {
			return fmt.Errorf("authentication user %q already exists", created.Email)
		}
		state.Users = append(state.Users, created)
		return nil
	})
	return created.view(), err
}

// SetUserEnabled enables or disables one user.
func (s *Service) SetUserEnabled(identifier string, enabled bool) (User, error) {
	return s.updateUser(identifier, func(user *UserRecord) error {
		user.Enabled = enabled
		return nil
	})
}

// SetPassword replaces a user's password and revokes prior sessions.
func (s *Service) SetPassword(identifier string, password []byte) (User, error) {
	return s.updateUser(identifier, func(user *UserRecord) error {
		hash, err := s.hashPassword(password)
		if err != nil {
			return err
		}
		user.PasswordHash = hash
		user.SessionVersion++
		return nil
	})
}

// RevokeSessions revokes all browser sessions for a user.
func (s *Service) RevokeSessions(identifier string) (User, error) {
	return s.updateUser(identifier, func(user *UserRecord) error {
		user.SessionVersion++
		return nil
	})
}

// APIKeys returns all API keys without credential material.
func (s *Service) APIKeys() ([]APIKey, error) {
	state, err := s.provider.Read()
	if err != nil {
		return nil, err
	}
	result := make([]APIKey, 0, len(state.APIKeys))
	for _, key := range state.APIKeys {
		result = append(result, key.view())
	}
	return result, nil
}

// CreateAPIKey creates a key and returns its plaintext exactly once.
func (s *Service) CreateAPIKey(label string) (APIKey, string, error) {
	var err error
	label, err = normalizeAPIKeyLabel(label)
	if err != nil {
		return APIKey{}, "", err
	}
	var created APIKeyRecord
	var token string
	err = s.provider.Update(func(state *State) error {
		if apiKeyLabelExists(state.APIKeys, label) {
			return fmt.Errorf("API key label %q already exists", label)
		}
		for {
			var err error
			created, token, err = s.provider.NewAPIKey()
			if err != nil {
				return err
			}
			if uniqueAPIKeyPrefix(state.APIKeys, created.Prefix) {
				break
			}
		}
		created.Label = label
		state.APIKeys = append(state.APIKeys, created)
		return nil
	})
	return created.view(), token, err
}

// RevokeAPIKey revokes an API key.
func (s *Service) RevokeAPIKey(identifier string) (APIKey, error) {
	var removed APIKeyRecord
	err := s.provider.Update(func(state *State) error {
		index := -1
		for candidate, key := range state.APIKeys {
			if key.ID == identifier || key.Prefix == identifier {
				index = candidate
				break
			}
		}
		if index < 0 {
			return fmt.Errorf("API key %q not found", identifier)
		}
		removed = state.APIKeys[index]
		state.APIKeys = append(state.APIKeys[:index], state.APIKeys[index+1:]...)
		return nil
	})
	return removed.view(), err
}

func (s *Service) newUser(email string, password []byte) (UserRecord, error) {
	var err error
	email, err = normalizeUserEmail(email)
	if err != nil {
		return UserRecord{}, err
	}
	id, err := s.provider.NewIdentifier()
	if err != nil {
		return UserRecord{}, err
	}
	hash, err := s.hashPassword(password)
	if err != nil {
		return UserRecord{}, err
	}
	return UserRecord{ID: id, Email: email, Enabled: true, PasswordHash: hash, SessionVersion: 1}, nil
}

func normalizeUserEmail(value string) (string, error) {
	value = emailaddress.Normalize(value)
	if !emailaddress.Valid(value) {
		return "", errors.New("authentication user email must be valid")
	}
	return value, nil
}

func normalizeAPIKeyLabel(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", errors.New("API key label must not be empty")
	}
	return value, nil
}

func userEmailExists(users []UserRecord, email string) bool {
	for _, user := range users {
		if user.Email == email {
			return true
		}
	}
	return false
}

func apiKeyLabelExists(keys []APIKeyRecord, label string) bool {
	for _, key := range keys {
		if strings.EqualFold(key.Label, label) {
			return true
		}
	}
	return false
}

func (s *Service) hashPassword(password []byte) (string, error) {
	if len(password) == 0 {
		return "", errors.New("password must not be empty")
	}
	return s.provider.HashPassword(password)
}

func (s *Service) updateUser(identifier string, update func(*UserRecord) error) (User, error) {
	var changed UserRecord
	err := s.provider.Update(func(state *State) error {
		index, err := findUser(state.Users, identifier)
		if err != nil {
			return err
		}
		if err := update(&state.Users[index]); err != nil {
			return err
		}
		changed = state.Users[index]
		return nil
	})
	return changed.view(), err
}

func findUser(users []UserRecord, identifier string) (int, error) {
	normalized := emailaddress.Normalize(identifier)
	for index, user := range users {
		if user.ID == identifier || user.Email == normalized {
			return index, nil
		}
	}
	return -1, fmt.Errorf("authentication user %q not found", identifier)
}

func uniqueAPIKeyPrefix(keys []APIKeyRecord, prefix string) bool {
	for _, key := range keys {
		if key.Prefix == prefix {
			return false
		}
	}
	return true
}

func (u UserRecord) view() User {
	return User{ID: u.ID, Email: u.Email, Enabled: u.Enabled, SessionVersion: u.SessionVersion}
}

func (k APIKeyRecord) view() APIKey {
	return APIKey{ID: k.ID, Label: k.Label, Prefix: k.Prefix}
}
