package runtime_test

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestTransactionFilterRecurringDefinition(t *testing.T) {
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(apptest.Timestamp("2024-03-12T12:00:00Z"))))
	refs := createRecurringDefinitionRefs(t, client, "DefinitionFilter")
	definition := createRecurringDefinition(t, client, recurringDefinitionRequest("DefinitionFilter:Daily", refs, "-10", "10", intervalRule(1, "DAY"), "2024-03-10")).JSON201
	other := createRecurringDefinition(t, client, recurringDefinitionRequest("DefinitionFilter:Other", refs, "-10", "10", intervalRule(1, "DAY"), "2024-03-12")).JSON201
	runRecurringCatchUp(t, client)
	filter := fmt.Sprintf("recurring_definition:#%d", definition.RecurringDefinitionId)
	generated := listTransactionsWithDSLFilter(t, client, filter).JSON200.Transactions
	if len(generated) != 3 {
		t.Fatalf("generated = %+v, want three", generated)
	}
	confirmed, err := client.REST().ConfirmExpectedTransactionWithResponse(context.Background(), generated[1].TransactionId, expectedConfirmRequest(*apptest.PostedSettlement(), nil))
	requireNoTransportError(t, "confirm recurring transaction", err)
	if confirmed.StatusCode() != http.StatusOK {
		t.Fatalf("confirm: %s", confirmed.Body)
	}
	confirmed, err = client.REST().ConfirmExpectedTransactionWithResponse(context.Background(), generated[2].TransactionId, expectedConfirmRequest(*apptest.PendingSettlement(), nil))
	requireNoTransportError(t, "confirm recurring transaction to cancel", err)
	if confirmed.StatusCode() != http.StatusOK {
		t.Fatalf("confirm: %s", confirmed.Body)
	}
	cancelled, err := client.REST().CancelTransactionWithResponse(context.Background(), generated[2].TransactionId)
	requireNoTransportError(t, "cancel recurring transaction", err)
	if cancelled.StatusCode() != http.StatusOK {
		t.Fatalf("cancel: %s", cancelled.Body)
	}
	ordinary := client.Scenario().BalancedTransaction(client.Scenario().TransactionRefs())
	otherRows := listTransactionsWithDSLFilter(t, client, fmt.Sprintf("recurring_definition:#%d", other.RecurringDefinitionId)).JSON200.Transactions
	if len(otherRows) != 1 {
		t.Fatalf("other rows = %+v", otherRows)
	}
	for _, scenario := range []struct {
		filter string
		ids    []int64
	}{
		{filter, transactionIDs(generated)},
		{`recurring_definition:"DefinitionFilter:Daily"`, transactionIDs(generated)},
		{`recurring_definition:"DefinitionFilter:Daily" and lifecycle:expected`, []int64{generated[0].TransactionId}},
		{`recurring_definition:"DefinitionFilter:Daily" and lifecycle:active`, []int64{generated[1].TransactionId}},
		{`recurring_definition:"DefinitionFilter:Daily" and lifecycle:cancelled`, []int64{generated[2].TransactionId}},
		{`not recurring_definition:"DefinitionFilter:Daily"`, []int64{otherRows[0].TransactionId, ordinary.TransactionId}},
		{`recurring_definition:"DefinitionFilter:*"`, append([]int64{otherRows[0].TransactionId}, transactionIDs(generated)...)},
		{`recurring_definition:*`, append([]int64{otherRows[0].TransactionId}, transactionIDs(generated)...)},
		{`not recurring_definition:*`, []int64{ordinary.TransactionId}},
		{`recurring_definition:"Missing:*"`, nil},
		{filter + " and lifecycle:expected", []int64{generated[0].TransactionId}},
		{filter + " and lifecycle:active", []int64{generated[1].TransactionId}},
		{filter + " and lifecycle:cancelled", []int64{generated[2].TransactionId}},
		{"not " + filter, []int64{otherRows[0].TransactionId, ordinary.TransactionId}},
		{filter + fmt.Sprintf(" and recurring_definition:#%d", other.RecurringDefinitionId), nil},
		{"recurring_definition:#9223372036854775807", nil},
		{fmt.Sprintf("recurring_definition:#%d or recurring_definition:#%d", definition.RecurringDefinitionId, other.RecurringDefinitionId), append([]int64{otherRows[0].TransactionId}, transactionIDs(generated)...)},
	} {
		t.Run(scenario.filter, func(t *testing.T) {
			assertDSLFilterResult(t, client, scenario.filter, scenario.ids, int64(len(scenario.ids)))
		})
	}
	// Future projections use the same provenance predicate before pagination.
	through := apptest.Date("2024-03-13")
	for _, filter := range []string{filter, `recurring_definition:"DefinitionFilter:Daily"`, `recurring_definition:"DefinitionFilter:Daily:*"`} {
		projected, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{Filter: &filter, AnchorDate: &through, Offset: ptrTo(0)})
		requireNoTransportError(t, "filter recurring projections", err)
		if projected.StatusCode() != http.StatusOK || projected.JSON200.TotalCount != 4 {
			t.Fatalf("projected: %s", projected.Body)
		}
		for _, row := range projected.JSON200.Transactions {
			if row.RecurringDefinitionId == nil || *row.RecurringDefinitionId != definition.RecurringDefinitionId {
				t.Fatalf("wrong projection provenance: %+v", row)
			}
		}
	}
	deleted, err := client.REST().DeleteRecurringDefinitionWithResponse(context.Background(), definition.RecurringDefinitionId)
	requireNoTransportError(t, "cancel definition", err)
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete: %s", deleted.Body)
	}
	assertDSLFilterResult(t, client, filter, transactionIDs(generated), 3)
	assertDSLFilterResult(t, client, `recurring_definition:"DefinitionFilter:*"`, []int64{otherRows[0].TransactionId}, 1)
	inactive := `recurring_definition:"DefinitionFilter:Daily"`
	response, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{Filter: &inactive})
	requireNoTransportError(t, "inactive definition FQN", err)
	if response.StatusCode() != http.StatusBadRequest {
		t.Fatalf("inactive FQN: %s", response.Body)
	}
	// Reusing a cancelled definition's FQN resolves the new active identity.
	reused := createRecurringDefinition(t, client, recurringDefinitionRequest(definition.Fqn, refs, "-10", "10", intervalRule(1, "DAY"), "2024-03-12")).JSON201
	runRecurringCatchUp(t, client)
	reusedRows := listTransactionsWithDSLFilter(t, client, fmt.Sprintf("recurring_definition:#%d", reused.RecurringDefinitionId)).JSON200.Transactions
	assertDSLFilterResult(t, client, inactive, transactionIDs(reusedRows), 1)
	assertDSLFilterResult(t, client, filter, transactionIDs(generated), 3)
	current := getRecurringDefinition(t, client, reused.RecurringDefinitionId).JSON200
	renamed, err := client.REST().ReplaceRecurringDefinitionWithResponse(context.Background(), reused.RecurringDefinitionId, &httpclient.ReplaceRecurringDefinitionParams{IfMatch: current.Etag}, recurringDefinitionReplacementRequest("DefinitionFilter:Renamed", refs, "-10", "10", intervalRule(1, "DAY"), nil))
	requireNoTransportError(t, "rename definition", err)
	if renamed.StatusCode() != http.StatusOK {
		t.Fatalf("rename: %s", renamed.Body)
	}
	assertDSLFilterResult(t, client, `recurring_definition:"DefinitionFilter:Renamed"`, transactionIDs(reusedRows), 1)
}

func TestTransactionFilterRecurringDefinitionValidation(t *testing.T) {
	client := newSharedClient(t)
	for _, expression := range []string{
		"recurring_definition:#0", "recurring_definition:#-1", "recurring_definition:#9223372036854775808", "recurring_definition:#1x", "recurring_definition:#", "recurring_definition:42", "recurring_definition:Subscriptions", `recurring_definition:"#42"`, "recurring_definition=#42",
	} {
		t.Run(expression, func(t *testing.T) {
			response, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{Filter: &expression})
			requireNoTransportError(t, "invalid recurring definition filter", err)
			if response.StatusCode() != http.StatusBadRequest || response.JSON400 == nil || response.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
				t.Fatalf("invalid filter: %d %s", response.StatusCode(), response.Body)
			}
		})
	}
}

func TestTransactionFilterRecurringDefinitionHumanReferences(t *testing.T) {
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(apptest.Timestamp("2024-03-12T12:00:00Z"))))
	refs := createRecurringDefinitionRefs(t, client, "HumanDefinitionFilter")
	longFQN := "Long:" + strings.Repeat("name", 1100)
	for _, scenario := range []struct{ fqn, filter string }{
		{"#42", `recurring_definition:"#42"`},
		{"Literal:*", `recurring_definition:"Literal:\*"`},
		{longFQN, fmt.Sprintf("recurring_definition:%q", longFQN)},
	} {
		t.Run(scenario.fqn[:min(len(scenario.fqn), 30)], func(t *testing.T) {
			definition := createRecurringDefinition(t, client, recurringDefinitionRequest(scenario.fqn, refs, "-10", "10", intervalRule(1, "DAY"), "2024-03-12")).JSON201
			runRecurringCatchUp(t, client)
			rows := listTransactionsWithDSLFilter(t, client, fmt.Sprintf("recurring_definition:#%d", definition.RecurringDefinitionId)).JSON200.Transactions
			assertDSLFilterResult(t, client, scenario.filter, transactionIDs(rows), 1)
		})
	}
}
