package file

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"

	authentication "github.com/mishamsk/mina/internal/services/authentication/online"
)

const (
	sessionIssuer                      = "mina"
	sessionAudience                    = "mina-browser"
	maxConcurrentPasswordVerifications = 1
)

// Snapshot is an immutable authentication view loaded once at startup.
type Snapshot struct {
	signingSecret             []byte
	users                     []authentication.UserRecord
	apiKeys                   []authentication.APIKeyRecord
	passwordVerificationSlots chan struct{}
}

// Load reads and validates one immutable startup snapshot.
func Load(path string) (*Snapshot, error) {
	state, err := readFile(path)
	if err != nil {
		return nil, err
	}
	secret, err := base64.RawURLEncoding.DecodeString(state.SigningSecret)
	if err != nil {
		return nil, fmt.Errorf("decode signing secret: %w", err)
	}
	snapshot := &Snapshot{
		signingSecret:             append([]byte(nil), secret...),
		passwordVerificationSlots: make(chan struct{}, maxConcurrentPasswordVerifications),
	}
	snapshot.users = make([]authentication.UserRecord, 0, len(state.Users))
	for _, user := range state.Users {
		snapshot.users = append(snapshot.users, authentication.UserRecord{
			ID: user.ID, Email: user.Email, Enabled: user.Enabled,
			PasswordHash: user.PasswordHash, SessionVersion: user.SessionVersion,
		})
	}
	snapshot.apiKeys = make([]authentication.APIKeyRecord, 0, len(state.APIKeys))
	for _, key := range state.APIKeys {
		snapshot.apiKeys = append(snapshot.apiKeys, authentication.APIKeyRecord{TokenDigest: key.TokenDigest})
	}
	return snapshot, nil
}

// Users returns the immutable user records loaded at startup.
func (s *Snapshot) Users() []authentication.UserRecord {
	if s == nil {
		return nil
	}
	return append([]authentication.UserRecord(nil), s.users...)
}

// APIKeys returns the immutable API-key records loaded at startup.
func (s *Snapshot) APIKeys() []authentication.APIKeyRecord {
	if s == nil {
		return nil
	}
	return append([]authentication.APIKeyRecord(nil), s.apiKeys...)
}

// VerifyPassword checks password against file-provider credential material.
func (s *Snapshot) VerifyPassword(ctx context.Context, encoded string, password []byte) (bool, error) {
	if s == nil || s.passwordVerificationSlots == nil {
		return false, nil
	}
	select {
	case s.passwordVerificationSlots <- struct{}{}:
	case <-ctx.Done():
		return false, ctx.Err()
	}
	defer func() { <-s.passwordVerificationSlots }()
	return verifyPassword(encoded, password), nil
}

// VerifyAPIKey checks token against file-provider credential material.
func (s *Snapshot) VerifyAPIKey(encoded string, token string) bool {
	if s == nil {
		return false
	}
	digest := sha256.Sum256([]byte(token))
	stored, err := hex.DecodeString(encoded)
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare(digest[:], stored) == 1
}

// SignSession signs one service-owned browser session record.
func (s *Snapshot) SignSession(record authentication.SessionRecord, issuedAt time.Time, expiresAt time.Time) (string, error) {
	if s == nil || len(s.signingSecret) == 0 {
		return "", errors.New("authentication snapshot is not initialized")
	}
	claims := sessionClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    sessionIssuer,
			Audience:  jwt.ClaimStrings{sessionAudience},
			IssuedAt:  jwt.NewNumericDate(issuedAt),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			Subject:   record.Subject,
		},
		TokenType:      record.Type,
		UserID:         record.UserID,
		SessionVersion: record.SessionVersion,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	token.Header["typ"] = "JWT"
	return token.SignedString(s.signingSecret)
}

// ParseSession verifies file-provider session material and returns its service record.
func (s *Snapshot) ParseSession(raw string, now time.Time) (authentication.SessionRecord, error) {
	if s == nil || raw == "" {
		return authentication.SessionRecord{}, authentication.ErrInvalidCredential
	}
	claims := &sessionClaims{}
	_, err := jwt.ParseWithClaims(raw, claims, func(token *jwt.Token) (any, error) {
		if token.Header["typ"] != "JWT" {
			return nil, authentication.ErrInvalidCredential
		}
		return s.signingSecret, nil
	},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer(sessionIssuer),
		jwt.WithAudience(sessionAudience),
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
		jwt.WithTimeFunc(func() time.Time { return now }),
	)
	if err != nil {
		return authentication.SessionRecord{}, authentication.ErrInvalidCredential
	}
	return authentication.SessionRecord{
		Type: claims.TokenType, UserID: claims.UserID, Subject: claims.Subject,
		SessionVersion: claims.SessionVersion,
	}, nil
}

type sessionClaims struct {
	jwt.RegisteredClaims
	TokenType      string `json:"token_type"`
	UserID         string `json:"user_id"`
	SessionVersion uint64 `json:"session_version"`
}

// Validate requires provider-owned temporal signing metadata.
func (c sessionClaims) Validate() error {
	if c.IssuedAt == nil {
		return authentication.ErrInvalidCredential
	}
	return nil
}
