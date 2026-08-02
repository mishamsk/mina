package online

import (
	"context"
	"errors"
	"time"

	emailaddress "github.com/mishamsk/mina/internal/x/email"
)

const (
	sessionType     = "session"
	sessionLifetime = 180 * 24 * time.Hour
)

// ErrInvalidCredential is returned without revealing which credential check failed.
var ErrInvalidCredential = errors.New("invalid credential")

// Identity is the authenticated user represented by a browser session.
type Identity struct {
	UserID         string
	Email          string
	SessionVersion uint64
}

// UserRecord is immutable user state supplied to online authentication.
type UserRecord struct {
	ID             string
	Email          string
	Enabled        bool
	PasswordHash   string
	SessionVersion uint64
}

// APIKeyRecord is immutable API-key state supplied to online authentication.
type APIKeyRecord struct {
	TokenDigest string
}

// SessionRecord is the service-owned payload signed into a browser session.
type SessionRecord struct {
	Type           string
	UserID         string
	Subject        string
	SessionVersion uint64
}

// IssuedSession is a signed browser session with its service-owned expiration.
type IssuedSession struct {
	Token     string
	ExpiresAt time.Time
}

// Provider supplies immutable state and credential-material operations.
type Provider interface {
	Users() []UserRecord
	APIKeys() []APIKeyRecord
	VerifyPassword(ctx context.Context, encoded string, password []byte) (bool, error)
	VerifyAPIKey(digest string, token string) bool
	SignSession(record SessionRecord, issuedAt time.Time, expiresAt time.Time) (string, error)
	ParseSession(raw string, now time.Time) (SessionRecord, error)
}

// Service owns online authentication use cases over immutable provider state.
type Service struct {
	provider Provider
}

// New returns an online authentication service backed by immutable provider state.
func New(provider Provider) *Service {
	return &Service{provider: provider}
}

// AuthenticatePassword verifies an enabled user's email and password.
func (s *Service) AuthenticatePassword(ctx context.Context, email string, password []byte) (Identity, error) {
	if s == nil || s.provider == nil {
		return Identity{}, ErrInvalidCredential
	}
	normalized := emailaddress.Normalize(email)
	var candidate *UserRecord
	for _, user := range s.provider.Users() {
		if user.Email == normalized && user.Enabled {
			matched := user
			candidate = &matched
			break
		}
	}
	encoded := ""
	if candidate != nil {
		encoded = candidate.PasswordHash
	}
	verified, err := s.provider.VerifyPassword(ctx, encoded, password)
	if err != nil {
		return Identity{}, err
	}
	if verified && candidate != nil {
		return identity(*candidate), nil
	}
	return Identity{}, ErrInvalidCredential
}

// VerifyAPIKey verifies an active API key token.
func (s *Service) VerifyAPIKey(token string) error {
	if s == nil || s.provider == nil || token == "" {
		return ErrInvalidCredential
	}
	for _, key := range s.provider.APIKeys() {
		if s.provider.VerifyAPIKey(key.TokenDigest, token) {
			return nil
		}
	}
	return ErrInvalidCredential
}

// IssueSession signs a browser session for identity using the service-owned lifetime.
func (s *Service) IssueSession(identity Identity, issuedAt time.Time) (IssuedSession, error) {
	if s == nil || s.provider == nil {
		return IssuedSession{}, errors.New("authentication service is not initialized")
	}
	if !s.validIdentity(identity) {
		return IssuedSession{}, ErrInvalidCredential
	}
	expiresAt := issuedAt.Add(sessionLifetime)
	token, err := s.provider.SignSession(SessionRecord{
		Type:           sessionType,
		UserID:         identity.UserID,
		Subject:        identity.UserID,
		SessionVersion: identity.SessionVersion,
	}, issuedAt, expiresAt)
	if err != nil {
		return IssuedSession{}, err
	}
	return IssuedSession{Token: token, ExpiresAt: expiresAt}, nil
}

// VerifySession validates a browser session against immutable user state.
func (s *Service) VerifySession(raw string, now time.Time) (Identity, error) {
	if s == nil || s.provider == nil || raw == "" {
		return Identity{}, ErrInvalidCredential
	}
	record, err := s.provider.ParseSession(raw, now)
	if err != nil || record.Type != sessionType || record.UserID == "" || record.Subject != record.UserID || record.SessionVersion == 0 {
		return Identity{}, ErrInvalidCredential
	}
	for _, user := range s.provider.Users() {
		if user.ID == record.UserID && user.Enabled && user.SessionVersion == record.SessionVersion {
			return identity(user), nil
		}
	}
	return Identity{}, ErrInvalidCredential
}

func (s *Service) validIdentity(candidate Identity) bool {
	for _, user := range s.provider.Users() {
		if user.ID == candidate.UserID && user.Email == candidate.Email && user.Enabled && user.SessionVersion == candidate.SessionVersion {
			return true
		}
	}
	return false
}

func identity(user UserRecord) Identity {
	return Identity{UserID: user.ID, Email: user.Email, SessionVersion: user.SessionVersion}
}
