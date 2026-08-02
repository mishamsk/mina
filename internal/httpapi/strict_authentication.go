package httpapi

import (
	"context"
	"errors"

	"github.com/mishamsk/mina/internal/httpapi/openapi"
	authentication "github.com/mishamsk/mina/internal/services/authentication/online"
)

func (s *strictServer) Login(ctx context.Context, request openapi.LoginRequestObject) (openapi.LoginResponseObject, error) {
	if s.deps.Authentication == nil {
		return openapi.Login401JSONResponse{UnauthenticatedJSONResponse: unauthenticatedResponse("authentication is disabled")}, nil
	}
	password := []byte(*request.Body.Password)
	identity, err := s.deps.Authentication.AuthenticatePassword(ctx, request.Body.Email, password)
	clear(password)
	*request.Body.Password = ""
	if errors.Is(err, authentication.ErrInvalidCredential) {
		return openapi.Login401JSONResponse{UnauthenticatedJSONResponse: unauthenticatedResponse("invalid email or password")}, nil
	}
	if err != nil {
		return nil, err
	}
	now := s.deps.clock().Now()
	session, err := s.deps.Authentication.IssueSession(identity, now)
	if err != nil {
		return nil, err
	}
	cookie := sessionCookie(session, now).String()
	return openapi.Login200JSONResponse{
		Body: openapi.AuthenticationStatusResponse{
			Enabled: true, Authenticated: true,
			User: &openapi.AuthenticationUser{UserId: identity.UserID, Email: identity.Email},
		},
		Headers: openapi.Login200ResponseHeaders{SetCookie: &cookie},
	}, nil
}

func (s *strictServer) Logout(context.Context, openapi.LogoutRequestObject) (openapi.LogoutResponseObject, error) {
	cookie := clearedSessionCookie().String()
	return openapi.Logout204Response{Headers: openapi.Logout204ResponseHeaders{SetCookie: &cookie}}, nil
}

func (s *strictServer) GetAuthenticationStatus(ctx context.Context, _ openapi.GetAuthenticationStatusRequestObject) (openapi.GetAuthenticationStatusResponseObject, error) {
	request, err := requestFromContext(ctx)
	if err != nil {
		return nil, err
	}
	return openapi.GetAuthenticationStatus200JSONResponse(authenticationStatus(s.deps.Authentication, request, s.deps.clock().Now())), nil
}

func unauthenticatedResponse(message string) openapi.UnauthenticatedJSONResponse {
	return openapi.UnauthenticatedJSONResponse{
		Error: openapi.APIError{Code: openapi.APIErrorCodeUnauthenticated, Message: message},
	}
}
