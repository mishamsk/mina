package runtime_test

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestAccountGroupStatesDeriveHiddenState(t *testing.T) {
	client := newSharedClient(t)

	createAccountForGroupState(t, client, "groupstate:Accounts:Bank:Checking", false)
	createAccountForGroupState(t, client, "groupstate:Accounts:Bank:Savings", true)
	createAccountForGroupState(t, client, "groupstate:Accounts:Cash:Wallet", false)
	createAccountForGroupState(t, client, "groupstate:Accounts:Hidden:Leaf", true)
	tombstoned := createAccountForGroupState(t, client, "groupstate:Accounts:OnlyTombstone:Leaf", true)
	deleteAccount(t, client, tombstoned.AccountId)

	defaultGroups := listAccountGroups(t, client, false)
	assertAccountGroupState(t, defaultGroups, "groupstate:Accounts:Bank", stringPtr("groupstate:Accounts"), 2, false)
	assertAccountGroupMissing(t, defaultGroups, "groupstate:Accounts:Hidden")

	omittedParamGroups := listAccountGroupsDefault(t, client)
	assertAccountGroupMissing(t, omittedParamGroups, "groupstate:Accounts:Hidden")

	withHidden := listAccountGroups(t, client, true)
	assertAccountGroupState(t, withHidden, "groupstate:Accounts:Hidden", stringPtr("groupstate:Accounts"), 2, true)
	assertAccountGroupMissing(t, withHidden, "groupstate:Accounts:OnlyTombstone")
}

func TestAccountGroupStatesReturnDeterministicFQNOrder(t *testing.T) {
	client := newSharedClient(t)

	createAccountForGroupState(t, client, "groupstate:Ordering:Beta:Leaf", false)
	createAccountForGroupState(t, client, "groupstate:Ordering:Alpha:Nested:Leaf", false)
	createAccountForGroupState(t, client, "groupstate:Ordering:Alpha:Leaf", false)

	got := accountGroupFQNsAtOrUnder(listAccountGroups(t, client, false), "groupstate:Ordering")
	want := []string{
		"groupstate:Ordering",
		"groupstate:Ordering:Alpha",
		"groupstate:Ordering:Alpha:Nested",
		"groupstate:Ordering:Beta",
	}
	assertStringSlice(t, got, want)
}

func TestAccountListReportsDeleteability(t *testing.T) {
	client := newSharedClient(t)
	scenario := client.Scenario()

	deletableLeaf := scenario.Account("deleteability:Accounts:Clear:Leaf")
	usedLeaf := scenario.AccountWithCurrency("deleteability:Accounts:Used:Visible", "USD")
	templateUsedLeaf := scenario.AccountWithCurrency("deleteability:Accounts:TemplateUsed:Leaf", "USD")
	creditLimitUsedLeaf := scenario.AccountWithCurrency("deleteability:Accounts:CreditLimitUsed:Leaf", "USD")
	visibleClearInBlockedGroup := scenario.Account("deleteability:Accounts:BlockedByHidden:VisibleClear")
	hiddenUsedLeaf := scenario.AccountWithCurrency("deleteability:Accounts:BlockedByHidden:HiddenUsed", "USD")
	visibleCounterparty := scenario.Account("deleteability:Counterparty:Visible")
	hiddenCounterparty := scenario.Account("deleteability:Counterparty:Hidden")
	category := scenario.Category("Deleteability:Records")
	tag := scenario.Tag("Deleteability:Records")
	member := scenario.Member("Deleteability Tester")

	scenario.BalancedTransaction(apptest.TransactionRefs{
		CheckingAccountID: usedLeaf.AccountId,
		MerchantAccountID: visibleCounterparty.AccountId,
		CategoryID:        category.CategoryId,
		TagID:             tag.TagId,
		MemberID:          member.MemberId,
	})
	scenario.BalancedTransaction(apptest.TransactionRefs{
		CheckingAccountID: hiddenUsedLeaf.AccountId,
		MerchantAccountID: hiddenCounterparty.AccountId,
		CategoryID:        category.CategoryId,
		TagID:             tag.TagId,
		MemberID:          member.MemberId,
	})
	amount := "25.00"
	currency := "USD"
	tagIDs := []int64{tag.TagId}
	createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "Deleteability:Templates:AccountUsage",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{
				AccountId:  &templateUsedLeaf.AccountId,
				Amount:     &amount,
				CategoryId: category.CategoryId,
				Currency:   &currency,
				MemberId:   &member.MemberId,
				TagIds:     &tagIDs,
			},
		},
	})
	createCreditLimitHistory(t, client, creditLimitUsedLeaf.AccountId, "5000", "2024-02-01")
	setAccountHidden(t, client, hiddenUsedLeaf.AccountId, true)

	includeHidden := true
	accounts, err := client.REST().ListAccountsWithResponse(context.Background(), &httpclient.ListAccountsParams{IncludeHidden: &includeHidden})
	requireNoTransportError(t, "list accounts for deleteability", err)
	if accounts.StatusCode() != http.StatusOK {
		t.Fatalf("list accounts for deleteability status = %d, want %d; body %s", accounts.StatusCode(), http.StatusOK, accounts.Body)
	}
	assertAccountDeletable(t, accounts.JSON200.Accounts, deletableLeaf.AccountId, true)
	assertAccountDeletable(t, accounts.JSON200.Accounts, usedLeaf.AccountId, false)
	assertAccountDeletable(t, accounts.JSON200.Accounts, templateUsedLeaf.AccountId, false)
	assertAccountDeletable(t, accounts.JSON200.Accounts, creditLimitUsedLeaf.AccountId, false)
	assertAccountDeletable(t, accounts.JSON200.Accounts, hiddenUsedLeaf.AccountId, false)

	assertAccountDeletable(t, accounts.JSON200.Accounts, visibleClearInBlockedGroup.AccountId, true)
}

func TestSetAccountHiddenByPathUpdatesActiveLeaves(t *testing.T) {
	client := newSharedClient(t)

	checking := createAccountForGroupState(t, client, "groupstate:SetHidden:Bank:Checking", false)
	savings := createAccountForGroupState(t, client, "groupstate:SetHidden:Bank:Savings", false)
	nested := createAccountForGroupState(t, client, "groupstate:SetHidden:Bank:Nested:Deep", false)
	bankroll := createAccountForGroupState(t, client, "groupstate:SetHidden:Bankroll:Leaf", false)

	initialGroups := listAccountGroups(t, client, false)
	assertAccountGroupState(t, initialGroups, "groupstate:SetHidden:Bank", stringPtr("groupstate:SetHidden"), 2, false)

	hidden := setAccountHiddenByPath(t, client, "groupstate:SetHidden:Bank", true)
	if hidden.JSON200.UpdatedCount != 3 {
		t.Fatalf("set hidden updated_count = %d, want 3", hidden.JSON200.UpdatedCount)
	}
	assertAccountHidden(t, client, checking.AccountId, true)
	assertAccountHidden(t, client, savings.AccountId, true)
	assertAccountHidden(t, client, nested.AccountId, true)
	assertAccountHidden(t, client, bankroll.AccountId, false)

	defaultGroupsAfterHide := listAccountGroups(t, client, false)
	assertAccountGroupMissing(t, defaultGroupsAfterHide, "groupstate:SetHidden:Bank")
	hiddenGroupsAfterHide := listAccountGroups(t, client, true)
	assertAccountGroupState(t, hiddenGroupsAfterHide, "groupstate:SetHidden:Bank", stringPtr("groupstate:SetHidden"), 2, true)

	hiddenAgain := setAccountHiddenByPath(t, client, "groupstate:SetHidden:Bank", true)
	if hiddenAgain.JSON200.UpdatedCount != 3 {
		t.Fatalf("re-hide updated_count = %d, want 3", hiddenAgain.JSON200.UpdatedCount)
	}

	unhidden := setAccountHiddenByPath(t, client, "groupstate:SetHidden:Bank", false)
	if unhidden.JSON200.UpdatedCount != 3 {
		t.Fatalf("unhide updated_count = %d, want 3", unhidden.JSON200.UpdatedCount)
	}
	assertAccountHidden(t, client, checking.AccountId, false)
	assertAccountHidden(t, client, savings.AccountId, false)
	assertAccountHidden(t, client, nested.AccountId, false)
	assertAccountHidden(t, client, bankroll.AccountId, false)

	defaultGroupsAfterUnhide := listAccountGroups(t, client, false)
	assertAccountGroupState(t, defaultGroupsAfterUnhide, "groupstate:SetHidden:Bank", stringPtr("groupstate:SetHidden"), 2, false)

	leafHidden := setAccountHiddenByPath(t, client, "groupstate:SetHidden:Bank:Savings", true)
	if leafHidden.JSON200.UpdatedCount != 1 {
		t.Fatalf("leaf hide updated_count = %d, want 1", leafHidden.JSON200.UpdatedCount)
	}
	assertAccountHidden(t, client, checking.AccountId, false)
	assertAccountHidden(t, client, savings.AccountId, true)
	assertAccountHidden(t, client, nested.AccountId, false)
	assertAccountHidden(t, client, bankroll.AccountId, false)
}

func TestSetAccountHiddenByPathLeavesTombstonedSiblingsUnchanged(t *testing.T) {
	client := newSharedClient(t)

	active := createAccountForGroupState(t, client, "groupstate:SetHiddenTombstone:Bank:Active", false)
	tombstoned := createAccountForGroupState(t, client, "groupstate:SetHiddenTombstone:Bank:Closed", false)
	deleteAccount(t, client, tombstoned.AccountId)

	hidden := setAccountHiddenByPath(t, client, "groupstate:SetHiddenTombstone:Bank", true)
	if hidden.JSON200.UpdatedCount != 1 {
		t.Fatalf("hide mixed tombstone group updated_count = %d, want 1", hidden.JSON200.UpdatedCount)
	}
	assertAccountHidden(t, client, active.AccountId, true)

	readTombstoned := getAccountForRestructure(t, client, tombstoned.AccountId, true)
	if readTombstoned.IsHidden {
		t.Fatalf("tombstoned sibling is_hidden = true, want false")
	}
}

func TestSetAccountHiddenByPathValidation(t *testing.T) {
	client := newSharedClient(t)
	tombstoned := createAccountForGroupState(t, client, "groupstate:Validation:OnlyTombstone:Leaf", false)
	deleteAccount(t, client, tombstoned.AccountId)

	assertSetAccountHiddenStatus(t, client, "groupstate:Missing", true, http.StatusNotFound, httpclient.APIErrorCodeNotFound)
	assertSetAccountHiddenStatus(t, client, "groupstate:Validation:OnlyTombstone", true, http.StatusNotFound, httpclient.APIErrorCodeNotFound)
	assertSetAccountHiddenStatus(t, client, ":invalid", true, http.StatusBadRequest, httpclient.APIErrorCodeInvalidRequest)
}

func TestAccountLeavesCreatedUnderHiddenGroupDefaultVisible(t *testing.T) {
	client := newSharedClient(t)

	first := createAccountForGroupState(t, client, "groupstate:Late:HiddenGroup:One", false)
	hidden := setAccountHiddenByPath(t, client, "groupstate:Late:HiddenGroup", true)
	if hidden.JSON200.UpdatedCount != 1 {
		t.Fatalf("hide late group updated_count = %d, want 1", hidden.JSON200.UpdatedCount)
	}
	assertAccountHidden(t, client, first.AccountId, true)

	second := createAccountForGroupState(t, client, "groupstate:Late:HiddenGroup:Two", false)
	assertAccountHidden(t, client, second.AccountId, false)

	defaultGroups := listAccountGroups(t, client, false)
	assertAccountGroupState(t, defaultGroups, "groupstate:Late:HiddenGroup", stringPtr("groupstate:Late"), 2, false)
}

func createAccountForGroupState(t *testing.T, client *apptest.Client, fqn string, hidden bool) httpclient.Account {
	t.Helper()

	request := httpclient.CreateAccountRequest{
		Fqn:         fqn,
		AccountType: httpclient.Flow,
	}
	if hidden {
		request.IsHidden = &hidden
	}
	response, err := client.REST().CreateAccountWithResponse(context.Background(), request)
	requireNoTransportError(t, "create account for group state", err)
	if response.StatusCode() != http.StatusCreated {
		t.Fatalf("create account for group state status = %d, want %d; body %s", response.StatusCode(), http.StatusCreated, response.Body)
	}

	return *response.JSON201
}

func listAccountGroups(t *testing.T, client *apptest.Client, includeHidden bool) []httpclient.GroupState {
	t.Helper()

	response, err := client.REST().ListAccountGroupsWithResponse(context.Background(), &httpclient.ListAccountGroupsParams{IncludeHidden: &includeHidden})
	return requireAccountGroupsResponse(t, response, err)
}

func listAccountGroupsDefault(t *testing.T, client *apptest.Client) []httpclient.GroupState {
	t.Helper()

	response, err := client.REST().ListAccountGroupsWithResponse(context.Background(), nil)
	return requireAccountGroupsResponse(t, response, err)
}

func requireAccountGroupsResponse(t *testing.T, response *httpclient.ListAccountGroupsResponse, err error) []httpclient.GroupState {
	t.Helper()

	requireNoTransportError(t, "list account groups", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("list account groups status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}

	return response.JSON200.Groups
}

func setAccountHiddenByPath(t *testing.T, client *apptest.Client, path string, hidden bool) *httpclient.SetAccountHiddenByPathResponse {
	t.Helper()

	response, err := client.REST().SetAccountHiddenByPathWithResponse(context.Background(), httpclient.SetHiddenByPathRequest{
		PathFqn:  path,
		IsHidden: hidden,
	})
	requireNoTransportError(t, "set account hidden by path", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("set account hidden by path status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}

	return response
}

func setAccountHidden(t *testing.T, client *apptest.Client, accountID int64, hidden bool) {
	t.Helper()

	response, err := client.REST().UpdateAccountWithResponse(context.Background(), accountID, httpclient.UpdateAccountRequest{IsHidden: &hidden})
	requireNoTransportError(t, "set account hidden", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("set account hidden status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
}

func assertSetAccountHiddenStatus(t *testing.T, client *apptest.Client, path string, hidden bool, status int, code httpclient.APIErrorCode) {
	t.Helper()

	response, err := client.REST().SetAccountHiddenByPathWithResponse(context.Background(), httpclient.SetHiddenByPathRequest{
		PathFqn:  path,
		IsHidden: hidden,
	})
	requireNoTransportError(t, "set account hidden by path rejected", err)
	if response.StatusCode() != status {
		t.Fatalf("set account hidden status = %d, want %d; body %s", response.StatusCode(), status, response.Body)
	}
	switch status {
	case http.StatusBadRequest:
		if response.JSON400 == nil || response.JSON400.Error.Code != code {
			t.Fatalf("400 error = %+v, want code %q; body %s", response.JSON400, code, response.Body)
		}
	case http.StatusNotFound:
		if response.JSON404 == nil || response.JSON404.Error.Code != code {
			t.Fatalf("404 error = %+v, want code %q; body %s", response.JSON404, code, response.Body)
		}
	default:
		t.Fatalf("unsupported set hidden error status %d", status)
	}
}

func assertAccountGroupState(t *testing.T, groups []httpclient.GroupState, fqn string, parent *string, level int, hidden bool) {
	t.Helper()

	group, ok := accountGroupByFQN(groups, fqn)
	if !ok {
		t.Fatalf("account group %q not found in %+v", fqn, groups)
	}
	if !equalOptionalString(group.ParentFqn, parent) || group.Level != level || group.IsHidden != hidden {
		t.Fatalf("account group %q = %+v, want parent %v level %d hidden %t", fqn, group, parent, level, hidden)
	}
}

func assertAccountDeletable(t *testing.T, accounts []httpclient.Account, accountID int64, deletable bool) {
	t.Helper()

	for _, account := range accounts {
		if account.AccountId != accountID {
			continue
		}
		if account.Deletable == nil {
			t.Fatalf("account %d deletable = nil, want %t", accountID, deletable)
		}
		if *account.Deletable != deletable {
			t.Fatalf("account %d deletable = %t, want %t; account = %+v", accountID, *account.Deletable, deletable, account)
		}
		return
	}
	t.Fatalf("account %d not found in %+v", accountID, accounts)
}

func assertAccountGroupMissing(t *testing.T, groups []httpclient.GroupState, fqn string) {
	t.Helper()

	if group, ok := accountGroupByFQN(groups, fqn); ok {
		t.Fatalf("account group %q = %+v, want missing", fqn, group)
	}
}

func accountGroupByFQN(groups []httpclient.GroupState, fqn string) (httpclient.GroupState, bool) {
	for _, group := range groups {
		if group.Fqn == fqn {
			return group, true
		}
	}

	return httpclient.GroupState{}, false
}

func accountGroupFQNsAtOrUnder(groups []httpclient.GroupState, path string) []string {
	fqns := []string{}
	for _, group := range groups {
		if group.Fqn == path || strings.HasPrefix(group.Fqn, path+":") {
			fqns = append(fqns, group.Fqn)
		}
	}

	return fqns
}

func assertStringSlice(t *testing.T, got []string, want []string) {
	t.Helper()

	if len(got) != len(want) {
		t.Fatalf("strings = %+v, want %+v", got, want)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("strings = %+v, want %+v", got, want)
		}
	}
}

func stringPtr(value string) *string {
	return &value
}
