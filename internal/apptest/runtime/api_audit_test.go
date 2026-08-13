package runtime_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestAPIAuditCapturesMatchedMutationsAndExcludesReads(t *testing.T) {
	clock := apptest.NewFakeClock(time.Date(2026, 8, 13, 12, 0, 0, 0, time.UTC))
	client := newSharedClient(t, apptest.WithClock(clock))

	created, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{Fqn: "Audit:Captured"})
	requireNoTransportError(t, "create audited tag", err)
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create audited tag status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}

	entries := listAPIAuditEntries(t, client, nil)
	if entries.TotalCount != 1 || len(entries.Entries) != 1 {
		t.Fatalf("audit entries after mutation = %+v, want one", entries)
	}
	entry := entries.Entries[0]
	if entry.OperationId != "createTag" || entry.Method != http.MethodPost || entry.RequestUri != "/api/tags" || entry.ResponseStatus != http.StatusCreated || entry.ClientSurface != httpclient.Rest {
		t.Fatalf("audited create metadata = %+v", entry)
	}
	if !entry.OccurredAt.Equal(clock.Now()) || entry.DurationMicroseconds != 0 {
		t.Fatalf("audited create timing = %s / %d", entry.OccurredAt, entry.DurationMicroseconds)
	}
	assertAuditJSONField(t, entry.RequestJson, "fqn", "Audit:Captured")
	assertAuditJSONField(t, entry.ResponseJson, "fqn", "Audit:Captured")

	read, err := client.REST().GetTagWithResponse(context.Background(), created.JSON201.TagId, nil)
	requireNoTransportError(t, "read tag", err)
	if read.StatusCode() != http.StatusOK {
		t.Fatalf("read tag status = %d, want %d; body %s", read.StatusCode(), http.StatusOK, read.Body)
	}
	entries = listAPIAuditEntries(t, client, nil)
	if entries.TotalCount != 1 {
		t.Fatalf("audit count after GET = %d, want 1", entries.TotalCount)
	}

	unmatched, err := client.REST().CreateTagWithResponse(
		context.Background(),
		httpclient.CreateTagRequest{Fqn: "Audit:Unmatched"},
		func(_ context.Context, request *http.Request) error {
			request.URL.Path = "/api/unknown"
			return nil
		},
	)
	requireNoTransportError(t, "send unmatched mutation", err)
	if unmatched.StatusCode() != http.StatusNotFound {
		t.Fatalf("unmatched mutation status = %d, want %d; body %s", unmatched.StatusCode(), http.StatusNotFound, unmatched.Body)
	}
	entries = listAPIAuditEntries(t, client, nil)
	if entries.TotalCount != 1 {
		t.Fatalf("audit count after unmatched mutation = %d, want 1", entries.TotalCount)
	}

	invalid, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{Fqn: ""})
	requireNoTransportError(t, "create invalid tag", err)
	if invalid.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid create status = %d, want %d; body %s", invalid.StatusCode(), http.StatusBadRequest, invalid.Body)
	}
	entries = listAPIAuditEntries(t, client, &httpclient.ListAPIAuditEntriesParams{OperationId: apptest.StringPtr("createTag")})
	if entries.TotalCount != 2 || entries.Entries[0].ResponseStatus != http.StatusBadRequest {
		t.Fatalf("audited invalid mutation = %+v", entries)
	}
	assertAuditJSONField(t, entries.Entries[0].RequestJson, "fqn", "")
	assertAuditJSONField(t, entries.Entries[0].ResponseJson, "error", map[string]any{"code": "invalid_request", "message": "fqn must be non-empty without leading or trailing whitespace"})
}

func TestAPIAuditCapturesPutPatchAndDeleteOperations(t *testing.T) {
	client := apptest.New(t)

	member, err := client.REST().CreateMemberWithResponse(context.Background(), httpclient.CreateMemberRequest{Name: "Audit Member"})
	requireNoTransportError(t, "create member for PUT audit", err)
	if member.StatusCode() != http.StatusCreated {
		t.Fatalf("create member for PUT audit status = %d, want %d; body %s", member.StatusCode(), http.StatusCreated, member.Body)
	}
	hiddenMember, err := client.REST().UpdateMemberHiddenWithResponse(context.Background(), member.JSON201.MemberId, httpclient.UpdateMemberHiddenRequest{IsHidden: true})
	requireNoTransportError(t, "hide member for PUT audit", err)
	if hiddenMember.StatusCode() != http.StatusOK {
		t.Fatalf("hide member for PUT audit status = %d, want %d; body %s", hiddenMember.StatusCode(), http.StatusOK, hiddenMember.Body)
	}

	tag, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{Fqn: "Audit:Methods"})
	requireNoTransportError(t, "create tag for PATCH and DELETE audit", err)
	if tag.StatusCode() != http.StatusCreated {
		t.Fatalf("create tag for PATCH and DELETE audit status = %d, want %d; body %s", tag.StatusCode(), http.StatusCreated, tag.Body)
	}
	hidden := true
	updatedTag, err := client.REST().UpdateTagWithResponse(context.Background(), tag.JSON201.TagId, httpclient.UpdateTagRequest{IsHidden: &hidden})
	requireNoTransportError(t, "update tag for PATCH audit", err)
	if updatedTag.StatusCode() != http.StatusOK {
		t.Fatalf("update tag for PATCH audit status = %d, want %d; body %s", updatedTag.StatusCode(), http.StatusOK, updatedTag.Body)
	}
	deletedTag, err := client.REST().DeleteTagWithResponse(context.Background(), tag.JSON201.TagId)
	requireNoTransportError(t, "delete tag for DELETE audit", err)
	if deletedTag.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete tag for DELETE audit status = %d, want %d; body %s", deletedTag.StatusCode(), http.StatusNoContent, deletedTag.Body)
	}

	for _, expected := range []struct {
		operationID string
		method      string
		status      int
	}{
		{operationID: "updateMemberHidden", method: http.MethodPut, status: http.StatusOK},
		{operationID: "updateTag", method: http.MethodPatch, status: http.StatusOK},
		{operationID: "deleteTag", method: http.MethodDelete, status: http.StatusNoContent},
	} {
		entries := listAPIAuditEntries(t, client, &httpclient.ListAPIAuditEntriesParams{OperationId: &expected.operationID})
		if entries.TotalCount != 1 || len(entries.Entries) != 1 {
			t.Fatalf("%s audit entries = %+v, want one", expected.operationID, entries)
		}
		entry := entries.Entries[0]
		if entry.Method != expected.method || entry.ResponseStatus != expected.status {
			t.Fatalf("%s audit metadata = %+v, want method %s and status %d", expected.operationID, entry, expected.method, expected.status)
		}
	}
}

func TestAPIAuditListsRejectedNonObjectJSON(t *testing.T) {
	client := apptest.New(t)

	response, err := client.REST().CreateTagWithResponse(
		context.Background(),
		httpclient.CreateTagJSONRequestBody{},
		func(_ context.Context, request *http.Request) error {
			request.Body = io.NopCloser(strings.NewReader("[]"))
			request.ContentLength = 2
			return nil
		},
	)
	requireNoTransportError(t, "create tag with array body", err)
	if response.StatusCode() != http.StatusBadRequest {
		t.Fatalf("create tag with array body status = %d, want %d; body %s", response.StatusCode(), http.StatusBadRequest, response.Body)
	}

	entries := listAPIAuditEntries(t, client, &httpclient.ListAPIAuditEntriesParams{OperationId: apptest.StringPtr("createTag")})
	if len(entries.Entries) != 1 {
		t.Fatalf("createTag audit entries = %d, want 1", len(entries.Entries))
	}
	requestJSON, err := json.Marshal(entries.Entries[0].RequestJson)
	if err != nil {
		t.Fatalf("marshal request audit JSON: %v", err)
	}
	if string(requestJSON) != "[]" {
		t.Fatalf("request audit JSON = %s, want []", requestJSON)
	}
}

func TestAPIAuditDistinguishesPresentJSONNullFromMissingBodies(t *testing.T) {
	client := apptest.New(t)

	response, err := client.REST().CreateTagWithResponse(
		context.Background(),
		httpclient.CreateTagJSONRequestBody{},
		func(_ context.Context, request *http.Request) error {
			request.Body = io.NopCloser(strings.NewReader("null"))
			request.ContentLength = 4
			return nil
		},
	)
	requireNoTransportError(t, "create tag with null body", err)
	if response.StatusCode() != http.StatusBadRequest {
		t.Fatalf("create tag with null body status = %d, want %d; body %s", response.StatusCode(), http.StatusBadRequest, response.Body)
	}

	entries := listAPIAuditEntries(t, client, &httpclient.ListAPIAuditEntriesParams{OperationId: apptest.StringPtr("createTag")})
	if len(entries.Entries) != 1 {
		t.Fatalf("createTag audit entries = %d, want 1", len(entries.Entries))
	}
	entry := entries.Entries[0]
	if !entry.RequestJsonPresent || entry.RequestJson != nil {
		t.Fatalf("request JSON presence/value = %t / %#v, want present JSON null", entry.RequestJsonPresent, entry.RequestJson)
	}
	if !entry.ResponseJsonPresent {
		t.Fatal("response JSON marked missing, want captured error body")
	}
}

func TestAPIAuditPreservesLargeJSONIntegers(t *testing.T) {
	client := apptest.New(t)
	const largeInteger = "9007199254740993"

	response, err := client.REST().CreateTagWithResponse(
		context.Background(),
		httpclient.CreateTagJSONRequestBody{},
		func(_ context.Context, request *http.Request) error {
			body := `{"fqn":"LargeInteger","extra":` + largeInteger + `}`
			request.Body = io.NopCloser(strings.NewReader(body))
			request.ContentLength = int64(len(body))
			return nil
		},
	)
	requireNoTransportError(t, "create tag with large integer", err)
	if response.StatusCode() != http.StatusBadRequest {
		t.Fatalf("create tag with large integer status = %d, want %d; body %s", response.StatusCode(), http.StatusBadRequest, response.Body)
	}

	operation := "createTag"
	listed, err := client.REST().ListAPIAuditEntriesWithResponse(context.Background(), &httpclient.ListAPIAuditEntriesParams{OperationId: &operation})
	requireNoTransportError(t, "list large-integer audit entry", err)
	if listed.StatusCode() != http.StatusOK {
		t.Fatalf("list large-integer audit entry status = %d, want %d; body %s", listed.StatusCode(), http.StatusOK, listed.Body)
	}
	if !strings.Contains(string(listed.Body), `"extra":`+largeInteger) {
		t.Fatalf("listed audit JSON lost integer precision: %s", listed.Body)
	}
}

func TestAPIAuditCapturesSupportedRequestBodiesLargerThanOneMiB(t *testing.T) {
	client := apptest.New(t)
	name := strings.Repeat("x", (1<<20)+1)

	created, err := client.REST().CreateMemberWithResponse(context.Background(), httpclient.CreateMemberRequest{Name: name})
	requireNoTransportError(t, "create member with large supported body", err)
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create member with large supported body status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}

	operation := "createMember"
	entries := listAPIAuditEntries(t, client, &httpclient.ListAPIAuditEntriesParams{OperationId: &operation})
	if entries.TotalCount != 1 || len(entries.Entries) != 1 || !entries.Entries[0].RequestJsonPresent {
		t.Fatalf("large-body audit entries = %+v, want one captured request", entries)
	}
	requestJSON := auditJSONMap(t, entries.Entries[0].RequestJson)
	if got, ok := requestJSON["name"].(string); !ok || got != name {
		t.Fatalf("large-body audit name length = %d / type %T, want %d", len(got), requestJSON["name"], len(name))
	}
}

func TestAPIRejectsRequestBodiesLargerThanSixteenMiBClearly(t *testing.T) {
	client := apptest.New(t)
	name := strings.Repeat("x", 16<<20)

	created, err := client.REST().CreateMemberWithResponse(context.Background(), httpclient.CreateMemberRequest{Name: name})
	requireNoTransportError(t, "reject oversized request body", err)
	if created.StatusCode() != http.StatusUnauthorized || created.JSON401 == nil {
		t.Fatalf("oversized request status = %d, want %d response; body %s", created.StatusCode(), http.StatusUnauthorized, created.Body)
	}
	if created.JSON401.Error.Code != httpclient.APIErrorCodeInvalidRequest || created.JSON401.Error.Message != "request body exceeds 16 MiB limit" {
		t.Fatalf("oversized request error = %+v, want clear body-limit error", created.JSON401.Error)
	}
}

func TestAPIAuditValidatesSurfaceAndSupportsPagingAndFilters(t *testing.T) {
	client := newSharedClient(t)

	for _, testCase := range []struct {
		fqn     string
		surface string
		want    httpclient.APIAuditClientSurface
	}{
		{fqn: "Surface:Web", surface: "web-ui", want: httpclient.WebUi},
		{fqn: "Surface:CLI", surface: "cli", want: httpclient.Cli},
		{fqn: "Surface:MCP", surface: "mcp", want: httpclient.Mcp},
	} {
		response, err := client.REST().CreateTagWithResponse(
			context.Background(),
			httpclient.CreateTagRequest{Fqn: testCase.fqn},
			headerEditor("X-Mina-Client-Surface", testCase.surface),
		)
		requireNoTransportError(t, "create surface-attributed tag", err)
		if response.StatusCode() != http.StatusCreated {
			t.Fatalf("create %s tag status = %d, want %d; body %s", testCase.surface, response.StatusCode(), http.StatusCreated, response.Body)
		}
		entries := listAPIAuditEntries(t, client, &httpclient.ListAPIAuditEntriesParams{
			OperationId:   apptest.StringPtr("createTag"),
			ClientSurface: &testCase.want,
		})
		if entries.TotalCount != 1 || len(entries.Entries) != 1 || entries.Entries[0].ClientSurface != testCase.want {
			t.Fatalf("%s audit entries = %+v, want one %s entry", testCase.surface, entries, testCase.want)
		}
		assertAuditJSONField(t, entries.Entries[0].RequestJson, "fqn", testCase.fqn)
	}

	invalid, err := client.REST().CreateTagWithResponse(
		context.Background(),
		httpclient.CreateTagRequest{Fqn: "Surface:Invalid"},
		headerEditor("X-Mina-Client-Surface", "rest"),
	)
	requireNoTransportError(t, "create invalid-surface tag", err)
	if invalid.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid surface status = %d, want %d; body %s", invalid.StatusCode(), http.StatusBadRequest, invalid.Body)
	}

	limit := 1
	offset := 1
	surface := httpclient.Cli
	page := listAPIAuditEntries(t, client, &httpclient.ListAPIAuditEntriesParams{
		OperationId:   apptest.StringPtr("createTag"),
		ClientSurface: &surface,
		Limit:         &limit,
		Offset:        &offset,
	})
	if page.TotalCount != 1 || len(page.Entries) != 0 {
		t.Fatalf("filtered second page = %+v, want total 1 and empty page", page)
	}

	method := http.MethodPost
	page = listAPIAuditEntries(t, client, &httpclient.ListAPIAuditEntriesParams{Method: &method, Limit: &limit})
	if page.TotalCount != 4 || len(page.Entries) != 1 || page.Entries[0].ClientSurface != httpclient.Rest || page.Entries[0].ResponseStatus != http.StatusBadRequest {
		t.Fatalf("newest filtered page = %+v", page)
	}
	assertAuditJSONField(t, page.Entries[0].RequestJson, "fqn", "Surface:Invalid")
}

func TestAPIAuditRedactsOnlyLoginPasswordAndRetainsOutcomeJSON(t *testing.T) {
	fixture := apptest.NewAuthenticationFixture(t)
	client := newSharedClient(t, apptest.WithAuthenticationFile(fixture.Path))
	password := fixture.Password
	login, err := client.REST().LoginWithResponse(
		context.Background(),
		httpclient.LoginRequest{Email: fixture.Email, Password: &password},
		httpclient.BearerTokenEditor(fixture.APIKey),
	)
	requireNoTransportError(t, "login for audit", err)
	if login.StatusCode() != http.StatusOK {
		t.Fatalf("login status = %d, want %d; body %s", login.StatusCode(), http.StatusOK, login.Body)
	}
	cookie := responseCookie(t, login.HTTPResponse)

	wrongPassword := "visible-only-in-request"
	failed, err := client.REST().LoginWithResponse(context.Background(), httpclient.LoginRequest{Email: fixture.Email, Password: &wrongPassword})
	requireNoTransportError(t, "failed login for audit", err)
	if failed.StatusCode() != http.StatusUnauthorized {
		t.Fatalf("failed login status = %d, want %d; body %s", failed.StatusCode(), http.StatusUnauthorized, failed.Body)
	}

	operation := "login"
	entries := listAPIAuditEntriesWithEditor(t, client, &httpclient.ListAPIAuditEntriesParams{OperationId: &operation}, cookieEditor(cookie))
	if entries.TotalCount != 2 || len(entries.Entries) != 2 {
		t.Fatalf("login audit entries = %+v, want two", entries)
	}
	for _, entry := range entries.Entries {
		requestJSON := auditJSONMap(t, entry.RequestJson)
		if requestJSON["email"] != fixture.Email {
			t.Fatalf("login audit email = %v, want %q", requestJSON["email"], fixture.Email)
		}
		if _, exists := requestJSON["password"]; exists {
			t.Fatalf("login audit retained password: %+v", requestJSON)
		}
		encoded, err := json.Marshal(entry)
		if err != nil {
			t.Fatalf("encode login audit entry: %v", err)
		}
		for _, secret := range []string{fixture.Password, wrongPassword, fixture.APIKey, cookie.Value, "Authorization", "Set-Cookie"} {
			if secret != "" && strings.Contains(string(encoded), secret) {
				t.Fatalf("login audit entry retained secret or header %q: %s", secret, encoded)
			}
		}
	}
	if entries.Entries[0].ResponseStatus != http.StatusUnauthorized {
		t.Fatalf("latest login outcome = %+v, want unauthorized", entries.Entries[0])
	}
	assertAuditJSONField(t, entries.Entries[0].ResponseJson, "error", map[string]any{"code": "unauthenticated", "message": "invalid email or password"})
	assertAuditJSONField(t, entries.Entries[1].ResponseJson, "authenticated", true)
}

func TestAPIAuditCapturesAuthenticationAndOriginRejections(t *testing.T) {
	fixture := apptest.NewAuthenticationFixture(t)
	client := newSharedClient(t, apptest.WithAuthenticationFile(fixture.Path))

	unauthenticated, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{Fqn: "Audit:Unauthenticated"})
	requireNoTransportError(t, "create unauthenticated tag", err)
	if unauthenticated.StatusCode() != http.StatusUnauthorized {
		t.Fatalf("unauthenticated tag status = %d, want %d; body %s", unauthenticated.StatusCode(), http.StatusUnauthorized, unauthenticated.Body)
	}

	password := fixture.Password
	login, err := client.REST().LoginWithResponse(context.Background(), httpclient.LoginRequest{Email: fixture.Email, Password: &password})
	requireNoTransportError(t, "login for rejected audit requests", err)
	if login.StatusCode() != http.StatusOK {
		t.Fatalf("login status = %d, want %d; body %s", login.StatusCode(), http.StatusOK, login.Body)
	}
	cookie := responseCookie(t, login.HTTPResponse)

	forbidden, err := client.REST().CreateTagWithResponse(
		context.Background(),
		httpclient.CreateTagRequest{Fqn: "Audit:Forbidden"},
		cookieEditor(cookie),
		originEditor("http://attacker.test"),
	)
	requireNoTransportError(t, "create cross-origin tag", err)
	if forbidden.StatusCode() != http.StatusForbidden {
		t.Fatalf("cross-origin tag status = %d, want %d; body %s", forbidden.StatusCode(), http.StatusForbidden, forbidden.Body)
	}

	operation := "createTag"
	entries := listAPIAuditEntriesWithEditor(t, client, &httpclient.ListAPIAuditEntriesParams{OperationId: &operation}, cookieEditor(cookie))
	if entries.TotalCount != 2 || len(entries.Entries) != 2 {
		t.Fatalf("rejected createTag audit entries = %+v, want two", entries)
	}
	if entries.Entries[0].ResponseStatus != http.StatusForbidden || entries.Entries[1].ResponseStatus != http.StatusUnauthorized {
		t.Fatalf("rejected createTag statuses = %d, %d; want %d, %d", entries.Entries[0].ResponseStatus, entries.Entries[1].ResponseStatus, http.StatusForbidden, http.StatusUnauthorized)
	}
	assertAuditJSONField(t, entries.Entries[0].RequestJson, "fqn", "Audit:Forbidden")
	assertAuditJSONField(t, entries.Entries[1].RequestJson, "fqn", "Audit:Unauthenticated")
}

func TestAPIAuditDoesNotDelayAuthenticationRejectionWhileFinishingBody(t *testing.T) {
	fixture := apptest.NewAuthenticationFixture(t)
	client := newSharedClient(t, apptest.WithAuthenticationFile(fixture.Path))
	unblock := make(chan struct{})
	type result struct {
		response *httpclient.CreateTagResponse
		err      error
	}
	completed := make(chan result, 1)

	go func() {
		response, err := client.REST().CreateTagWithResponse(
			context.Background(),
			httpclient.CreateTagJSONRequestBody{},
			func(_ context.Context, request *http.Request) error {
				request.Body = blockingRequestBody{unblock: unblock}
				request.ContentLength = -1
				return nil
			},
		)
		completed <- result{response: response, err: err}
	}()

	select {
	case got := <-completed:
		close(unblock)
		requireNoTransportError(t, "create unauthenticated tag without reading body", got.err)
		if got.response.StatusCode() != http.StatusUnauthorized {
			t.Fatalf("unauthenticated tag status = %d, want %d; body %s", got.response.StatusCode(), http.StatusUnauthorized, got.response.Body)
		}
	case <-time.After(250 * time.Millisecond):
		close(unblock)
		<-completed
		t.Fatal("unauthenticated request read its body before returning")
	}
}

func TestAPIAuditPersistsAcrossDatabaseReopen(t *testing.T) {
	databasePath := filepath.Join(t.TempDir(), "mina.duckdb")
	client := newSharedClient(t, apptest.WithDatabasePath(databasePath))

	created, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{Fqn: "Audit:Reopen"})
	requireNoTransportError(t, "create audit entry before reopen", err)
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create audit entry before reopen status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	client.Close()

	reopened := newSharedClient(t, apptest.WithDatabasePath(databasePath))
	operation := "createTag"
	entries := listAPIAuditEntries(t, reopened, &httpclient.ListAPIAuditEntriesParams{OperationId: &operation})
	if entries.TotalCount != 1 || len(entries.Entries) != 1 {
		t.Fatalf("reopened audit entries = %+v, want one", entries)
	}
	assertAuditJSONField(t, entries.Entries[0].RequestJson, "fqn", "Audit:Reopen")
}

func TestMigrationV14AddsEmptyAuditHistoryAndPreservesHouseholdData(t *testing.T) {
	client := apptest.NewFromMigrationFixture(t, 14)

	tags, err := client.REST().ListTagsWithResponse(context.Background(), &httpclient.ListTagsParams{})
	requireNoTransportError(t, "list migrated tags", err)
	if tags.StatusCode() != http.StatusOK {
		t.Fatalf("list migrated tags status = %d, want %d; body %s", tags.StatusCode(), http.StatusOK, tags.Body)
	}
	found := false
	for _, tag := range tags.JSON200.Tags {
		found = found || tag.Fqn == "AuditFixture"
	}
	if !found {
		t.Fatalf("migrated tags = %+v, want AuditFixture", tags.JSON200.Tags)
	}

	entries := listAPIAuditEntries(t, client, nil)
	if entries.TotalCount != 0 || len(entries.Entries) != 0 {
		t.Fatalf("migrated audit entries = %+v, want empty", entries)
	}
}

func listAPIAuditEntries(t *testing.T, client *apptest.Client, params *httpclient.ListAPIAuditEntriesParams) *httpclient.APIAuditEntryListResponse {
	t.Helper()

	return listAPIAuditEntriesWithEditor(t, client, params)
}

func listAPIAuditEntriesWithEditor(t *testing.T, client *apptest.Client, params *httpclient.ListAPIAuditEntriesParams, editors ...httpclient.RequestEditorFn) *httpclient.APIAuditEntryListResponse {
	t.Helper()
	response, err := client.REST().ListAPIAuditEntriesWithResponse(context.Background(), params, editors...)
	requireNoTransportError(t, "list API audit entries", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("list API audit entries status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}

	return response.JSON200
}

func headerEditor(name string, value string) httpclient.RequestEditorFn {
	return func(_ context.Context, request *http.Request) error {
		request.Header.Set(name, value)
		return nil
	}
}

type blockingRequestBody struct {
	unblock <-chan struct{}
}

func (b blockingRequestBody) Read([]byte) (int, error) {
	<-b.unblock
	return 0, io.EOF
}

func (blockingRequestBody) Close() error {
	return nil
}

func auditJSONMap(t *testing.T, value any) map[string]any {
	t.Helper()
	object, ok := value.(map[string]any)
	if !ok {
		t.Fatalf("audit JSON = %#v, want object", value)
	}

	return object
}

func assertAuditJSONField(t *testing.T, value any, field string, want any) {
	t.Helper()
	object := auditJSONMap(t, value)
	got, ok := object[field]
	if !ok {
		t.Fatalf("audit JSON = %+v, want field %q", object, field)
	}
	gotJSON, _ := json.Marshal(got)
	wantJSON, _ := json.Marshal(want)
	if string(gotJSON) != string(wantJSON) {
		t.Fatalf("audit JSON field %q = %s, want %s", field, gotJSON, wantJSON)
	}
}
