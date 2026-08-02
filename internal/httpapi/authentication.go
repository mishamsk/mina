package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/getkin/kin-openapi/routers"

	"github.com/mishamsk/mina/internal/httpapi/openapi"
	authentication "github.com/mishamsk/mina/internal/services/authentication/online"
)

const (
	sessionCookieName      = "mina_session"
	unauthenticatedMessage = "authentication required"
)

type authenticationKind uint8

const (
	authenticationAPIKey authenticationKind = iota + 1
	authenticationSession
)

// ProtectREST enforces configured credentials on external protected REST routes.
func ProtectREST(service *authentication.Service, clock Clock, next http.Handler) http.Handler {
	if service == nil {
		return next
	}
	if clock == nil {
		clock = systemClock{}
	}
	openAPIRouter := mustOpenAPIRouter(mustOpenAPIValidationSpec())
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		public, logout := restRoutePolicy(openAPIRouter, r)
		if logout && unsafeMethod(r.Method) && !validMutationOrigin(r) {
			WriteAPIError(w, http.StatusForbidden, openapi.APIErrorCodeForbidden, "request origin does not match Mina")
			return
		}
		if public {
			next.ServeHTTP(w, r)
			return
		}
		kind, ok := authenticateRESTRequest(service, r, clock.Now())
		if !ok {
			writeUnauthenticated(w)
			return
		}
		if kind == authenticationSession && unsafeMethod(r.Method) && !validMutationOrigin(r) {
			WriteAPIError(w, http.StatusForbidden, openapi.APIErrorCodeForbidden, "cookie-authenticated request origin does not match Mina")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ProtectMCP requires an API key on the external MCP endpoint.
func ProtectMCP(service *authentication.Service, next http.Handler) http.Handler {
	if service == nil {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, ok := bearerToken(r)
		if !ok {
			writeUnauthenticated(w)
			return
		}
		if err := service.VerifyAPIKey(token); err != nil {
			writeUnauthenticated(w)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func restRoutePolicy(router routers.Router, request *http.Request) (public bool, logout bool) {
	// OpenAPI discovery is the adapter's only route outside generated registration.
	if request.Method == http.MethodGet && request.URL.Path == "/api/openapi.json" {
		return true, false
	}

	route, _, err := router.FindRoute(request)
	if err != nil || route.Operation == nil {
		return false, false
	}
	logout = route.Operation.OperationID == "logout"

	security := route.Operation.Security
	if security == nil {
		security = &route.Spec.Security
	}
	if len(*security) == 0 {
		return true, logout
	}
	for _, requirement := range *security {
		if len(requirement) == 0 {
			return true, logout
		}
	}

	return false, logout
}

func authenticateRESTRequest(service *authentication.Service, r *http.Request, now time.Time) (authenticationKind, bool) {
	if len(r.Header.Values("Authorization")) > 0 {
		token, ok := bearerToken(r)
		if !ok {
			return 0, false
		}
		if err := service.VerifyAPIKey(token); err != nil {
			return 0, false
		}
		return authenticationAPIKey, true
	}
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		return 0, false
	}
	_, err = service.VerifySession(cookie.Value, now)
	if err != nil {
		return 0, false
	}
	return authenticationSession, true
}

func bearerToken(r *http.Request) (string, bool) {
	values := r.Header.Values("Authorization")
	if len(values) != 1 {
		return "", false
	}
	scheme, token, found := strings.Cut(strings.TrimSpace(values[0]), " ")
	if !found || !strings.EqualFold(scheme, "Bearer") || token == "" || strings.ContainsAny(token, " \t\r\n") {
		return "", false
	}
	return token, true
}

func unsafeMethod(method string) bool {
	return method != http.MethodGet && method != http.MethodHead && method != http.MethodOptions
}

func validMutationOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	parsed, err := url.Parse(origin)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || parsed.User != nil || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return false
	}
	return strings.EqualFold(parsed.Host, r.Host)
}

func writeUnauthenticated(w http.ResponseWriter) {
	w.Header().Set("WWW-Authenticate", "Bearer")
	WriteAPIError(w, http.StatusUnauthorized, openapi.APIErrorCodeUnauthenticated, unauthenticatedMessage)
}

func sessionCookie(session authentication.IssuedSession, now time.Time) *http.Cookie {
	return &http.Cookie{
		Name: sessionCookieName, Value: session.Token, Path: "/", HttpOnly: true,
		SameSite: http.SameSiteStrictMode, Expires: session.ExpiresAt, MaxAge: int(session.ExpiresAt.Sub(now).Seconds()),
	}
}

func clearedSessionCookie() *http.Cookie {
	return &http.Cookie{
		Name: sessionCookieName, Value: "", Path: "/", HttpOnly: true,
		SameSite: http.SameSiteStrictMode, Expires: time.Unix(1, 0), MaxAge: -1,
	}
}

func authenticationStatus(service *authentication.Service, r *http.Request, now time.Time) openapi.AuthenticationStatusResponse {
	if service == nil {
		return openapi.AuthenticationStatusResponse{Enabled: false, Authenticated: false}
	}
	status := openapi.AuthenticationStatusResponse{Enabled: true, Authenticated: false}
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		return status
	}
	identity, err := service.VerifySession(cookie.Value, now)
	if err != nil {
		return status
	}
	status.Authenticated = true
	status.User = &openapi.AuthenticationUser{UserId: identity.UserID, Email: identity.Email}
	return status
}

func requestFromContext(ctx context.Context) (*http.Request, error) {
	request, ok := ctx.Value(httpRequestContextKey{}).(*http.Request)
	if !ok || request == nil {
		return nil, errors.New("HTTP request context is unavailable")
	}
	return request, nil
}

type httpRequestContextKey struct{}

func withHTTPRequest(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), httpRequestContextKey{}, r)))
	})
}
