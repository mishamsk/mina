package runtime_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestDictionaryDeleteBlocksActiveJournalRecordReferences(t *testing.T) {
	t.Run("account", func(t *testing.T) {
		client := newSharedClient(t)
		refs := client.Scenario().TransactionRefs()
		client.Scenario().BalancedTransaction(refs)

		response, err := client.REST().DeleteAccountWithResponse(context.Background(), refs.CheckingAccountID)
		if err != nil {
			t.Fatalf("delete account request: %v", err)
		}
		assertDeleteConflict(t, "delete account", response.StatusCode(), response.Body, response.JSON409, "account is referenced by active resources")
		assertAccountActive(t, client, refs.CheckingAccountID)
	})

	t.Run("category", func(t *testing.T) {
		client := newSharedClient(t)
		refs := client.Scenario().TransactionRefs()
		client.Scenario().BalancedTransaction(refs)

		response, err := client.REST().DeleteCategoryWithResponse(context.Background(), refs.CategoryID)
		if err != nil {
			t.Fatalf("delete category request: %v", err)
		}
		assertDeleteConflict(t, "delete category", response.StatusCode(), response.Body, response.JSON409, "category is referenced by active resources")
		assertCategoryActive(t, client, refs.CategoryID)
	})

	t.Run("tag", func(t *testing.T) {
		client := newSharedClient(t)
		refs := client.Scenario().TransactionRefs()
		client.Scenario().BalancedTransaction(refs)

		response, err := client.REST().DeleteTagWithResponse(context.Background(), refs.TagID)
		if err != nil {
			t.Fatalf("delete tag request: %v", err)
		}
		assertDeleteConflict(t, "delete tag", response.StatusCode(), response.Body, response.JSON409, "tag is referenced by active resources")
		assertTagActive(t, client, refs.TagID)
	})

	t.Run("member", func(t *testing.T) {
		client := newSharedClient(t)
		refs := client.Scenario().TransactionRefs()
		client.Scenario().BalancedTransaction(refs)

		response, err := client.REST().DeleteMemberWithResponse(context.Background(), refs.MemberID)
		if err != nil {
			t.Fatalf("delete member request: %v", err)
		}
		assertDeleteConflict(t, "delete member", response.StatusCode(), response.Body, response.JSON409, "member is referenced by active resources")
		assertMemberActive(t, client, refs.MemberID)
	})
}

func TestAccountDeleteBlocksActiveCreditLimitHistoryReferences(t *testing.T) {
	client := newSharedClient(t)
	account := client.Scenario().AccountWithCurrency("credit:GuardedLimit", "USD")

	created, err := client.REST().CreateCreditLimitHistoryWithResponse(context.Background(), account.AccountId, httpclient.CreateCreditLimitHistoryRequest{
		CreditLimit:   "5000",
		EffectiveDate: apptest.Date("2024-01-01"),
	})
	if err != nil {
		t.Fatalf("create credit limit history request: %v", err)
	}
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create credit limit history status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}

	response, err := client.REST().DeleteAccountWithResponse(context.Background(), account.AccountId)
	if err != nil {
		t.Fatalf("delete account request: %v", err)
	}
	assertDeleteConflict(t, "delete account", response.StatusCode(), response.Body, response.JSON409, "account is referenced by active resources")
	assertAccountActive(t, client, account.AccountId)
}

func TestDictionaryDeleteBlocksActiveTransactionTemplateReferences(t *testing.T) {
	t.Run("account", func(t *testing.T) {
		client := newSharedClient(t)
		refs := createGuardedTransactionTemplate(t, client)

		response, err := client.REST().DeleteAccountWithResponse(context.Background(), refs.CheckingAccountID)
		if err != nil {
			t.Fatalf("delete account request: %v", err)
		}
		assertDeleteConflict(t, "delete account", response.StatusCode(), response.Body, response.JSON409, "account is referenced by active resources")
		assertAccountActive(t, client, refs.CheckingAccountID)
	})

	t.Run("category", func(t *testing.T) {
		client := newSharedClient(t)
		refs := createGuardedTransactionTemplate(t, client)

		response, err := client.REST().DeleteCategoryWithResponse(context.Background(), refs.CategoryID)
		if err != nil {
			t.Fatalf("delete category request: %v", err)
		}
		assertDeleteConflict(t, "delete category", response.StatusCode(), response.Body, response.JSON409, "category is referenced by active resources")
		assertCategoryActive(t, client, refs.CategoryID)
	})

	t.Run("tag", func(t *testing.T) {
		client := newSharedClient(t)
		refs := createGuardedTransactionTemplate(t, client)

		response, err := client.REST().DeleteTagWithResponse(context.Background(), refs.TagID)
		if err != nil {
			t.Fatalf("delete tag request: %v", err)
		}
		assertDeleteConflict(t, "delete tag", response.StatusCode(), response.Body, response.JSON409, "tag is referenced by active resources")
		assertTagActive(t, client, refs.TagID)
	})

	t.Run("member", func(t *testing.T) {
		client := newSharedClient(t)
		refs := createGuardedTransactionTemplate(t, client)

		response, err := client.REST().DeleteMemberWithResponse(context.Background(), refs.MemberID)
		if err != nil {
			t.Fatalf("delete member request: %v", err)
		}
		assertDeleteConflict(t, "delete member", response.StatusCode(), response.Body, response.JSON409, "member is referenced by active resources")
		assertMemberActive(t, client, refs.MemberID)
	})
}

func TestDictionaryDeleteAllowsTombstonedTransactionReferences(t *testing.T) {
	client := newSharedClient(t)
	refs := client.Scenario().TransactionRefs()
	transaction := client.Scenario().BalancedTransaction(refs)

	deleted, err := client.REST().DeleteTransactionWithResponse(context.Background(), transaction.TransactionId)
	if err != nil {
		t.Fatalf("delete transaction request: %v", err)
	}
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete transaction status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}

	deleteAccount(t, client, refs.CheckingAccountID)
	deleteCategory(t, client, refs.CategoryID)
	deleteTag(t, client, refs.TagID)
	deleteMember(t, client, refs.MemberID)
}

func TestDictionaryDeleteAllowsTombstonedTransactionRecordsUnderActiveTransaction(t *testing.T) {
	client := newSharedClient(t)
	refs := client.Scenario().TransactionRefs()
	transaction := client.Scenario().BalancedTransaction(refs)
	replacementRefs := replacementTransactionRefs(t, client)

	replaced, err := client.REST().ReplaceTransactionWithResponse(context.Background(), transaction.TransactionId, httpclient.UpdateTransactionRequest{
		InitiatedDate: apptest.Date("2024-01-03"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            replacementRefs.CheckingAccountID,
				Amount:               "-20.00",
				AmountUsd:            apptest.StringPtr("-20.00"),
				CategoryId:           replacementRefs.CategoryID,
				Currency:             "USD",
				MemberId:             &replacementRefs.MemberID,
				PostingStatus:        httpclient.PostingStatusPosted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.ManualSourceManual,
				TagIds:               apptest.Int64SlicePtr(replacementRefs.TagID),
			},
			{
				AccountId:            replacementRefs.MerchantAccountID,
				Amount:               "20.00",
				AmountUsd:            apptest.StringPtr("20.00"),
				CategoryId:           replacementRefs.CategoryID,
				Currency:             "USD",
				PostingStatus:        httpclient.PostingStatusPosted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.ManualSourceManual,
			},
		},
	})
	if err != nil {
		t.Fatalf("replace transaction request: %v", err)
	}
	if replaced.StatusCode() != http.StatusOK {
		t.Fatalf("replace transaction status = %d, want %d; body %s", replaced.StatusCode(), http.StatusOK, replaced.Body)
	}

	deleteAccount(t, client, refs.CheckingAccountID)
	deleteCategory(t, client, refs.CategoryID)
	deleteTag(t, client, refs.TagID)
	deleteMember(t, client, refs.MemberID)
}

func TestDictionaryDeleteAllowsTombstonedTransactionTemplateReferences(t *testing.T) {
	client := newSharedClient(t)
	template := createGuardedTransactionTemplate(t, client)

	deleted, err := client.REST().DeleteTransactionTemplateWithResponse(context.Background(), template.TemplateID)
	if err != nil {
		t.Fatalf("delete transaction template request: %v", err)
	}
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete transaction template status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}

	deleteAccount(t, client, template.CheckingAccountID)
	deleteCategory(t, client, template.CategoryID)
	deleteTag(t, client, template.TagID)
	deleteMember(t, client, template.MemberID)
}

func TestDictionaryDeleteAllowsTombstonedTransactionTemplateRecordsUnderActiveTemplate(t *testing.T) {
	client := newSharedClient(t)
	template := createGuardedTransactionTemplate(t, client)
	replacementRefs := replacementTransactionTemplateRefs(t, client)
	amount := "20.00"
	currency := "USD"
	tags := []int64{replacementRefs.TagID}

	replaced, err := client.REST().ReplaceTransactionTemplateWithResponse(context.Background(), template.TemplateID, httpclient.TransactionTemplateWriteRequest{
		Fqn: "Guarded:Dictionary:References",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{
				AccountId:  &replacementRefs.CheckingAccountID,
				Amount:     &amount,
				CategoryId: replacementRefs.CategoryID,
				Currency:   &currency,
				MemberId:   &replacementRefs.MemberID,
				TagIds:     &tags,
			},
		},
	})
	if err != nil {
		t.Fatalf("replace transaction template request: %v", err)
	}
	if replaced.StatusCode() != http.StatusOK {
		t.Fatalf("replace transaction template status = %d, want %d; body %s", replaced.StatusCode(), http.StatusOK, replaced.Body)
	}

	deleteAccount(t, client, template.CheckingAccountID)
	deleteCategory(t, client, template.CategoryID)
	deleteTag(t, client, template.TagID)
	deleteMember(t, client, template.MemberID)
}

func TestAccountDeleteAllowsTombstonedCreditLimitHistoryReferences(t *testing.T) {
	client := newSharedClient(t)
	account := client.Scenario().AccountWithCurrency("credit:TombstonedGuardedLimit", "USD")

	created, err := client.REST().CreateCreditLimitHistoryWithResponse(context.Background(), account.AccountId, httpclient.CreateCreditLimitHistoryRequest{
		CreditLimit:   "5000",
		EffectiveDate: apptest.Date("2024-01-01"),
	})
	if err != nil {
		t.Fatalf("create credit limit history request: %v", err)
	}
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create credit limit history status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	deleted, err := client.REST().DeleteCreditLimitHistoryWithResponse(context.Background(), created.JSON201.CreditLimitHistoryId)
	if err != nil {
		t.Fatalf("delete credit limit history request: %v", err)
	}
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete credit limit history status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}

	deleteAccount(t, client, account.AccountId)
}

func replacementTransactionRefs(t *testing.T, client *apptest.Client) apptest.TransactionRefs {
	t.Helper()

	scenario := client.Scenario()
	checking := scenario.AccountWithCurrency("checking:Guard:Replacement", "USD")
	merchant := scenario.Account("expense:GuardReplacementMerchant")
	category := scenario.Category("Food:GuardReplacement")
	tag := scenario.Tag("Trips:GuardReplacement")
	member := scenario.Member("Guard Replacement")

	return apptest.TransactionRefs{
		CheckingAccountID: checking.AccountId,
		MerchantAccountID: merchant.AccountId,
		CategoryID:        category.CategoryId,
		TagID:             tag.TagId,
		MemberID:          member.MemberId,
	}
}

func replacementTransactionTemplateRefs(t *testing.T, client *apptest.Client) transactionTemplateRefs {
	t.Helper()

	scenario := client.Scenario()
	checking := scenario.AccountWithCurrency("checking:Template:GuardReplacement", "USD")
	merchant := scenario.Account("expense:TemplateGuardReplacementMerchant")
	category := scenario.Category("Templates:GuardReplacement")
	tag := scenario.Tag("Templates:GuardReplacement")
	member := scenario.Member("Template Guard Replacement")

	return transactionTemplateRefs{
		CheckingAccountID: checking.AccountId,
		MerchantAccountID: merchant.AccountId,
		CategoryID:        category.CategoryId,
		TagID:             tag.TagId,
		MemberID:          member.MemberId,
	}
}

type guardedTransactionTemplate struct {
	transactionTemplateRefs
	TemplateID int64
}

func createGuardedTransactionTemplate(t *testing.T, client *apptest.Client) guardedTransactionTemplate {
	t.Helper()

	refs := createTransactionTemplateRefs(t, client)
	amount := "12.34"
	currency := "USD"
	tags := []int64{refs.TagID}
	template := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "Guarded:Dictionary:References",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{
				AccountId:  &refs.CheckingAccountID,
				Amount:     &amount,
				CategoryId: refs.CategoryID,
				Currency:   &currency,
				MemberId:   &refs.MemberID,
				TagIds:     &tags,
			},
		},
	})

	return guardedTransactionTemplate{
		transactionTemplateRefs: refs,
		TemplateID:              template.JSON201.TransactionTemplateId,
	}
}

func assertDeleteConflict(t *testing.T, label string, status int, body []byte, response *httpclient.Conflict, wantMessage string) {
	t.Helper()

	if status != http.StatusConflict {
		t.Fatalf("%s status = %d, want %d; body %s", label, status, http.StatusConflict, body)
	}
	if response == nil {
		t.Fatalf("%s conflict body = nil; raw body %s", label, body)
	}
	if response.Error.Code != httpclient.APIErrorCodeConflict {
		t.Fatalf("%s code = %q, want %q", label, response.Error.Code, httpclient.APIErrorCodeConflict)
	}
	if response.Error.Message != wantMessage {
		t.Fatalf("%s message = %q, want %q", label, response.Error.Message, wantMessage)
	}
}

func assertAccountActive(t *testing.T, client *apptest.Client, id int64) {
	t.Helper()

	response, err := client.REST().GetAccountWithResponse(context.Background(), id, nil)
	if err != nil {
		t.Fatalf("get account request: %v", err)
	}
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("get account status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	if response.JSON200.TombstonedAt != nil {
		t.Fatalf("account tombstoned_at = %v, want nil", response.JSON200.TombstonedAt)
	}
}

func assertCategoryActive(t *testing.T, client *apptest.Client, id int64) {
	t.Helper()

	response, err := client.REST().GetCategoryWithResponse(context.Background(), id, nil)
	if err != nil {
		t.Fatalf("get category request: %v", err)
	}
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("get category status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	if response.JSON200.TombstonedAt != nil {
		t.Fatalf("category tombstoned_at = %v, want nil", response.JSON200.TombstonedAt)
	}
}

func assertTagActive(t *testing.T, client *apptest.Client, id int64) {
	t.Helper()

	response, err := client.REST().GetTagWithResponse(context.Background(), id, nil)
	if err != nil {
		t.Fatalf("get tag request: %v", err)
	}
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("get tag status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	if response.JSON200.TombstonedAt != nil {
		t.Fatalf("tag tombstoned_at = %v, want nil", response.JSON200.TombstonedAt)
	}
}

func assertMemberActive(t *testing.T, client *apptest.Client, id int64) {
	t.Helper()

	response, err := client.REST().GetMemberWithResponse(context.Background(), id, nil)
	if err != nil {
		t.Fatalf("get member request: %v", err)
	}
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("get member status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	if response.JSON200.TombstonedAt != nil {
		t.Fatalf("member tombstoned_at = %v, want nil", response.JSON200.TombstonedAt)
	}
}
