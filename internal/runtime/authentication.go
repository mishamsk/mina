package runtime

import (
	"fmt"

	"github.com/mishamsk/mina/internal/appconfig"
	authenticationfile "github.com/mishamsk/mina/internal/providers/authentication/file"
	"github.com/mishamsk/mina/internal/services/authentication/administration"
	authentication "github.com/mishamsk/mina/internal/services/authentication/online"
)

func resolveAuthentication(cfg appconfig.Config, profile ExecutionProfile) (*authentication.Service, error) {
	if profile != ExecutionProfileLongRunning || cfg.AuthFile == "" {
		return nil, nil
	}
	snapshot, err := authenticationfile.Load(cfg.AuthFile)
	if err != nil {
		return nil, fmt.Errorf("load authentication: %w", err)
	}
	return authentication.New(snapshot), nil
}

// AuthenticationUser is the secret-free user view returned to the CLI.
type AuthenticationUser = administration.User

// AuthenticationAPIKey is the secret-free API-key view returned to the CLI.
type AuthenticationAPIKey = administration.APIKey

// AuthenticationAdministration is runtime's CLI-only authentication entry point.
type AuthenticationAdministration struct {
	path    string
	service *administration.Service
}

// NewAuthenticationAdministration composes CLI-only authentication administration.
func NewAuthenticationAdministration(cfg appconfig.Config) (*AuthenticationAdministration, error) {
	provider, err := authenticationfile.NewManager(cfg.AuthFile)
	if err != nil {
		return nil, err
	}
	return &AuthenticationAdministration{path: cfg.AuthFile, service: administration.New(provider)}, nil
}

// Path returns the configured authentication file path.
func (a *AuthenticationAdministration) Path() string { return a.path }

// Initialize creates authentication state with its first enabled user.
func (a *AuthenticationAdministration) Initialize(email string, password []byte) (AuthenticationUser, error) {
	return a.service.Initialize(email, password)
}

// Users returns all authentication users without credential material.
func (a *AuthenticationAdministration) Users() ([]AuthenticationUser, error) {
	return a.service.Users()
}

// AddUser appends one enabled authentication user.
func (a *AuthenticationAdministration) AddUser(email string, password []byte) (AuthenticationUser, error) {
	return a.service.AddUser(email, password)
}

// SetUserEnabled enables or disables one authentication user.
func (a *AuthenticationAdministration) SetUserEnabled(identifier string, enabled bool) (AuthenticationUser, error) {
	return a.service.SetUserEnabled(identifier, enabled)
}

// SetPassword changes a user's password and revokes prior sessions.
func (a *AuthenticationAdministration) SetPassword(identifier string, password []byte) (AuthenticationUser, error) {
	return a.service.SetPassword(identifier, password)
}

// RevokeSessions revokes all browser sessions for a user.
func (a *AuthenticationAdministration) RevokeSessions(identifier string) (AuthenticationUser, error) {
	return a.service.RevokeSessions(identifier)
}

// APIKeys returns all API keys without credential material.
func (a *AuthenticationAdministration) APIKeys() ([]AuthenticationAPIKey, error) {
	return a.service.APIKeys()
}

// CreateAPIKey creates an API key and returns its plaintext exactly once.
func (a *AuthenticationAdministration) CreateAPIKey(label string) (AuthenticationAPIKey, string, error) {
	return a.service.CreateAPIKey(label)
}

// RevokeAPIKey revokes one API key.
func (a *AuthenticationAdministration) RevokeAPIKey(identifier string) (AuthenticationAPIKey, error) {
	return a.service.RevokeAPIKey(identifier)
}
