package runtime_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
	"github.com/oapi-codegen/nullable"
)

func TestAccountCreateReadListUpdateDeleteBoundary(t *testing.T) {
	client := newSharedClient(t)

	currency := "USD"
	externalID := "acct-123"
	externalSystem := "plaid"
	created, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:            "checking:Chase:Primary",
		AccountType:    httpclient.Balance,
		Currency:       &currency,
		ExternalId:     &externalID,
		ExternalSystem: &externalSystem,
	})
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	assertAccountHierarchy(t, *created.JSON201, httpclient.Balance, "checking:Chase", "Primary", 2)
	if created.JSON201.Currency == nil || *created.JSON201.Currency != "USD" {
		t.Fatalf("currency = %v, want USD", created.JSON201.Currency)
	}
	if created.JSON201.IsFeatured {
		t.Fatal("created account featured = true, want false")
	}

	read, err := client.REST().GetAccountWithResponse(context.Background(), created.JSON201.AccountId, nil)
	if err != nil {
		t.Fatalf("read request: %v", err)
	}
	if read.StatusCode() != http.StatusOK {
		t.Fatalf("read status = %d, want %d; body %s", read.StatusCode(), http.StatusOK, read.Body)
	}
	if read.JSON200.AccountId != created.JSON201.AccountId {
		t.Fatalf("read account id = %d, want %d", read.JSON200.AccountId, created.JSON201.AccountId)
	}
	if read.JSON200.AccountType != httpclient.Balance {
		t.Fatalf("read account_type = %q, want %q", read.JSON200.AccountType, httpclient.Balance)
	}

	hiddenValue := true
	featuredValue := true
	hidden, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:         "credit:Amex:Blue",
		AccountType: httpclient.Balance,
		IsHidden:    &hiddenValue,
		IsFeatured:  &featuredValue,
		Currency:    &currency,
	})
	if err != nil {
		t.Fatalf("hidden create request: %v", err)
	}
	if hidden.StatusCode() != http.StatusCreated {
		t.Fatalf("hidden create status = %d, want %d; body %s", hidden.StatusCode(), http.StatusCreated, hidden.Body)
	}

	defaultList, err := client.REST().ListAccountsWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("default list request: %v", err)
	}
	if defaultList.StatusCode() != http.StatusOK {
		t.Fatalf("default list status = %d, want %d; body %s", defaultList.StatusCode(), http.StatusOK, defaultList.Body)
	}
	assertAccountIDs(t, defaultList.JSON200.Accounts, []int64{created.JSON201.AccountId})
	assertAccountTypes(t, defaultList.JSON200.Accounts, []httpclient.AccountType{httpclient.Balance})
	if defaultList.JSON200.TotalCount != 1 {
		t.Fatalf("default account total_count = %d, want 1", defaultList.JSON200.TotalCount)
	}

	includeHidden, err := client.REST().ListAccountsWithResponse(context.Background(), &httpclient.ListAccountsParams{IncludeHidden: &hiddenValue})
	if err != nil {
		t.Fatalf("include hidden request: %v", err)
	}
	if includeHidden.StatusCode() != http.StatusOK {
		t.Fatalf("include hidden status = %d, want %d; body %s", includeHidden.StatusCode(), http.StatusOK, includeHidden.Body)
	}
	assertAccountIDs(t, includeHidden.JSON200.Accounts, []int64{created.JSON201.AccountId, hidden.JSON201.AccountId})
	assertAccountTypes(t, includeHidden.JSON200.Accounts, []httpclient.AccountType{httpclient.Balance, httpclient.Balance})
	assertAccountFeatured(t, includeHidden.JSON200.Accounts, []bool{false, true})
	if includeHidden.JSON200.TotalCount != 2 {
		t.Fatalf("include hidden account total_count = %d, want 2", includeHidden.JSON200.TotalCount)
	}

	system, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:         "system:opening_balance",
		AccountType: httpclient.System,
		Currency:    &currency,
	})
	if err != nil {
		t.Fatalf("system create request: %v", err)
	}
	if system.StatusCode() != http.StatusCreated {
		t.Fatalf("system create status = %d, want %d; body %s", system.StatusCode(), http.StatusCreated, system.Body)
	}
	if system.JSON201.IsHidden {
		t.Fatal("system account hidden = true, want false")
	}

	defaultAfterSystem, err := client.REST().ListAccountsWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("default after system list request: %v", err)
	}
	if defaultAfterSystem.StatusCode() != http.StatusOK {
		t.Fatalf("default after system list status = %d, want %d; body %s", defaultAfterSystem.StatusCode(), http.StatusOK, defaultAfterSystem.Body)
	}
	assertAccountIDs(t, defaultAfterSystem.JSON200.Accounts, []int64{created.JSON201.AccountId, system.JSON201.AccountId})
	if defaultAfterSystem.JSON200.TotalCount != 2 {
		t.Fatalf("default after system account total_count = %d, want 2", defaultAfterSystem.JSON200.TotalCount)
	}

	featuredOnly, err := client.REST().ListAccountsWithResponse(context.Background(), &httpclient.ListAccountsParams{
		IncludeHidden: &hiddenValue,
		IsFeatured:    &featuredValue,
	})
	if err != nil {
		t.Fatalf("featured list request: %v", err)
	}
	if featuredOnly.StatusCode() != http.StatusOK {
		t.Fatalf("featured list status = %d, want %d; body %s", featuredOnly.StatusCode(), http.StatusOK, featuredOnly.Body)
	}
	assertAccountIDs(t, featuredOnly.JSON200.Accounts, []int64{hidden.JSON201.AccountId})

	defaultFeaturedOnly, err := client.REST().ListAccountsWithResponse(context.Background(), &httpclient.ListAccountsParams{
		IsFeatured: &featuredValue,
	})
	if err != nil {
		t.Fatalf("default featured list request: %v", err)
	}
	if defaultFeaturedOnly.StatusCode() != http.StatusOK {
		t.Fatalf("default featured list status = %d, want %d; body %s", defaultFeaturedOnly.StatusCode(), http.StatusOK, defaultFeaturedOnly.Body)
	}
	assertAccountIDs(t, defaultFeaturedOnly.JSON200.Accounts, nil)

	unfeaturedValue := false
	unfeatured, err := client.REST().ListAccountsWithResponse(context.Background(), &httpclient.ListAccountsParams{
		IncludeHidden: &hiddenValue,
		IsFeatured:    &unfeaturedValue,
	})
	if err != nil {
		t.Fatalf("unfeatured list request: %v", err)
	}
	if unfeatured.StatusCode() != http.StatusOK {
		t.Fatalf("unfeatured list status = %d, want %d; body %s", unfeatured.StatusCode(), http.StatusOK, unfeatured.Body)
	}
	assertAccountIDs(t, unfeatured.JSON200.Accounts, []int64{created.JSON201.AccountId, system.JSON201.AccountId})

	accountTypeBalance := httpclient.Balance
	balanceAccounts, err := client.REST().ListAccountsWithResponse(context.Background(), &httpclient.ListAccountsParams{AccountType: &accountTypeBalance})
	if err != nil {
		t.Fatalf("balance account type list request: %v", err)
	}
	if balanceAccounts.StatusCode() != http.StatusOK {
		t.Fatalf("balance account type list status = %d, want %d; body %s", balanceAccounts.StatusCode(), http.StatusOK, balanceAccounts.Body)
	}
	assertAccountIDs(t, balanceAccounts.JSON200.Accounts, []int64{created.JSON201.AccountId})
	if balanceAccounts.JSON200.TotalCount != 1 {
		t.Fatalf("balance account total_count = %d, want 1", balanceAccounts.JSON200.TotalCount)
	}

	accountTypeSystem := httpclient.System
	systemAccounts, err := client.REST().ListAccountsWithResponse(context.Background(), &httpclient.ListAccountsParams{AccountType: &accountTypeSystem})
	if err != nil {
		t.Fatalf("system account type list request: %v", err)
	}
	if systemAccounts.StatusCode() != http.StatusOK {
		t.Fatalf("system account type list status = %d, want %d; body %s", systemAccounts.StatusCode(), http.StatusOK, systemAccounts.Body)
	}
	assertAccountIDs(t, systemAccounts.JSON200.Accounts, []int64{system.JSON201.AccountId})
	if systemAccounts.JSON200.TotalCount != 1 {
		t.Fatalf("system account total_count = %d, want 1", systemAccounts.JSON200.TotalCount)
	}

	accountTypeFlow := httpclient.Flow
	flowAccounts, err := client.REST().ListAccountsWithResponse(context.Background(), &httpclient.ListAccountsParams{AccountType: &accountTypeFlow})
	if err != nil {
		t.Fatalf("flow account type list request: %v", err)
	}
	if flowAccounts.StatusCode() != http.StatusOK {
		t.Fatalf("flow account type list status = %d, want %d; body %s", flowAccounts.StatusCode(), http.StatusOK, flowAccounts.Body)
	}
	assertAccountIDs(t, flowAccounts.JSON200.Accounts, nil)
	if flowAccounts.JSON200.TotalCount != 0 {
		t.Fatalf("flow account total_count = %d, want 0", flowAccounts.JSON200.TotalCount)
	}

	hideSystem, err := client.REST().UpdateAccountWithResponse(context.Background(), system.JSON201.AccountId, httpclient.UpdateAccountRequest{
		IsHidden: &hiddenValue,
	})
	if err != nil {
		t.Fatalf("hide system update request: %v", err)
	}
	if hideSystem.StatusCode() != http.StatusOK {
		t.Fatalf("hide system update status = %d, want %d; body %s", hideSystem.StatusCode(), http.StatusOK, hideSystem.Body)
	}
	if !hideSystem.JSON200.IsHidden {
		t.Fatal("updated system account hidden = false, want true")
	}
	defaultAfterHideSystem, err := client.REST().ListAccountsWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("default after hide system list request: %v", err)
	}
	if defaultAfterHideSystem.StatusCode() != http.StatusOK {
		t.Fatalf("default after hide system list status = %d, want %d; body %s", defaultAfterHideSystem.StatusCode(), http.StatusOK, defaultAfterHideSystem.Body)
	}
	assertAccountIDs(t, defaultAfterHideSystem.JSON200.Accounts, []int64{created.JSON201.AccountId})

	featureCreated, err := client.REST().UpdateAccountWithResponse(context.Background(), created.JSON201.AccountId, httpclient.UpdateAccountRequest{
		IsFeatured: &featuredValue,
	})
	if err != nil {
		t.Fatalf("feature update request: %v", err)
	}
	if featureCreated.StatusCode() != http.StatusOK {
		t.Fatalf("feature update status = %d, want %d; body %s", featureCreated.StatusCode(), http.StatusOK, featureCreated.Body)
	}
	if !featureCreated.JSON200.IsFeatured {
		t.Fatal("featured account featured = false, want true")
	}
	if featureCreated.JSON200.IsHidden {
		t.Fatal("featured account hidden = true, want omitted is_hidden to preserve false")
	}
	if featureCreated.JSON200.ExternalId == nil || *featureCreated.JSON200.ExternalId != "acct-123" {
		t.Fatalf("feature update external_id = %v, want acct-123", featureCreated.JSON200.ExternalId)
	}
	if featureCreated.JSON200.ExternalSystem == nil || *featureCreated.JSON200.ExternalSystem != "plaid" {
		t.Fatalf("feature update external_system = %v, want plaid", featureCreated.JSON200.ExternalSystem)
	}

	unfeaturedUpdate, err := client.REST().UpdateAccountWithResponse(context.Background(), created.JSON201.AccountId, httpclient.UpdateAccountRequest{
		IsFeatured: &unfeaturedValue,
	})
	if err != nil {
		t.Fatalf("unfeature update request: %v", err)
	}
	if unfeaturedUpdate.StatusCode() != http.StatusOK {
		t.Fatalf("unfeature update status = %d, want %d; body %s", unfeaturedUpdate.StatusCode(), http.StatusOK, unfeaturedUpdate.Body)
	}
	if unfeaturedUpdate.JSON200.IsFeatured {
		t.Fatal("unfeatured account featured = true, want false")
	}

	refeaturedUpdate, err := client.REST().UpdateAccountWithResponse(context.Background(), created.JSON201.AccountId, httpclient.UpdateAccountRequest{
		IsFeatured: &featuredValue,
	})
	if err != nil {
		t.Fatalf("refeature update request: %v", err)
	}
	if refeaturedUpdate.StatusCode() != http.StatusOK {
		t.Fatalf("refeature update status = %d, want %d; body %s", refeaturedUpdate.StatusCode(), http.StatusOK, refeaturedUpdate.Body)
	}
	if !refeaturedUpdate.JSON200.IsFeatured {
		t.Fatal("refeatured account featured = false, want true")
	}

	updatedExternalID := "acct-456"
	updatedExternalSystem := "manual"
	updated, err := client.REST().UpdateAccountWithResponse(context.Background(), created.JSON201.AccountId, httpclient.UpdateAccountRequest{
		IsHidden:       &hiddenValue,
		ExternalId:     nullable.NewNullableWithValue(updatedExternalID),
		ExternalSystem: nullable.NewNullableWithValue(updatedExternalSystem),
	})
	if err != nil {
		t.Fatalf("update request: %v", err)
	}
	if updated.StatusCode() != http.StatusOK {
		t.Fatalf("update status = %d, want %d; body %s", updated.StatusCode(), http.StatusOK, updated.Body)
	}
	if !updated.JSON200.IsHidden {
		t.Fatal("updated account hidden = false, want true")
	}
	if updated.JSON200.AccountType != httpclient.Balance {
		t.Fatalf("updated account_type = %q, want %q", updated.JSON200.AccountType, httpclient.Balance)
	}
	if !updated.JSON200.IsFeatured {
		t.Fatal("updated account featured = false, want true")
	}
	if updated.JSON200.ExternalId == nil || *updated.JSON200.ExternalId != "acct-456" {
		t.Fatalf("external_id = %v, want acct-456", updated.JSON200.ExternalId)
	}
	if updated.JSON200.ExternalSystem == nil || *updated.JSON200.ExternalSystem != "manual" {
		t.Fatalf("external_system = %v, want manual", updated.JSON200.ExternalSystem)
	}

	updatedExternalIDOnly := "acct-789"
	updatedIDOnly, err := client.REST().UpdateAccountWithResponse(context.Background(), created.JSON201.AccountId, httpclient.UpdateAccountRequest{
		ExternalId: nullable.NewNullableWithValue(updatedExternalIDOnly),
	})
	if err != nil {
		t.Fatalf("external_id-only update request: %v", err)
	}
	if updatedIDOnly.StatusCode() != http.StatusOK {
		t.Fatalf("external_id-only update status = %d, want %d; body %s", updatedIDOnly.StatusCode(), http.StatusOK, updatedIDOnly.Body)
	}
	if updatedIDOnly.JSON200.ExternalId == nil || *updatedIDOnly.JSON200.ExternalId != "acct-789" {
		t.Fatalf("external_id-only external_id = %v, want acct-789", updatedIDOnly.JSON200.ExternalId)
	}
	if updatedIDOnly.JSON200.ExternalSystem == nil || *updatedIDOnly.JSON200.ExternalSystem != "manual" {
		t.Fatalf("external_id-only external_system = %v, want manual", updatedIDOnly.JSON200.ExternalSystem)
	}

	updatedExternalSystemOnly := "manual-v2"
	updatedSystemOnly, err := client.REST().UpdateAccountWithResponse(context.Background(), created.JSON201.AccountId, httpclient.UpdateAccountRequest{
		ExternalSystem: nullable.NewNullableWithValue(updatedExternalSystemOnly),
	})
	if err != nil {
		t.Fatalf("external_system-only update request: %v", err)
	}
	if updatedSystemOnly.StatusCode() != http.StatusOK {
		t.Fatalf("external_system-only update status = %d, want %d; body %s", updatedSystemOnly.StatusCode(), http.StatusOK, updatedSystemOnly.Body)
	}
	if updatedSystemOnly.JSON200.ExternalId == nil || *updatedSystemOnly.JSON200.ExternalId != "acct-789" {
		t.Fatalf("external_system-only external_id = %v, want acct-789", updatedSystemOnly.JSON200.ExternalId)
	}
	if updatedSystemOnly.JSON200.ExternalSystem == nil || *updatedSystemOnly.JSON200.ExternalSystem != "manual-v2" {
		t.Fatalf("external_system-only external_system = %v, want manual-v2", updatedSystemOnly.JSON200.ExternalSystem)
	}

	clearedExternal, err := client.REST().UpdateAccountWithResponse(context.Background(), created.JSON201.AccountId, httpclient.UpdateAccountRequest{
		ExternalId:     nullable.NewNullNullable[string](),
		ExternalSystem: nullable.NewNullNullable[string](),
	})
	if err != nil {
		t.Fatalf("clear external identifiers request: %v", err)
	}
	if clearedExternal.StatusCode() != http.StatusOK {
		t.Fatalf("clear external identifiers status = %d, want %d; body %s", clearedExternal.StatusCode(), http.StatusOK, clearedExternal.Body)
	}
	if clearedExternal.JSON200.ExternalId != nil {
		t.Fatalf("cleared external_id = %v, want nil", clearedExternal.JSON200.ExternalId)
	}
	if clearedExternal.JSON200.ExternalSystem != nil {
		t.Fatalf("cleared external_system = %v, want nil", clearedExternal.JSON200.ExternalSystem)
	}

	afterHide, err := client.REST().ListAccountsWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("after hide list request: %v", err)
	}
	if afterHide.StatusCode() != http.StatusOK {
		t.Fatalf("after hide list status = %d, want %d; body %s", afterHide.StatusCode(), http.StatusOK, afterHide.Body)
	}
	assertAccountIDs(t, afterHide.JSON200.Accounts, nil)

	visibleDeleted, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:         "savings:Ally:Reserve",
		AccountType: httpclient.Balance,
		Currency:    &currency,
	})
	if err != nil {
		t.Fatalf("visible delete create request: %v", err)
	}
	if visibleDeleted.StatusCode() != http.StatusCreated {
		t.Fatalf("visible delete create status = %d, want %d; body %s", visibleDeleted.StatusCode(), http.StatusCreated, visibleDeleted.Body)
	}
	visibleDelete, err := client.REST().DeleteAccountWithResponse(context.Background(), visibleDeleted.JSON201.AccountId)
	if err != nil {
		t.Fatalf("visible delete request: %v", err)
	}
	if visibleDelete.StatusCode() != http.StatusNoContent {
		t.Fatalf("visible delete status = %d, want %d; body %s", visibleDelete.StatusCode(), http.StatusNoContent, visibleDelete.Body)
	}
	defaultAfterVisibleDelete, err := client.REST().ListAccountsWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("default after visible delete request: %v", err)
	}
	if defaultAfterVisibleDelete.StatusCode() != http.StatusOK {
		t.Fatalf("default after visible delete status = %d, want %d; body %s", defaultAfterVisibleDelete.StatusCode(), http.StatusOK, defaultAfterVisibleDelete.Body)
	}
	assertAccountIDs(t, defaultAfterVisibleDelete.JSON200.Accounts, nil)

	deleted, err := client.REST().DeleteAccountWithResponse(context.Background(), hidden.JSON201.AccountId)
	if err != nil {
		t.Fatalf("delete request: %v", err)
	}
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}

	missing, err := client.REST().GetAccountWithResponse(context.Background(), hidden.JSON201.AccountId, nil)
	if err != nil {
		t.Fatalf("get deleted request: %v", err)
	}
	if missing.StatusCode() != http.StatusNotFound {
		t.Fatalf("get deleted status = %d, want %d; body %s", missing.StatusCode(), http.StatusNotFound, missing.Body)
	}

	includeTombstoned := true
	deletedRead, err := client.REST().GetAccountWithResponse(context.Background(), hidden.JSON201.AccountId, &httpclient.GetAccountParams{IncludeTombstoned: &includeTombstoned})
	if err != nil {
		t.Fatalf("get deleted with tombstones request: %v", err)
	}
	if deletedRead.StatusCode() != http.StatusOK {
		t.Fatalf("get deleted with tombstones status = %d, want %d; body %s", deletedRead.StatusCode(), http.StatusOK, deletedRead.Body)
	}
	if deletedRead.JSON200.TombstonedAt == nil {
		t.Fatal("get deleted with tombstones tombstoned_at = nil, want timestamp")
	}
	if deletedRead.JSON200.AccountType != httpclient.Balance {
		t.Fatalf("get deleted with tombstones account_type = %q, want %q", deletedRead.JSON200.AccountType, httpclient.Balance)
	}

	withTombstones, err := client.REST().ListAccountsWithResponse(context.Background(), &httpclient.ListAccountsParams{
		IncludeHidden:     &hiddenValue,
		IncludeTombstoned: &includeTombstoned,
	})
	if err != nil {
		t.Fatalf("include tombstones request: %v", err)
	}
	if withTombstones.StatusCode() != http.StatusOK {
		t.Fatalf("include tombstones status = %d, want %d; body %s", withTombstones.StatusCode(), http.StatusOK, withTombstones.Body)
	}
	assertAccountIDs(t, withTombstones.JSON200.Accounts, []int64{created.JSON201.AccountId, hidden.JSON201.AccountId, visibleDeleted.JSON201.AccountId, system.JSON201.AccountId})
	assertAccountTypes(t, withTombstones.JSON200.Accounts, []httpclient.AccountType{httpclient.Balance, httpclient.Balance, httpclient.Balance, httpclient.System})
	assertAccountFeatured(t, withTombstones.JSON200.Accounts, []bool{true, true, false, false})
}

func TestAccountBalancesBoundary(t *testing.T) {
	client := newSharedClient(t)
	scenario := client.Scenario()

	checking := scenario.AccountWithCurrency("checking:Balances:Primary", "EUR")
	savings := scenario.AccountWithCurrency("savings:Balances:Reserve", "USD")
	travel := scenario.AccountWithCurrency("cash:Travel", "USD")
	merchant := scenario.AccountWithType("merchant:Balances", httpclient.Flow)
	expenseCategory := scenario.Category("BalanceTests:Expense")
	incomeCategory := scenario.CategoryWithIntent("BalanceTests:Income", httpclient.CategoryEconomicIntentIncome)
	hiddenValue := true
	hidden, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:         "checking:Balances:Hidden",
		AccountType: httpclient.Balance,
		IsHidden:    &hiddenValue,
		Currency:    ptrTo("USD"),
	})
	if err != nil {
		t.Fatalf("hidden balance account request: %v", err)
	}
	if hidden.StatusCode() != http.StatusCreated {
		t.Fatalf("hidden balance account status = %d, want %d; body %s", hidden.StatusCode(), http.StatusCreated, hidden.Body)
	}

	createBalanceTransactionWithAmountUSD(t, client, checking.AccountId, merchant.AccountId, expenseCategory.CategoryId, "EUR", "-100.00", "100.00", "-110.00", "110.00", httpclient.Posted)
	createBalanceTransactionWithAmountUSD(t, client, checking.AccountId, merchant.AccountId, expenseCategory.CategoryId, "EUR", "-25.00", "25.00", "-27.50", "27.50", httpclient.Pending)
	createBalanceTransaction(t, client, checking.AccountId, merchant.AccountId, expenseCategory.CategoryId, "EUR", "-10.00", "10.00", httpclient.Posted)
	createBalanceTransaction(t, client, checking.AccountId, merchant.AccountId, expenseCategory.CategoryId, "EUR", "-5.00", "5.00", httpclient.Cancelled)
	createBalanceTransactionWithAmountUSD(t, client, travel.AccountId, merchant.AccountId, incomeCategory.CategoryId, "USD", "2.00", "-2.00", "2.50", "-2.50", httpclient.Posted)
	createBalanceTransactionWithAmountUSD(t, client, travel.AccountId, merchant.AccountId, incomeCategory.CategoryId, "EUR", "3.00", "-3.00", "3.30", "-3.30", httpclient.Posted)
	createBalanceTransaction(t, client, savings.AccountId, merchant.AccountId, expenseCategory.CategoryId, "EUR", "-7.00", "7.00", httpclient.Cancelled)
	createBalanceTransactionWithAmountUSD(t, client, hidden.JSON201.AccountId, merchant.AccountId, expenseCategory.CategoryId, "USD", "-9.00", "9.00", "-9.00", "9.00", httpclient.Posted)
	deletedTransaction := createBalanceTransaction(t, client, checking.AccountId, merchant.AccountId, expenseCategory.CategoryId, "EUR", "-11.00", "11.00", httpclient.Posted)
	deleted, err := client.REST().DeleteTransactionWithResponse(context.Background(), deletedTransaction.JSON201.TransactionId)
	if err != nil {
		t.Fatalf("delete balance transaction request: %v", err)
	}
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete balance transaction status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}

	balances, err := client.REST().ListAccountBalancesWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("list account balances request: %v", err)
	}
	if balances.StatusCode() != http.StatusOK {
		t.Fatalf("list account balances status = %d, want %d; body %s", balances.StatusCode(), http.StatusOK, balances.Body)
	}
	assertAccountBalances(t, balances.JSON200.Balances, []wantAccountBalance{
		{accountID: checking.AccountId, currency: "EUR", current: "-135.00000000", currentUSD: "-137.50000000", posted: "-110.00000000", unconvertedCount: 1},
		{accountID: savings.AccountId, currency: "USD", current: "0.00000000", currentUSD: "0.00000000", posted: "0.00000000", unconvertedCount: 0},
		{accountID: travel.AccountId, currency: "EUR", current: "3.00000000", currentUSD: "3.30000000", posted: "3.00000000", unconvertedCount: 0},
		{accountID: travel.AccountId, currency: "USD", current: "2.00000000", currentUSD: "2.50000000", posted: "2.00000000", unconvertedCount: 0},
	})

	includeHidden, err := client.REST().ListAccountBalancesWithResponse(context.Background(), &httpclient.ListAccountBalancesParams{IncludeHidden: &hiddenValue})
	if err != nil {
		t.Fatalf("include hidden account balances request: %v", err)
	}
	if includeHidden.StatusCode() != http.StatusOK {
		t.Fatalf("include hidden account balances status = %d, want %d; body %s", includeHidden.StatusCode(), http.StatusOK, includeHidden.Body)
	}
	assertAccountBalances(t, includeHidden.JSON200.Balances, []wantAccountBalance{
		{accountID: checking.AccountId, currency: "EUR", current: "-135.00000000", currentUSD: "-137.50000000", posted: "-110.00000000", unconvertedCount: 1},
		{accountID: savings.AccountId, currency: "USD", current: "0.00000000", currentUSD: "0.00000000", posted: "0.00000000", unconvertedCount: 0},
		{accountID: travel.AccountId, currency: "EUR", current: "3.00000000", currentUSD: "3.30000000", posted: "3.00000000", unconvertedCount: 0},
		{accountID: travel.AccountId, currency: "USD", current: "2.00000000", currentUSD: "2.50000000", posted: "2.00000000", unconvertedCount: 0},
		{accountID: hidden.JSON201.AccountId, currency: "USD", current: "-9.00000000", currentUSD: "-9.00000000", posted: "-9.00000000", unconvertedCount: 0},
	})

	accountIDs := []int64{travel.AccountId, merchant.AccountId}
	filtered, err := client.REST().ListAccountBalancesWithResponse(context.Background(), &httpclient.ListAccountBalancesParams{AccountIds: &accountIDs})
	if err != nil {
		t.Fatalf("filtered account balances request: %v", err)
	}
	if filtered.StatusCode() != http.StatusOK {
		t.Fatalf("filtered account balances status = %d, want %d; body %s", filtered.StatusCode(), http.StatusOK, filtered.Body)
	}
	assertAccountBalances(t, filtered.JSON200.Balances, []wantAccountBalance{
		{accountID: travel.AccountId, currency: "EUR", current: "3.00000000", currentUSD: "3.30000000", posted: "3.00000000", unconvertedCount: 0},
		{accountID: travel.AccountId, currency: "USD", current: "2.00000000", currentUSD: "2.50000000", posted: "2.00000000", unconvertedCount: 0},
	})

	emptyAccountIDs := []int64{merchant.AccountId}
	empty, err := client.REST().ListAccountBalancesWithResponse(context.Background(), &httpclient.ListAccountBalancesParams{AccountIds: &emptyAccountIDs})
	if err != nil {
		t.Fatalf("empty account balances request: %v", err)
	}
	if empty.StatusCode() != http.StatusOK {
		t.Fatalf("empty account balances status = %d, want %d; body %s", empty.StatusCode(), http.StatusOK, empty.Body)
	}
	assertAccountBalances(t, empty.JSON200.Balances, nil)

	invalid, err := client.REST().ListAccountBalancesWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("account_ids=0"))
	if err != nil {
		t.Fatalf("invalid account balances request: %v", err)
	}
	if invalid.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid account balances status = %d, want %d; body %s", invalid.StatusCode(), http.StatusBadRequest, invalid.Body)
	}
}

func TestAccountBalancesIncludeCurrentCreditLimits(t *testing.T) {
	clock := apptest.NewFakeClock(apptest.Timestamp("2026-07-04T12:00:00Z"))
	client := newSharedClient(t, apptest.WithClock(clock))
	scenario := client.Scenario()

	card := scenario.AccountWithCurrency("cards:Balances:Rewards", "USD")
	backupCard := scenario.AccountWithCurrency("cards:Balances:Backup", "USD")
	noHistory := scenario.AccountWithCurrency("checking:Balances:NoLimit", "USD")

	createCreditLimitHistory(t, client, card.AccountId, "5000.00", "2026-01-01")
	createCreditLimitHistory(t, client, card.AccountId, "7000.00", "2026-07-03")
	createCreditLimitHistory(t, client, card.AccountId, "9000.00", "2026-07-05")
	tombstoned := createCreditLimitHistory(t, client, card.AccountId, "8000.00", "2026-07-04")
	deleteCreditLimitHistory(t, client, tombstoned.JSON201.CreditLimitHistoryId)
	createCreditLimitHistory(t, client, backupCard.AccountId, "3000.00", "2026-06-01")

	accountIDs := []int64{card.AccountId, backupCard.AccountId, noHistory.AccountId}
	balances, err := client.REST().ListAccountBalancesWithResponse(context.Background(), &httpclient.ListAccountBalancesParams{AccountIds: &accountIDs})
	if err != nil {
		t.Fatalf("list account balances with credit limits request: %v", err)
	}
	if balances.StatusCode() != http.StatusOK {
		t.Fatalf("list account balances with credit limits status = %d, want %d; body %s", balances.StatusCode(), http.StatusOK, balances.Body)
	}
	assertAccountBalances(t, balances.JSON200.Balances, []wantAccountBalance{
		{accountID: card.AccountId, currency: "USD", current: "0.00000000", creditLimit: ptrTo("7000.00000000"), currentUSD: "0.00000000", posted: "0.00000000", unconvertedCount: 0},
		{accountID: backupCard.AccountId, currency: "USD", current: "0.00000000", creditLimit: ptrTo("3000.00000000"), currentUSD: "0.00000000", posted: "0.00000000", unconvertedCount: 0},
		{accountID: noHistory.AccountId, currency: "USD", current: "0.00000000", currentUSD: "0.00000000", posted: "0.00000000", unconvertedCount: 0},
	})
}

func TestAccountBalancesUseLocalCivilDateForCurrentCreditLimits(t *testing.T) {
	localZone := time.FixedZone("local-test", -7*60*60)
	clock := apptest.NewFakeClock(time.Date(2026, 7, 4, 23, 30, 0, 0, localZone))
	client := newSharedClient(t, apptest.WithClock(clock))
	scenario := client.Scenario()

	card := scenario.AccountWithCurrency("cards:Balances:LocalToday", "USD")

	createCreditLimitHistory(t, client, card.AccountId, "4000.00", "2026-07-04")
	createCreditLimitHistory(t, client, card.AccountId, "5000.00", "2026-07-05")

	accountIDs := []int64{card.AccountId}
	balances, err := client.REST().ListAccountBalancesWithResponse(context.Background(), &httpclient.ListAccountBalancesParams{AccountIds: &accountIDs})
	if err != nil {
		t.Fatalf("list account balances with local-date credit limit request: %v", err)
	}
	if balances.StatusCode() != http.StatusOK {
		t.Fatalf("list account balances with local-date credit limit status = %d, want %d; body %s", balances.StatusCode(), http.StatusOK, balances.Body)
	}
	assertAccountBalances(t, balances.JSON200.Balances, []wantAccountBalance{
		{accountID: card.AccountId, currency: "USD", current: "0.00000000", creditLimit: ptrTo("4000.00000000"), currentUSD: "0.00000000", posted: "0.00000000", unconvertedCount: 0},
	})
}

func TestAccountRejectsDuplicateActiveFQN(t *testing.T) {
	client := newSharedClient(t)

	currency := "USD"
	first, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:         "cash:Wallet",
		AccountType: httpclient.Balance,
		Currency:    &currency,
	})
	if err != nil {
		t.Fatalf("first create request: %v", err)
	}
	if first.StatusCode() != http.StatusCreated {
		t.Fatalf("first create status = %d, want %d; body %s", first.StatusCode(), http.StatusCreated, first.Body)
	}

	duplicate, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:         "cash:Wallet",
		AccountType: httpclient.Balance,
		Currency:    &currency,
	})
	if err != nil {
		t.Fatalf("duplicate request: %v", err)
	}
	if duplicate.StatusCode() != http.StatusConflict {
		t.Fatalf("duplicate status = %d, want %d; body %s", duplicate.StatusCode(), http.StatusConflict, duplicate.Body)
	}
	if duplicate.JSON409.Error.Code != httpclient.APIErrorCodeConflict {
		t.Fatalf("duplicate code = %q, want %q", duplicate.JSON409.Error.Code, httpclient.APIErrorCodeConflict)
	}

	deleted, err := client.REST().DeleteAccountWithResponse(context.Background(), first.JSON201.AccountId)
	if err != nil {
		t.Fatalf("delete request: %v", err)
	}
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}

	recreated, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:         "cash:Wallet",
		AccountType: httpclient.Balance,
		Currency:    &currency,
	})
	if err != nil {
		t.Fatalf("recreate request: %v", err)
	}
	if recreated.StatusCode() != http.StatusCreated {
		t.Fatalf("recreate status = %d, want %d; body %s", recreated.StatusCode(), http.StatusCreated, recreated.Body)
	}
}

func TestAccountAcceptsCryptoCurrencyBoundary(t *testing.T) {
	client := newSharedClient(t)

	currency := "C::ETHEREUM-LONG-TOKEN"
	created, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:         "crypto:Wallet:Cold",
		AccountType: httpclient.Balance,
		Currency:    &currency,
	})
	if err != nil {
		t.Fatalf("crypto currency request: %v", err)
	}
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("crypto currency status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	if created.JSON201.Currency == nil || *created.JSON201.Currency != currency {
		t.Fatalf("currency = %v, want %s", created.JSON201.Currency, currency)
	}
}

func TestAccountValidationErrors(t *testing.T) {
	client := newSharedClient(t)

	unknownCurrencyValue := "ZZZ"
	unknownCurrency, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:         "checking:Unknown",
		AccountType: httpclient.Balance,
		Currency:    &unknownCurrencyValue,
	})
	if err != nil {
		t.Fatalf("unknown currency request: %v", err)
	}
	if unknownCurrency.StatusCode() != http.StatusBadRequest {
		t.Fatalf("unknown currency status = %d, want %d; body %s", unknownCurrency.StatusCode(), http.StatusBadRequest, unknownCurrency.Body)
	}

	invalidCurrencyValue := "usd"
	invalidCurrency, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:         "checking:Chase",
		AccountType: httpclient.Balance,
		Currency:    &invalidCurrencyValue,
	})
	if err != nil {
		t.Fatalf("invalid currency request: %v", err)
	}
	if invalidCurrency.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid currency status = %d, want %d; body %s", invalidCurrency.StatusCode(), http.StatusBadRequest, invalidCurrency.Body)
	}
	if invalidCurrency.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("invalid currency code = %q, want %q", invalidCurrency.JSON400.Error.Code, httpclient.APIErrorCodeInvalidRequest)
	}

	nonASCIICurrencyValue := "ÅB"
	nonASCIICurrency, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:         "checking:CreditUnion",
		AccountType: httpclient.Balance,
		Currency:    &nonASCIICurrencyValue,
	})
	if err != nil {
		t.Fatalf("non-ASCII currency request: %v", err)
	}
	if nonASCIICurrency.StatusCode() != http.StatusBadRequest {
		t.Fatalf("non-ASCII currency status = %d, want %d; body %s", nonASCIICurrency.StatusCode(), http.StatusBadRequest, nonASCIICurrency.Body)
	}

	externalID := "acct-123"
	missingExternalSystem, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:         "checking:Chase",
		AccountType: httpclient.Balance,
		ExternalId:  &externalID,
	})
	if err != nil {
		t.Fatalf("missing external system request: %v", err)
	}
	if missingExternalSystem.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing external system status = %d, want %d; body %s", missingExternalSystem.StatusCode(), http.StatusBadRequest, missingExternalSystem.Body)
	}

	currency := "USD"
	validAccount, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:         "checking:PatchTarget",
		AccountType: httpclient.Balance,
		Currency:    &currency,
	})
	if err != nil {
		t.Fatalf("valid account create request: %v", err)
	}
	if validAccount.StatusCode() != http.StatusCreated {
		t.Fatalf("valid account create status = %d, want %d; body %s", validAccount.StatusCode(), http.StatusCreated, validAccount.Body)
	}
	patchExternalID := "acct-only"
	partialExternalIdentifiers, err := client.REST().UpdateAccountWithResponse(context.Background(), validAccount.JSON201.AccountId, httpclient.UpdateAccountRequest{
		ExternalId: nullable.NewNullableWithValue(patchExternalID),
	})
	if err != nil {
		t.Fatalf("partial external identifiers request: %v", err)
	}
	if partialExternalIdentifiers.StatusCode() != http.StatusBadRequest {
		t.Fatalf("partial external identifiers status = %d, want %d; body %s", partialExternalIdentifiers.StatusCode(), http.StatusBadRequest, partialExternalIdentifiers.Body)
	}

	missingAccountType, err := client.REST().CreateAccountWithBodyWithResponse(context.Background(), "application/json", apptest.JSONReader(map[string]any{
		"fqn": "checking:MissingType",
	}))
	if err != nil {
		t.Fatalf("missing account type request: %v", err)
	}
	if missingAccountType.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing account type status = %d, want %d; body %s", missingAccountType.StatusCode(), http.StatusBadRequest, missingAccountType.Body)
	}

	invalidAccountType, err := client.REST().CreateAccountWithBodyWithResponse(context.Background(), "application/json", apptest.JSONReader(map[string]any{
		"fqn":          "checking:InvalidType",
		"account_type": "unknown",
	}))
	if err != nil {
		t.Fatalf("invalid account type request: %v", err)
	}
	if invalidAccountType.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid account type status = %d, want %d; body %s", invalidAccountType.StatusCode(), http.StatusBadRequest, invalidAccountType.Body)
	}

	missingHidden, err := client.REST().UpdateAccountWithBodyWithResponse(context.Background(), 1, "application/json", apptest.JSONReader(map[string]any{}))
	if err != nil {
		t.Fatalf("missing hidden request: %v", err)
	}
	if missingHidden.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing hidden status = %d, want %d; body %s", missingHidden.StatusCode(), http.StatusBadRequest, missingHidden.Body)
	}

	badQuery, err := client.REST().ListAccountsWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("include_hidden=maybe"))
	if err != nil {
		t.Fatalf("bad query request: %v", err)
	}
	if badQuery.StatusCode() != http.StatusBadRequest {
		t.Fatalf("bad query status = %d, want %d; body %s", badQuery.StatusCode(), http.StatusBadRequest, badQuery.Body)
	}

	badFeaturedQuery, err := client.REST().ListAccountsWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("is_featured=maybe"))
	if err != nil {
		t.Fatalf("bad featured query request: %v", err)
	}
	if badFeaturedQuery.StatusCode() != http.StatusBadRequest {
		t.Fatalf("bad featured query status = %d, want %d; body %s", badFeaturedQuery.StatusCode(), http.StatusBadRequest, badFeaturedQuery.Body)
	}

	badAccountTypeQuery, err := client.REST().ListAccountsWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("account_type=unknown"))
	if err != nil {
		t.Fatalf("bad account type query request: %v", err)
	}
	if badAccountTypeQuery.StatusCode() != http.StatusBadRequest {
		t.Fatalf("bad account type query status = %d, want %d; body %s", badAccountTypeQuery.StatusCode(), http.StatusBadRequest, badAccountTypeQuery.Body)
	}

	extraField, err := client.REST().CreateAccountWithBodyWithResponse(context.Background(), "application/json", apptest.JSONReader(map[string]any{
		"fqn":          "checking:Chase",
		"account_type": "balance",
		"extraField":   true,
	}))
	if err != nil {
		t.Fatalf("extra field request: %v", err)
	}
	if extraField.StatusCode() != http.StatusBadRequest {
		t.Fatalf("extra field status = %d, want %d; body %s", extraField.StatusCode(), http.StatusBadRequest, extraField.Body)
	}
}

func assertAccountHierarchy(t *testing.T, account httpclient.Account, accountType httpclient.AccountType, parent string, name string, level int) {
	t.Helper()

	if account.AccountType != accountType {
		t.Fatalf("account_type = %q, want %q", account.AccountType, accountType)
	}
	if account.ParentFqn == nil || *account.ParentFqn != parent {
		t.Fatalf("parent_fqn = %v, want %q", account.ParentFqn, parent)
	}
	if account.Name != name {
		t.Fatalf("name = %q, want %q", account.Name, name)
	}
	if account.Level != level {
		t.Fatalf("level = %d, want %d", account.Level, level)
	}
}

func assertAccountIDs(t *testing.T, accounts []httpclient.Account, want []int64) {
	t.Helper()

	if len(accounts) != len(want) {
		t.Fatalf("account count = %d, want %d; accounts = %+v", len(accounts), len(want), accounts)
	}
	for i, account := range accounts {
		if account.AccountId != want[i] {
			t.Fatalf("account id at %d = %d, want %d; accounts = %+v", i, account.AccountId, want[i], accounts)
		}
	}
}

func assertAccountTypes(t *testing.T, accounts []httpclient.Account, want []httpclient.AccountType) {
	t.Helper()

	if len(accounts) != len(want) {
		t.Fatalf("account count = %d, want %d; accounts = %+v", len(accounts), len(want), accounts)
	}
	for i, account := range accounts {
		if account.AccountType != want[i] {
			t.Fatalf("account type at %d = %q, want %q; accounts = %+v", i, account.AccountType, want[i], accounts)
		}
	}
}

func assertAccountFeatured(t *testing.T, accounts []httpclient.Account, want []bool) {
	t.Helper()

	if len(accounts) != len(want) {
		t.Fatalf("account count = %d, want %d; accounts = %+v", len(accounts), len(want), accounts)
	}
	for i, account := range accounts {
		if account.IsFeatured != want[i] {
			t.Fatalf("account is_featured at %d = %t, want %t; accounts = %+v", i, account.IsFeatured, want[i], accounts)
		}
	}
}

func createBalanceTransaction(
	t *testing.T,
	client *apptest.Client,
	balanceAccountID int64,
	counterAccountID int64,
	categoryID int64,
	currency string,
	balanceAmount string,
	counterAmount string,
	postingStatus httpclient.PostingStatus,
) *httpclient.CreateTransactionResponse {
	t.Helper()

	return createBalanceTransactionWithOptionalAmountUSD(
		t,
		client,
		balanceAccountID,
		counterAccountID,
		categoryID,
		currency,
		balanceAmount,
		counterAmount,
		nil,
		nil,
		postingStatus,
	)
}

func createBalanceTransactionWithAmountUSD(
	t *testing.T,
	client *apptest.Client,
	balanceAccountID int64,
	counterAccountID int64,
	categoryID int64,
	currency string,
	balanceAmount string,
	counterAmount string,
	balanceAmountUSD string,
	counterAmountUSD string,
	postingStatus httpclient.PostingStatus,
) *httpclient.CreateTransactionResponse {
	t.Helper()

	return createBalanceTransactionWithOptionalAmountUSD(
		t,
		client,
		balanceAccountID,
		counterAccountID,
		categoryID,
		currency,
		balanceAmount,
		counterAmount,
		&balanceAmountUSD,
		&counterAmountUSD,
		postingStatus,
	)
}

func createBalanceTransactionWithOptionalAmountUSD(
	t *testing.T,
	client *apptest.Client,
	balanceAccountID int64,
	counterAccountID int64,
	categoryID int64,
	currency string,
	balanceAmount string,
	counterAmount string,
	balanceAmountUSD *string,
	counterAmountUSD *string,
	postingStatus httpclient.PostingStatus,
) *httpclient.CreateTransactionResponse {
	t.Helper()

	created, err := client.REST().CreateTransactionWithResponse(context.Background(), httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2024-03-10"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            balanceAccountID,
				Currency:             currency,
				Amount:               balanceAmount,
				AmountUsd:            balanceAmountUSD,
				CategoryId:           categoryID,
				PostingStatus:        postingStatus,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.Manual,
			},
			{
				AccountId:            counterAccountID,
				Currency:             currency,
				Amount:               counterAmount,
				AmountUsd:            counterAmountUSD,
				CategoryId:           categoryID,
				PostingStatus:        postingStatus,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.Manual,
			},
		},
	})
	if err != nil {
		t.Fatalf("create balance transaction request: %v", err)
	}
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create balance transaction status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}

	return created
}

func createCreditLimitHistory(
	t *testing.T,
	client *apptest.Client,
	accountID int64,
	creditLimit string,
	effectiveDate string,
) *httpclient.CreateCreditLimitHistoryResponse {
	t.Helper()

	created, err := client.REST().CreateCreditLimitHistoryWithResponse(context.Background(), accountID, httpclient.CreateCreditLimitHistoryRequest{
		CreditLimit:   creditLimit,
		EffectiveDate: apptest.Date(effectiveDate),
	})
	if err != nil {
		t.Fatalf("create credit limit history request: %v", err)
	}
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create credit limit history status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}

	return created
}

func deleteCreditLimitHistory(t *testing.T, client *apptest.Client, id int64) {
	t.Helper()

	deleted, err := client.REST().DeleteCreditLimitHistoryWithResponse(context.Background(), id)
	if err != nil {
		t.Fatalf("delete credit limit history request: %v", err)
	}
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete credit limit history status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}
}

type wantAccountBalance struct {
	accountID        int64
	currency         string
	current          string
	creditLimit      *string
	currentUSD       string
	posted           string
	unconvertedCount int64
}

func assertAccountBalances(t *testing.T, balances []httpclient.AccountBalance, want []wantAccountBalance) {
	t.Helper()

	if len(balances) != len(want) {
		t.Fatalf("account balance count = %d, want %d; balances = %+v", len(balances), len(want), balances)
	}
	for index, balance := range balances {
		if balance.AccountId != want[index].accountID ||
			balance.Currency != want[index].currency ||
			balance.CurrentBalance != want[index].current ||
			!equalOptionalString(balance.CreditLimit, want[index].creditLimit) ||
			balance.CurrentBalanceUsd != want[index].currentUSD ||
			balance.PostedBalance != want[index].posted ||
			balance.UnconvertedCount != want[index].unconvertedCount {
			t.Fatalf("account balance at %d = %+v, want %+v; balances = %+v", index, balance, want[index], balances)
		}
	}
}

func equalOptionalString(left *string, right *string) bool {
	if left == nil || right == nil {
		return left == right
	}

	return *left == *right
}
