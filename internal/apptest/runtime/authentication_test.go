package runtime_test

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestAuthenticationStartupIsOptionalAndFailsClosed(t *testing.T) {
	t.Run("disabled", func(t *testing.T) {
		client := newSharedClient(t)
		client.Close()
	})

	t.Run("valid file", func(t *testing.T) {
		path := apptest.NewAuthenticationFile(t, "admin@local", "test-password")
		client := newSharedClient(t, apptest.WithAuthenticationFile(path))
		client.Close()
	})

	t.Run("missing file", func(t *testing.T) {
		missing := filepath.Join(t.TempDir(), "missing-auth.toml")
		_, err := apptest.NewResult(t, apptest.WithAuthenticationFile(missing))
		if err == nil || !strings.Contains(err.Error(), "load authentication") || !strings.Contains(err.Error(), "missing-auth.toml") {
			t.Fatalf("startup error = %v, want redacted missing authentication file failure", err)
		}
	})

	t.Run("unreadable file", func(t *testing.T) {
		path := apptest.NewAuthenticationFile(t, "admin@local", "test-password")
		if err := os.Chmod(path, 0); err != nil {
			t.Fatalf("make authentication file unreadable: %v", err)
		}
		t.Cleanup(func() { _ = os.Chmod(path, 0o600) })
		_, err := apptest.NewResult(t, apptest.WithAuthenticationFile(path))
		if err == nil || !strings.Contains(err.Error(), "read authentication file") {
			t.Fatalf("startup error = %v, want unreadable authentication file failure", err)
		}
	})

	t.Run("invalid current file", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "auth.toml")
		contents := "version = 1\nsigning_secret = \"not-a-secret\"\n"
		if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
			t.Fatalf("write invalid authentication file: %v", err)
		}
		_, err := apptest.NewResult(t, apptest.WithAuthenticationFile(path))
		if err == nil || !strings.Contains(err.Error(), "invalid signing secret") {
			t.Fatalf("startup error = %v, want invalid current authentication file failure", err)
		}
		if strings.Contains(err.Error(), "not-a-secret") {
			t.Fatalf("startup error exposed signing material: %v", err)
		}
	})

	t.Run("unsupported file", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "auth.toml")
		contents := "version = 999\nsigning_secret = \"not-a-secret\"\n"
		if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
			t.Fatalf("write invalid authentication file: %v", err)
		}
		_, err := apptest.NewResult(t, apptest.WithAuthenticationFile(path))
		if err == nil || !strings.Contains(err.Error(), "unsupported authentication file version 999") {
			t.Fatalf("startup error = %v, want unsupported version failure", err)
		}
		if strings.Contains(err.Error(), "not-a-secret") {
			t.Fatalf("startup error exposed signing material: %v", err)
		}
	})
}

func TestAuthenticationProtectsRESTAndManagesBrowserSessions(t *testing.T) {
	fixture := apptest.NewAuthenticationFixture(t)
	now := time.Date(2026, time.August, 1, 12, 0, 0, 0, time.UTC)
	clock := apptest.NewFakeClock(now)
	client := newSharedClient(t, apptest.WithAuthenticationFile(fixture.Path), apptest.WithClock(clock))

	health, err := client.REST().GetHealthWithResponse(context.Background())
	if err != nil || health.StatusCode() != http.StatusOK {
		t.Fatalf("public health = status %d, error %v", health.StatusCode(), err)
	}
	status, err := client.REST().GetAuthenticationStatusWithResponse(context.Background())
	if err != nil || status.StatusCode() != http.StatusOK || !status.JSON200.Enabled || status.JSON200.Authenticated {
		t.Fatalf("public auth status = %+v, status %d, error %v", status.JSON200, status.StatusCode(), err)
	}

	protected, err := client.REST().GetSettingsWithResponse(context.Background())
	assertAuthenticationError(t, err, protected.StatusCode(), protected.Body, http.StatusUnauthorized, "unauthenticated")
	protected, err = client.REST().GetSettingsWithResponse(context.Background(), httpclient.BearerTokenEditor("invalid-key"))
	assertAuthenticationError(t, err, protected.StatusCode(), protected.Body, http.StatusUnauthorized, "unauthenticated")
	protected, err = client.REST().GetSettingsWithResponse(context.Background(), httpclient.BearerTokenEditor(fixture.APIKey))
	if err != nil || protected.StatusCode() != http.StatusOK {
		t.Fatalf("API-key settings status = %d, error %v; body %s", protected.StatusCode(), err, protected.Body)
	}

	badPassword := "wrong-password"
	failedLogin, err := client.REST().LoginWithResponse(context.Background(), httpclient.LoginRequest{Email: fixture.Email, Password: &badPassword})
	if err != nil || failedLogin.StatusCode() != http.StatusUnauthorized || failedLogin.JSON401 == nil || failedLogin.JSON401.Error.Code != httpclient.APIErrorCodeUnauthenticated {
		t.Fatalf("failed login = status %d, error %v, body %s", failedLogin.StatusCode(), err, failedLogin.Body)
	}
	cookie := loginCookie(t, client, fixture.Email, fixture.Password)
	if !cookie.HttpOnly || cookie.Secure || cookie.SameSite != http.SameSiteStrictMode || cookie.Path != "/" || cookie.MaxAge != 180*24*60*60 {
		t.Fatalf("session cookie attributes = %+v", cookie)
	}
	wantExpiry := now.Add(180 * 24 * time.Hour)
	if !cookie.Expires.Equal(wantExpiry) {
		t.Fatalf("session expiry = %s, want %s", cookie.Expires, wantExpiry)
	}
	status, err = client.REST().GetAuthenticationStatusWithResponse(context.Background(), cookieEditor(cookie))
	if err != nil || status.StatusCode() != http.StatusOK || !status.JSON200.Authenticated || status.JSON200.User == nil || status.JSON200.User.Email != fixture.Email {
		t.Fatalf("authenticated status = %+v, status %d, error %v", status.JSON200, status.StatusCode(), err)
	}

	mismatchedOrigin := originEditor("http://attacker.test")
	created, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{Fqn: "Rejected"}, cookieEditor(cookie), mismatchedOrigin)
	assertAuthenticationError(t, err, created.StatusCode(), created.Body, http.StatusForbidden, "forbidden")
	created, err = client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{Fqn: "Accepted"}, cookieEditor(cookie), originEditor("https://mina.test"))
	if err != nil || created.StatusCode() != http.StatusCreated {
		t.Fatalf("same-origin cookie mutation status = %d, error %v; body %s", created.StatusCode(), err, created.Body)
	}

	logout, err := client.REST().LogoutWithResponse(context.Background(), cookieEditor(cookie), mismatchedOrigin)
	assertAuthenticationError(t, err, logout.StatusCode(), logout.Body, http.StatusForbidden, "forbidden")
	if len(logout.HTTPResponse.Cookies()) != 0 {
		t.Fatalf("cross-origin logout set cookies: %+v", logout.HTTPResponse.Cookies())
	}

	logout, err = client.REST().LogoutWithResponse(context.Background(), cookieEditor(cookie))
	if err != nil || logout.StatusCode() != http.StatusNoContent {
		t.Fatalf("logout status = %d, error %v; body %s", logout.StatusCode(), err, logout.Body)
	}
	cleared := responseCookie(t, logout.HTTPResponse)
	if cleared.Value != "" || cleared.MaxAge >= 0 || !cleared.HttpOnly || cleared.Path != "/" || cleared.SameSite != http.SameSiteStrictMode {
		t.Fatalf("cleared session cookie = %+v", cleared)
	}
	status, err = client.REST().GetAuthenticationStatusWithResponse(context.Background(), cookieEditor(cleared))
	if err != nil || status.StatusCode() != http.StatusOK || status.JSON200.Authenticated {
		t.Fatalf("logged-out status = %+v, status %d, error %v", status.JSON200, status.StatusCode(), err)
	}

	clock.Advance(180*24*time.Hour + time.Second)
	status, err = client.REST().GetAuthenticationStatusWithResponse(context.Background(), cookieEditor(cookie))
	if err != nil || status.JSON200.Authenticated {
		t.Fatalf("expired status = %+v, error %v", status.JSON200, err)
	}
	protected, err = client.REST().GetSettingsWithResponse(context.Background(), cookieEditor(cookie))
	assertAuthenticationError(t, err, protected.StatusCode(), protected.Body, http.StatusUnauthorized, "unauthenticated")
}

func TestAuthenticationFailuresDoNotExposeSecrets(t *testing.T) {
	fixture := apptest.NewAuthenticationFixture(t)
	client := newSharedClient(t, apptest.WithAuthenticationFile(fixture.Path))
	secret := "highly-visible-secret"
	response, err := client.REST().LoginWithResponse(context.Background(), httpclient.LoginRequest{Email: fixture.Email, Password: &secret})
	if err != nil || response.StatusCode() != http.StatusUnauthorized {
		t.Fatalf("failed login status = %d, error %v", response.StatusCode(), err)
	}
	protected, err := client.REST().GetSettingsWithResponse(context.Background(), httpclient.BearerTokenEditor(fixture.APIKey))
	if err != nil || protected.StatusCode() != http.StatusOK {
		t.Fatalf("API-key settings status = %d, error %v; body %s", protected.StatusCode(), err, protected.Body)
	}
	for name, output := range map[string]string{
		"login response":   string(response.Body),
		"API-key response": string(protected.Body),
	} {
		if strings.Contains(output, secret) || strings.Contains(output, fixture.APIKey) {
			t.Fatalf("%s exposed an authentication secret: %s", name, output)
		}
	}
}

func loginCookie(t *testing.T, client *apptest.Client, email string, password string) *http.Cookie {
	t.Helper()
	response, err := client.REST().LoginWithResponse(context.Background(), httpclient.LoginRequest{Email: email, Password: &password})
	if err != nil || response.StatusCode() != http.StatusOK || response.JSON200 == nil || !response.JSON200.Authenticated {
		t.Fatalf("login status = %d, error %v; body %s", response.StatusCode(), err, response.Body)
	}
	return responseCookie(t, response.HTTPResponse)
}

func responseCookie(t *testing.T, response *http.Response) *http.Cookie {
	t.Helper()
	cookies := response.Cookies()
	if len(cookies) != 1 {
		t.Fatalf("response cookies = %+v, want one", cookies)
	}
	return cookies[0]
}

func cookieEditor(cookie *http.Cookie) httpclient.RequestEditorFn {
	return func(_ context.Context, request *http.Request) error {
		request.AddCookie(cookie)
		return nil
	}
}

func originEditor(origin string) httpclient.RequestEditorFn {
	return func(_ context.Context, request *http.Request) error {
		request.Header.Set("Origin", origin)
		return nil
	}
}

func assertAuthenticationError(t *testing.T, requestErr error, status int, body []byte, wantStatus int, wantCode string) {
	t.Helper()
	if requestErr != nil {
		t.Fatalf("authentication request: %v", requestErr)
	}
	if status != wantStatus {
		t.Fatalf("authentication status = %d, want %d; body %s", status, wantStatus, body)
	}
	var envelope struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		t.Fatalf("decode authentication error: %v; body %s", err, body)
	}
	if envelope.Error.Code != wantCode {
		t.Fatalf("authentication error code = %q, want %q; body %s", envelope.Error.Code, wantCode, body)
	}
}
