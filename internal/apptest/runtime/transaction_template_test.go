package runtime_test

import (
	"context"
	"net/http"
	"slices"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

type transactionTemplateRefs struct {
	CheckingAccountID int64
	MerchantAccountID int64
	CategoryID        int64
	TagID             int64
	MemberID          int64
}

func TestTransactionTemplateCreateReadListScenarios(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionTemplateRefs(t, client)

	minimal := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "Utilities:Electric",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID)},
		},
	})
	assertTransactionTemplateHierarchy(t, *minimal.JSON201, "Utilities", "Electric", 1)
	assertRequiredOnlyTemplateRecord(t, minimal.JSON201.Records[0], refs.CategoryID)

	readMinimal := getTransactionTemplate(t, client, minimal.JSON201.TransactionTemplateId)
	assertRequiredOnlyTemplateRecord(t, readMinimal.JSON200.Records[0], refs.CategoryID)

	coffeeMemo := "Coffee default"
	coffeeAmount := "4.25"
	coffeeTags := []int64{refs.TagID}
	partial := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "Food:Coffee",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{
				CategoryId: apptest.Int64Ptr(refs.CategoryID),
				AccountId:  &refs.MerchantAccountID,
				Amount:     &coffeeAmount,
				Memo:       &coffeeMemo,
				TagIds:     &coffeeTags,
			},
		},
	})
	partialRead := getTransactionTemplate(t, client, partial.JSON201.TransactionTemplateId)
	assertPartialTemplateRecord(t, partialRead.JSON200.Records[0], refs, coffeeAmount, coffeeMemo)

	fullMemo := "Unbalanced planning debit"
	creditMemo := "Credit placeholder"
	fullCurrency := "USD"
	debitAmount := "-30"
	creditAmount := "20"
	full := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "Transfers:Planning",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{
				CategoryId: apptest.Int64Ptr(refs.CategoryID),
				AccountId:  &refs.CheckingAccountID,
				MemberId:   &refs.MemberID,
				Currency:   &fullCurrency,
				Amount:     &debitAmount,
				TagIds:     &coffeeTags,
				Memo:       &fullMemo,
			},
			{
				CategoryId: apptest.Int64Ptr(refs.CategoryID),
				AccountId:  &refs.MerchantAccountID,
				Currency:   &fullCurrency,
				Amount:     &creditAmount,
				Memo:       &creditMemo,
			},
		},
	})
	fullRead := getTransactionTemplate(t, client, full.JSON201.TransactionTemplateId)
	if len(fullRead.JSON200.Records) != 2 {
		t.Fatalf("full template record count = %d, want 2; body %+v", len(fullRead.JSON200.Records), fullRead.JSON200)
	}
	assertRichTemplateRecord(t, fullRead.JSON200.Records[0], refs, debitAmount, fullMemo)
	if fullRead.JSON200.Records[1].Amount == nil || *fullRead.JSON200.Records[1].Amount != "20.00000000" {
		t.Fatalf("second amount = %v, want 20.00000000", fullRead.JSON200.Records[1].Amount)
	}

	list, err := client.REST().ListTransactionTemplatesWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("list request: %v", err)
	}
	if list.StatusCode() != http.StatusOK {
		t.Fatalf("list status = %d, want %d; body %s", list.StatusCode(), http.StatusOK, list.Body)
	}
	assertTransactionTemplateIDs(t, list.JSON200.TransactionTemplates, []int64{
		partial.JSON201.TransactionTemplateId,
		full.JSON201.TransactionTemplateId,
		minimal.JSON201.TransactionTemplateId,
	})
	if list.JSON200.TotalCount != 3 {
		t.Fatalf("transaction template list total_count = %d, want 3", list.JSON200.TotalCount)
	}
	minimalListIndex := slices.IndexFunc(list.JSON200.TransactionTemplates, func(template httpclient.TransactionTemplate) bool {
		return template.TransactionTemplateId == minimal.JSON201.TransactionTemplateId
	})
	if minimalListIndex < 0 {
		t.Fatalf("minimal template id %d missing from list", minimal.JSON201.TransactionTemplateId)
	}
	if len(list.JSON200.TransactionTemplates[minimalListIndex].Records) != 1 {
		t.Fatalf("minimal list record count = %d, want 1; body %+v", len(list.JSON200.TransactionTemplates[minimalListIndex].Records), list.JSON200.TransactionTemplates[minimalListIndex])
	}
	assertRequiredOnlyTemplateRecord(t, list.JSON200.TransactionTemplates[minimalListIndex].Records[0], refs.CategoryID)

	descPage, err := client.REST().ListTransactionTemplatesWithResponse(
		context.Background(),
		nil,
		apptest.ReplaceRawQuery("sort=fqn&sort_dir=desc&limit=2&offset=1"),
	)
	if err != nil {
		t.Fatalf("desc page request: %v", err)
	}
	if descPage.StatusCode() != http.StatusOK {
		t.Fatalf("desc page status = %d, want %d; body %s", descPage.StatusCode(), http.StatusOK, descPage.Body)
	}
	assertTransactionTemplateIDs(t, descPage.JSON200.TransactionTemplates, []int64{
		full.JSON201.TransactionTemplateId,
		partial.JSON201.TransactionTemplateId,
	})
	if descPage.JSON200.TotalCount != 3 {
		t.Fatalf("transaction template page total_count = %d, want 3", descPage.JSON200.TotalCount)
	}

	deleted, err := client.REST().DeleteTransactionTemplateWithResponse(context.Background(), minimal.JSON201.TransactionTemplateId)
	if err != nil {
		t.Fatalf("delete listed template request: %v", err)
	}
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete listed template status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}
	afterDeleteList, err := client.REST().ListTransactionTemplatesWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("list after delete request: %v", err)
	}
	if afterDeleteList.StatusCode() != http.StatusOK {
		t.Fatalf("list after delete status = %d, want %d; body %s", afterDeleteList.StatusCode(), http.StatusOK, afterDeleteList.Body)
	}
	assertTransactionTemplateIDs(t, afterDeleteList.JSON200.TransactionTemplates, []int64{
		partial.JSON201.TransactionTemplateId,
		full.JSON201.TransactionTemplateId,
	})
}

func TestTransactionTemplateDerivedShorthandCompatibilities(t *testing.T) {
	client := newSharedClient(t)
	fixture := newSemanticFixture(t, client)
	tag := client.Scenario().Tag("Templates:Shorthand")
	member := client.Scenario().Member("Template Shorthand Member")
	systems := fixedSystemAccounts(t, client)
	memo := "Shared template defaults"
	tags := []int64{tag.TagId}
	currencyUSD := "USD"
	currencyEUR := "EUR"
	record := func(accountID int64, categoryID *int64, currency, amount string) httpclient.TransactionTemplateRecordRequest {
		return httpclient.TransactionTemplateRecordRequest{
			AccountId:  &accountID,
			CategoryId: categoryID,
			Currency:   &currency,
			Amount:     &amount,
			MemberId:   &member.MemberId,
			TagIds:     &tags,
			Memo:       &memo,
		}
	}

	created := map[string]httpclient.TransactionTemplate{}
	create := func(name string, records []httpclient.TransactionTemplateRecordRequest) httpclient.TransactionTemplate {
		t.Helper()
		response := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
			Fqn:     "Shorthand:" + name,
			Records: records,
		})
		created[name] = *response.JSON201
		return *response.JSON201
	}

	spend := create("Spend", []httpclient.TransactionTemplateRecordRequest{
		record(fixture.checking.AccountId, nil, currencyUSD, "-12"),
		record(fixture.restaurant.AccountId, &fixture.expense.CategoryId, currencyUSD, "5"),
		record(fixture.supermarket.AccountId, &fixture.groceries.CategoryId, currencyUSD, "7"),
	})
	assertTemplateCompatibleShorthands(t, spend, []httpclient.TransactionTemplateShorthandType{httpclient.Spend}, "create spend")

	sparseSpendRecords := []httpclient.TransactionTemplateRecordRequest{
		record(fixture.checking.AccountId, nil, currencyUSD, "-12"),
		record(fixture.restaurant.AccountId, &fixture.expense.CategoryId, currencyUSD, "12"),
	}
	sparseSpendRecords[1].MemberId = nil
	sparseSpendRecords[1].Memo = nil
	sparseSpend := create("Sparse spend metadata", sparseSpendRecords)
	assertTemplateCompatibleShorthands(t, sparseSpend, []httpclient.TransactionTemplateShorthandType{httpclient.Spend}, "create sparse spend metadata")

	emptyMemo := ""
	emptyMemoRecords := []httpclient.TransactionTemplateRecordRequest{
		record(fixture.checking.AccountId, nil, currencyUSD, "-4"),
		record(fixture.restaurant.AccountId, &fixture.expense.CategoryId, currencyUSD, "4"),
	}
	for index := range emptyMemoRecords {
		emptyMemoRecords[index].Memo = &emptyMemo
	}
	emptyMemoSpend := create("Empty memo", emptyMemoRecords)
	assertTemplateCompatibleShorthands(t, emptyMemoSpend, []httpclient.TransactionTemplateShorthandType{httpclient.Spend}, "create empty memo spend")

	income := create("Income", []httpclient.TransactionTemplateRecordRequest{
		record(fixture.employer.AccountId, &fixture.salary.CategoryId, currencyUSD, "-100"),
		record(fixture.checking.AccountId, nil, currencyUSD, "100"),
	})
	assertTemplateCompatibleShorthands(t, income, []httpclient.TransactionTemplateShorthandType{httpclient.Income}, "create income")

	refund := create("Refund", []httpclient.TransactionTemplateRecordRequest{
		record(fixture.restaurant.AccountId, &fixture.expense.CategoryId, currencyUSD, "-20"),
		record(fixture.checking.AccountId, nil, currencyUSD, "20"),
	})
	assertTemplateCompatibleShorthands(t, refund, []httpclient.TransactionTemplateShorthandType{httpclient.Refund}, "create refund")

	transfer := create("Transfer", []httpclient.TransactionTemplateRecordRequest{
		record(fixture.checking.AccountId, nil, currencyUSD, "-105"),
		record(fixture.savings.AccountId, nil, currencyUSD, "100"),
		record(fixture.fees.AccountId, &fixture.feesCategory.CategoryId, currencyUSD, "5"),
	})
	assertTemplateCompatibleShorthands(t, transfer, []httpclient.TransactionTemplateShorthandType{httpclient.Transfer}, "create charged transfer")

	partialChargedTransferRecords := []httpclient.TransactionTemplateRecordRequest{
		record(fixture.checking.AccountId, nil, currencyUSD, "-105"),
		record(fixture.savings.AccountId, nil, currencyUSD, "100"),
		record(fixture.fees.AccountId, &fixture.feesCategory.CategoryId, currencyUSD, "5"),
	}
	partialChargedTransferRecords[2].Amount = nil
	partialChargedTransfer := create("Partial charged transfer", partialChargedTransferRecords)
	assertTemplateCompatibleShorthands(t, partialChargedTransfer, []httpclient.TransactionTemplateShorthandType{httpclient.Transfer}, "create charged transfer without charge amount")

	party := client.Scenario().AccountWithType("people:Templates:Jordan", httpclient.WritableAccountTypeParty)
	partyTransfer := create("Party transfer", []httpclient.TransactionTemplateRecordRequest{
		record(fixture.checking.AccountId, nil, currencyUSD, "-105"),
		record(party.AccountId, nil, currencyUSD, "100"),
		record(fixture.fees.AccountId, &fixture.feesCategory.CategoryId, currencyUSD, "5"),
	})
	assertTemplateCompatibleShorthands(t, partyTransfer, []httpclient.TransactionTemplateShorthandType{httpclient.Transfer}, "create charged transfer to party")

	ordinaryTransfer := create("Ordinary transfer", []httpclient.TransactionTemplateRecordRequest{
		record(fixture.checking.AccountId, nil, currencyUSD, "-80"),
		record(fixture.savings.AccountId, nil, currencyUSD, "80"),
	})
	assertTemplateCompatibleShorthands(t, ordinaryTransfer, []httpclient.TransactionTemplateShorthandType{httpclient.Transfer}, "create transfer")

	exchange := create("Exchange", []httpclient.TransactionTemplateRecordRequest{
		record(fixture.checking.AccountId, nil, currencyUSD, "-110"),
		record(systems["system:exchange"].AccountId, nil, currencyUSD, "110"),
		record(fixture.cashEUR.AccountId, nil, currencyEUR, "100"),
		record(systems["system:exchange"].AccountId, nil, currencyEUR, "-100"),
	})
	assertTemplateCompatibleShorthands(t, exchange, nil, "create exchange")

	amountlessExpenseRecords := []httpclient.TransactionTemplateRecordRequest{
		record(fixture.checking.AccountId, nil, currencyUSD, "-20"),
		record(fixture.restaurant.AccountId, &fixture.expense.CategoryId, currencyUSD, "20"),
	}
	for index := range amountlessExpenseRecords {
		amountlessExpenseRecords[index].Amount = nil
		amountlessExpenseRecords[index].Currency = nil
	}
	amountlessExpense := create("Amountless expense", amountlessExpenseRecords)
	assertTemplateCompatibleShorthands(
		t,
		amountlessExpense,
		[]httpclient.TransactionTemplateShorthandType{httpclient.Spend, httpclient.Refund},
		"amountless expense",
	)

	amountlessMultiMerchantRecords := []httpclient.TransactionTemplateRecordRequest{
		record(fixture.checking.AccountId, nil, currencyUSD, "-12"),
		record(fixture.restaurant.AccountId, &fixture.expense.CategoryId, currencyUSD, "5"),
		record(fixture.supermarket.AccountId, &fixture.groceries.CategoryId, currencyUSD, "7"),
	}
	for index := range amountlessMultiMerchantRecords {
		amountlessMultiMerchantRecords[index].Amount = nil
	}
	amountlessMultiMerchant := create("Amountless multi-merchant expense", amountlessMultiMerchantRecords)
	assertTemplateCompatibleShorthands(
		t,
		amountlessMultiMerchant,
		[]httpclient.TransactionTemplateShorthandType{httpclient.Spend},
		"amountless multi-merchant expense",
	)

	partlyFilledExpenseRecords := []httpclient.TransactionTemplateRecordRequest{
		record(fixture.checking.AccountId, nil, currencyUSD, "20"),
		record(fixture.restaurant.AccountId, &fixture.expense.CategoryId, currencyUSD, "-20"),
	}
	partlyFilledExpenseRecords[1].Amount = nil
	partlyFilledExpense := create("Partly filled expense", partlyFilledExpenseRecords)
	assertTemplateCompatibleShorthands(
		t,
		partlyFilledExpense,
		[]httpclient.TransactionTemplateShorthandType{httpclient.Spend, httpclient.Refund},
		"partly filled expense ignores all amounts",
	)

	amountlessIncomeRecords := []httpclient.TransactionTemplateRecordRequest{
		record(fixture.employer.AccountId, &fixture.salary.CategoryId, currencyUSD, "-100"),
		record(fixture.checking.AccountId, nil, currencyUSD, "100"),
	}
	for index := range amountlessIncomeRecords {
		amountlessIncomeRecords[index].Amount = nil
		amountlessIncomeRecords[index].Currency = nil
	}
	amountlessIncome := create("Amountless income", amountlessIncomeRecords)
	assertTemplateCompatibleShorthands(t, amountlessIncome, []httpclient.TransactionTemplateShorthandType{httpclient.Income}, "amountless income")

	partlyFilledIncomeRecords := []httpclient.TransactionTemplateRecordRequest{
		record(fixture.employer.AccountId, &fixture.salary.CategoryId, currencyUSD, "-100"),
		record(fixture.checking.AccountId, nil, currencyUSD, "100"),
	}
	partlyFilledIncomeRecords[1].Amount = nil
	partlyFilledIncome := create("Partly filled income", partlyFilledIncomeRecords)
	assertTemplateCompatibleShorthands(t, partlyFilledIncome, []httpclient.TransactionTemplateShorthandType{httpclient.Income}, "partly filled income ignores all amounts")

	amountlessTransferRecords := []httpclient.TransactionTemplateRecordRequest{
		record(fixture.checking.AccountId, nil, currencyUSD, "-80"),
		record(fixture.savings.AccountId, nil, currencyUSD, "80"),
	}
	for index := range amountlessTransferRecords {
		amountlessTransferRecords[index].Amount = nil
	}
	amountlessTransfer := create("Amountless transfer", amountlessTransferRecords)
	assertTemplateCompatibleShorthands(t, amountlessTransfer, nil, "amountless transfer")

	partlyFilledTransferRecords := []httpclient.TransactionTemplateRecordRequest{
		record(fixture.checking.AccountId, nil, currencyUSD, "-80"),
		record(fixture.savings.AccountId, nil, currencyUSD, "80"),
	}
	partlyFilledTransferRecords[1].Amount = nil
	partlyFilledTransfer := create("Partly filled transfer", partlyFilledTransferRecords)
	assertTemplateCompatibleShorthands(t, partlyFilledTransfer, nil, "partly filled transfer requires both directional amounts")

	for name, template := range created {
		read := getTransactionTemplate(t, client, template.TransactionTemplateId)
		assertTemplateCompatibleShorthands(t, *read.JSON200, template.CompatibleShorthands, "get "+name)
	}
	list, err := client.REST().ListTransactionTemplatesWithResponse(context.Background(), nil)
	if err != nil || list.StatusCode() != http.StatusOK {
		t.Fatalf("list shorthand templates status = %d, err = %v; body %s", list.StatusCode(), err, list.Body)
	}
	for name, template := range created {
		index := slices.IndexFunc(list.JSON200.TransactionTemplates, func(candidate httpclient.TransactionTemplate) bool {
			return candidate.TransactionTemplateId == template.TransactionTemplateId
		})
		if index < 0 {
			t.Fatalf("list missing %s template id %d", name, template.TransactionTemplateId)
		}
		assertTemplateCompatibleShorthands(t, list.JSON200.TransactionTemplates[index], template.CompatibleShorthands, "list "+name)
	}

	replaced, err := client.REST().ReplaceTransactionTemplateWithResponse(context.Background(), transfer.TransactionTemplateId, httpclient.TransactionTemplateWriteRequest{
		Fqn: "Shorthand:Transfer",
		Records: []httpclient.TransactionTemplateRecordRequest{
			record(fixture.employer.AccountId, &fixture.salary.CategoryId, currencyUSD, "-75"),
			record(fixture.savings.AccountId, nil, currencyUSD, "75"),
		},
	})
	if err != nil || replaced.StatusCode() != http.StatusOK {
		t.Fatalf("replace shorthand template status = %d, err = %v; body %s", replaced.StatusCode(), err, replaced.Body)
	}
	assertTemplateCompatibleShorthands(t, *replaced.JSON200, []httpclient.TransactionTemplateShorthandType{httpclient.Income}, "replace")
	assertTemplateCompatibleShorthands(t, *getTransactionTemplate(t, client, transfer.TransactionTemplateId).JSON200, []httpclient.TransactionTemplateShorthandType{httpclient.Income}, "get after replace")

	owned := httpclient.WritableAccountTypeOwned
	updated, err := client.REST().UpdateAccountWithResponse(context.Background(), fixture.restaurant.AccountId, httpclient.UpdateAccountRequest{AccountType: &owned})
	if err != nil || updated.StatusCode() != http.StatusOK {
		t.Fatalf("update shorthand reference semantics status = %d, err = %v; body %s", updated.StatusCode(), err, updated.Body)
	}
	assertTemplateCompatibleShorthands(t, *getTransactionTemplate(t, client, spend.TransactionTemplateId).JSON200, nil, "account semantic change")
}

func TestTransactionTemplateShorthandConservativeNoMatch(t *testing.T) {
	client := newSharedClient(t)
	fixture := newSemanticFixture(t, client)
	systems := fixedSystemAccounts(t, client)
	usd := "USD"
	eur := "EUR"
	record := func(accountID int64, categoryID *int64, currency, amount string) httpclient.TransactionTemplateRecordRequest {
		return httpclient.TransactionTemplateRecordRequest{AccountId: &accountID, CategoryId: categoryID, Currency: &currency, Amount: &amount}
	}

	tests := []struct {
		name    string
		records []httpclient.TransactionTemplateRecordRequest
	}{
		{name: "insufficient", records: []httpclient.TransactionTemplateRecordRequest{{CategoryId: &fixture.expense.CategoryId}}},
		{name: "account currency mismatch", records: []httpclient.TransactionTemplateRecordRequest{
			record(fixture.checking.AccountId, nil, eur, "-10"),
			record(fixture.restaurant.AccountId, &fixture.expense.CategoryId, eur, "10"),
		}},
		{name: "category intent mismatch", records: []httpclient.TransactionTemplateRecordRequest{
			record(fixture.checking.AccountId, nil, usd, "-10"),
			record(fixture.employer.AccountId, &fixture.salary.CategoryId, usd, "10"),
		}},
		{name: "lossy imbalance", records: []httpclient.TransactionTemplateRecordRequest{
			record(fixture.checking.AccountId, nil, usd, "-9"),
			record(fixture.restaurant.AccountId, &fixture.expense.CategoryId, usd, "10"),
		}},
		{name: "ambiguous balances", records: []httpclient.TransactionTemplateRecordRequest{
			record(fixture.checking.AccountId, nil, usd, "-10"),
			record(fixture.savings.AccountId, nil, usd, "5"),
			record(fixture.cash.AccountId, nil, usd, "5"),
		}},
		{name: "mixed", records: []httpclient.TransactionTemplateRecordRequest{
			record(fixture.restaurant.AccountId, &fixture.expense.CategoryId, usd, "5"),
			record(fixture.employer.AccountId, &fixture.salary.CategoryId, usd, "-5"),
		}},
		{name: "adjustment", records: []httpclient.TransactionTemplateRecordRequest{
			record(fixture.checking.AccountId, nil, usd, "10"),
			record(systems["system:correction"].AccountId, nil, usd, "-10"),
		}},
		{name: "clawback", records: []httpclient.TransactionTemplateRecordRequest{
			record(fixture.checking.AccountId, nil, usd, "-10"),
			record(fixture.employer.AccountId, &fixture.salary.CategoryId, usd, "10"),
		}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			created := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
				Fqn:     "NoMatch:" + test.name,
				Records: test.records,
			})
			assertTemplateCompatibleShorthands(t, *created.JSON201, nil, "create")
			read := getTransactionTemplate(t, client, created.JSON201.TransactionTemplateId)
			assertTemplateCompatibleShorthands(t, *read.JSON200, nil, "get")
		})
	}

	firstMemo := "first"
	secondMemo := "second"
	nonuniform := []httpclient.TransactionTemplateRecordRequest{
		record(fixture.checking.AccountId, nil, usd, "-10"),
		record(fixture.restaurant.AccountId, &fixture.expense.CategoryId, usd, "10"),
	}
	nonuniform[0].Memo = &firstMemo
	nonuniform[1].Memo = &secondMemo
	created := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{Fqn: "NoMatch:nonuniform defaults", Records: nonuniform})
	assertTemplateCompatibleShorthands(t, *created.JSON201, nil, "nonuniform memo")

	firstMember := client.Scenario().Member("First nonuniform template member")
	secondMember := client.Scenario().Member("Second nonuniform template member")
	nonuniformMembers := []httpclient.TransactionTemplateRecordRequest{
		record(fixture.checking.AccountId, nil, usd, "-10"),
		record(fixture.restaurant.AccountId, &fixture.expense.CategoryId, usd, "10"),
	}
	nonuniformMembers[0].MemberId = &firstMember.MemberId
	nonuniformMembers[1].MemberId = &secondMember.MemberId
	created = createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{Fqn: "NoMatch:nonuniform members", Records: nonuniformMembers})
	assertTemplateCompatibleShorthands(t, *created.JSON201, nil, "nonuniform member")

	firstTag := client.Scenario().Tag("Templates:Nonuniform:First")
	secondTag := client.Scenario().Tag("Templates:Nonuniform:Second")
	firstTags := []int64{firstTag.TagId}
	secondTags := []int64{secondTag.TagId}
	nonuniformTags := []httpclient.TransactionTemplateRecordRequest{
		record(fixture.checking.AccountId, nil, usd, "-10"),
		record(fixture.restaurant.AccountId, &fixture.expense.CategoryId, usd, "10"),
	}
	nonuniformTags[0].TagIds = &firstTags
	nonuniformTags[1].TagIds = &secondTags
	created = createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{Fqn: "NoMatch:nonuniform tags", Records: nonuniformTags})
	assertTemplateCompatibleShorthands(t, *created.JSON201, nil, "nonuniform tags")
}

func assertTemplateCompatibleShorthands(t *testing.T, template httpclient.TransactionTemplate, want []httpclient.TransactionTemplateShorthandType, label string) {
	t.Helper()
	if template.CompatibleShorthands == nil {
		t.Fatalf("%s compatible shorthands = nil, want required array", label)
	}
	if !slices.Equal(template.CompatibleShorthands, want) {
		t.Fatalf("%s compatible shorthands = %v, want %v", label, template.CompatibleShorthands, want)
	}
}

func TestTransactionTemplateReplaceDeleteAndDuplicateFQN(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionTemplateRefs(t, client)

	original := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "Bills:Power",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID)},
			{CategoryId: apptest.Int64Ptr(refs.CategoryID), AccountId: &refs.MerchantAccountID},
		},
	})
	originalRecordIDs := transactionTemplateRecordIDs(original.JSON201.Records)

	duplicate, err := client.REST().CreateTransactionTemplateWithResponse(context.Background(), httpclient.TransactionTemplateWriteRequest{
		Fqn: "Bills:Power",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID)},
		},
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

	changedFQNReplace, err := client.REST().ReplaceTransactionTemplateWithResponse(context.Background(), original.JSON201.TransactionTemplateId, httpclient.TransactionTemplateWriteRequest{
		Fqn: "Bills:Existing",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID)},
		},
	})
	if err != nil {
		t.Fatalf("changed fqn replace request: %v", err)
	}
	if changedFQNReplace.StatusCode() != http.StatusBadRequest {
		t.Fatalf("changed fqn replace status = %d, want %d; body %s", changedFQNReplace.StatusCode(), http.StatusBadRequest, changedFQNReplace.Body)
	}
	if changedFQNReplace.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("changed fqn replace code = %q, want %q", changedFQNReplace.JSON400.Error.Code, httpclient.APIErrorCodeInvalidRequest)
	}
	assertTransactionTemplateUnchanged(t, client, original.JSON201.TransactionTemplateId, "Bills:Power", originalRecordIDs)

	emptyRecordsReplace, err := client.REST().ReplaceTransactionTemplateWithBodyWithResponse(
		context.Background(),
		original.JSON201.TransactionTemplateId,
		"application/json",
		apptest.JSONReader(map[string]any{
			"fqn":     "Bills:Power:EmptyRecords",
			"records": []map[string]any{},
		}),
	)
	if err != nil {
		t.Fatalf("empty records replace request: %v", err)
	}
	if emptyRecordsReplace.StatusCode() != http.StatusBadRequest {
		t.Fatalf("empty records replace status = %d, want %d; body %s", emptyRecordsReplace.StatusCode(), http.StatusBadRequest, emptyRecordsReplace.Body)
	}
	assertTransactionTemplateUnchanged(t, client, original.JSON201.TransactionTemplateId, "Bills:Power", originalRecordIDs)

	missingCategoryReplace, err := client.REST().ReplaceTransactionTemplateWithResponse(context.Background(), original.JSON201.TransactionTemplateId, httpclient.TransactionTemplateWriteRequest{
		Fqn: "Bills:Power",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID + 9999)},
		},
	})
	if err != nil {
		t.Fatalf("missing category replace request: %v", err)
	}
	if missingCategoryReplace.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing category replace status = %d, want %d; body %s", missingCategoryReplace.StatusCode(), http.StatusBadRequest, missingCategoryReplace.Body)
	}
	assertTransactionTemplateUnchanged(t, client, original.JSON201.TransactionTemplateId, "Bills:Power", originalRecordIDs)

	missingTemplateReplace, err := client.REST().ReplaceTransactionTemplateWithResponse(context.Background(), original.JSON201.TransactionTemplateId+9999, httpclient.TransactionTemplateWriteRequest{
		Fqn: "Bills:Power",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID + 9999)},
		},
	})
	if err != nil {
		t.Fatalf("missing template replace request: %v", err)
	}
	if missingTemplateReplace.StatusCode() != http.StatusNotFound {
		t.Fatalf("missing template replace status = %d, want %d; body %s", missingTemplateReplace.StatusCode(), http.StatusNotFound, missingTemplateReplace.Body)
	}

	amount := "42"
	replaced, err := client.REST().ReplaceTransactionTemplateWithResponse(context.Background(), original.JSON201.TransactionTemplateId, httpclient.TransactionTemplateWriteRequest{
		Fqn: "Bills:Power",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{
				CategoryId: apptest.Int64Ptr(refs.CategoryID),
				AccountId:  &refs.CheckingAccountID,
				Amount:     &amount,
			},
		},
	})
	if err != nil {
		t.Fatalf("replace request: %v", err)
	}
	if replaced.StatusCode() != http.StatusOK {
		t.Fatalf("replace status = %d, want %d; body %s", replaced.StatusCode(), http.StatusOK, replaced.Body)
	}
	if len(replaced.JSON200.Records) != 1 {
		t.Fatalf("replace record count = %d, want 1; body %+v", len(replaced.JSON200.Records), replaced.JSON200)
	}
	replacementRecordID := replaced.JSON200.Records[0].TransactionTemplateRecordId
	if slices.Contains(originalRecordIDs, replacementRecordID) {
		t.Fatalf("replacement record id %d was present in old active records %v", replacementRecordID, originalRecordIDs)
	}
	assertTransactionTemplateHierarchy(t, *replaced.JSON200, "Bills", "Power", 1)

	read := getTransactionTemplate(t, client, original.JSON201.TransactionTemplateId)
	if read.JSON200.Fqn != "Bills:Power" || len(read.JSON200.Records) != 1 {
		t.Fatalf("read replaced template = %+v, want same fqn with one active record", read.JSON200)
	}
	if slices.Contains(originalRecordIDs, read.JSON200.Records[0].TransactionTemplateRecordId) {
		t.Fatalf("read returned tombstoned record id %d", read.JSON200.Records[0].TransactionTemplateRecordId)
	}

	deleted, err := client.REST().DeleteTransactionTemplateWithResponse(context.Background(), original.JSON201.TransactionTemplateId)
	if err != nil {
		t.Fatalf("delete request: %v", err)
	}
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}
	missing, err := client.REST().GetTransactionTemplateWithResponse(context.Background(), original.JSON201.TransactionTemplateId)
	if err != nil {
		t.Fatalf("get deleted request: %v", err)
	}
	if missing.StatusCode() != http.StatusNotFound {
		t.Fatalf("get deleted status = %d, want %d; body %s", missing.StatusCode(), http.StatusNotFound, missing.Body)
	}

	recreated := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "Bills:Power",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID)},
		},
	})
	if recreated.JSON201.TransactionTemplateId == original.JSON201.TransactionTemplateId {
		t.Fatalf("recreated id = %d, want a new template id", recreated.JSON201.TransactionTemplateId)
	}
}

func TestTransactionTemplateRejectsHierarchyFQNConflict(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionTemplateRefs(t, client)

	createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "TemplateHierarchy:Leaf",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID)},
		},
	})
	extendsLeaf, err := client.REST().CreateTransactionTemplateWithResponse(context.Background(), httpclient.TransactionTemplateWriteRequest{
		Fqn: "TemplateHierarchy:Leaf:Child",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID)},
		},
	})
	if err != nil {
		t.Fatalf("extends leaf request: %v", err)
	}
	if extendsLeaf.StatusCode() != http.StatusConflict {
		t.Fatalf("extends leaf status = %d, want %d; body %s", extendsLeaf.StatusCode(), http.StatusConflict, extendsLeaf.Body)
	}
	if extendsLeaf.JSON409.Error.Code != httpclient.APIErrorCodeConflict {
		t.Fatalf("extends leaf code = %q, want %q", extendsLeaf.JSON409.Error.Code, httpclient.APIErrorCodeConflict)
	}

	createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "TemplateHierarchy:Group:Child",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID)},
		},
	})
	prefixesChild, err := client.REST().CreateTransactionTemplateWithResponse(context.Background(), httpclient.TransactionTemplateWriteRequest{
		Fqn: "TemplateHierarchy:Group",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID)},
		},
	})
	if err != nil {
		t.Fatalf("prefixes child request: %v", err)
	}
	if prefixesChild.StatusCode() != http.StatusConflict {
		t.Fatalf("prefixes child status = %d, want %d; body %s", prefixesChild.StatusCode(), http.StatusConflict, prefixesChild.Body)
	}
	if prefixesChild.JSON409.Error.Code != httpclient.APIErrorCodeConflict {
		t.Fatalf("prefixes child code = %q, want %q", prefixesChild.JSON409.Error.Code, httpclient.APIErrorCodeConflict)
	}

	original := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "TemplateHierarchy:Replace",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID)},
		},
	})
	originalRecordIDs := transactionTemplateRecordIDs(original.JSON201.Records)
	changedToGroupPathReplace, err := client.REST().ReplaceTransactionTemplateWithResponse(context.Background(), original.JSON201.TransactionTemplateId, httpclient.TransactionTemplateWriteRequest{
		Fqn: "TemplateHierarchy:Group",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID)},
		},
	})
	if err != nil {
		t.Fatalf("changed to group path replace request: %v", err)
	}
	if changedToGroupPathReplace.StatusCode() != http.StatusBadRequest {
		t.Fatalf("changed to group path replace status = %d, want %d; body %s", changedToGroupPathReplace.StatusCode(), http.StatusBadRequest, changedToGroupPathReplace.Body)
	}
	if changedToGroupPathReplace.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("changed to group path replace code = %q, want %q", changedToGroupPathReplace.JSON400.Error.Code, httpclient.APIErrorCodeInvalidRequest)
	}
	assertTransactionTemplateUnchanged(t, client, original.JSON201.TransactionTemplateId, "TemplateHierarchy:Replace", originalRecordIDs)

	changedToLeafChildReplace, err := client.REST().ReplaceTransactionTemplateWithResponse(context.Background(), original.JSON201.TransactionTemplateId, httpclient.TransactionTemplateWriteRequest{
		Fqn: "TemplateHierarchy:Leaf:Child",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID)},
		},
	})
	if err != nil {
		t.Fatalf("changed to leaf child replace request: %v", err)
	}
	if changedToLeafChildReplace.StatusCode() != http.StatusBadRequest {
		t.Fatalf("changed to leaf child replace status = %d, want %d; body %s", changedToLeafChildReplace.StatusCode(), http.StatusBadRequest, changedToLeafChildReplace.Body)
	}
	if changedToLeafChildReplace.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("changed to leaf child replace code = %q, want %q", changedToLeafChildReplace.JSON400.Error.Code, httpclient.APIErrorCodeInvalidRequest)
	}
	assertTransactionTemplateUnchanged(t, client, original.JSON201.TransactionTemplateId, "TemplateHierarchy:Replace", originalRecordIDs)

	amount := "7.50"
	unchangedFQNReplace, err := client.REST().ReplaceTransactionTemplateWithResponse(context.Background(), original.JSON201.TransactionTemplateId, httpclient.TransactionTemplateWriteRequest{
		Fqn: "TemplateHierarchy:Replace",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID), Amount: &amount},
			{CategoryId: apptest.Int64Ptr(refs.CategoryID), AccountId: &refs.MerchantAccountID},
		},
	})
	if err != nil {
		t.Fatalf("unchanged fqn replace request: %v", err)
	}
	if unchangedFQNReplace.StatusCode() != http.StatusOK {
		t.Fatalf("unchanged fqn replace status = %d, want %d; body %s", unchangedFQNReplace.StatusCode(), http.StatusOK, unchangedFQNReplace.Body)
	}
	if unchangedFQNReplace.JSON200.Fqn != "TemplateHierarchy:Replace" {
		t.Fatalf("unchanged fqn replace fqn = %q, want TemplateHierarchy:Replace", unchangedFQNReplace.JSON200.Fqn)
	}
	if len(unchangedFQNReplace.JSON200.Records) != 2 {
		t.Fatalf("unchanged fqn replace record count = %d, want 2; body %+v", len(unchangedFQNReplace.JSON200.Records), unchangedFQNReplace.JSON200)
	}
	if slices.Equal(transactionTemplateRecordIDs(unchangedFQNReplace.JSON200.Records), originalRecordIDs) {
		t.Fatalf("unchanged fqn replace kept original records %v", originalRecordIDs)
	}
}

func TestTransactionTemplateAllowsHierarchyLookalikeBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionTemplateRefs(t, client)

	createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "TemplateHierarchyLookalike:Leaf",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID)},
		},
	})

	lookalike, err := client.REST().CreateTransactionTemplateWithResponse(context.Background(), httpclient.TransactionTemplateWriteRequest{
		Fqn: "TemplateHierarchyLookalike:Leafish:Child",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID)},
		},
	})
	if err != nil {
		t.Fatalf("lookalike create request: %v", err)
	}
	if lookalike.StatusCode() != http.StatusCreated {
		t.Fatalf("lookalike create status = %d, want %d; body %s", lookalike.StatusCode(), http.StatusCreated, lookalike.Body)
	}
}

func TestTransactionTemplateAllowsHierarchyPrefixReuseAfterTombstone(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionTemplateRefs(t, client)

	leaf := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "TombstonedTemplateHierarchy:Leaf",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID)},
		},
	})
	deleteTransactionTemplateForRestructure(t, client, leaf.JSON201.TransactionTemplateId)

	childAfterDeletedLeaf, err := client.REST().CreateTransactionTemplateWithResponse(context.Background(), httpclient.TransactionTemplateWriteRequest{
		Fqn: "TombstonedTemplateHierarchy:Leaf:Child",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID)},
		},
	})
	if err != nil {
		t.Fatalf("child after deleted leaf request: %v", err)
	}
	if childAfterDeletedLeaf.StatusCode() != http.StatusCreated {
		t.Fatalf("child after deleted leaf status = %d, want %d; body %s", childAfterDeletedLeaf.StatusCode(), http.StatusCreated, childAfterDeletedLeaf.Body)
	}

	child := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "TombstonedTemplateHierarchy:Group:Child",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID)},
		},
	})
	deleteTransactionTemplateForRestructure(t, client, child.JSON201.TransactionTemplateId)

	parentAfterDeletedChild, err := client.REST().CreateTransactionTemplateWithResponse(context.Background(), httpclient.TransactionTemplateWriteRequest{
		Fqn: "TombstonedTemplateHierarchy:Group",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID)},
		},
	})
	if err != nil {
		t.Fatalf("parent after deleted child request: %v", err)
	}
	if parentAfterDeletedChild.StatusCode() != http.StatusCreated {
		t.Fatalf("parent after deleted child status = %d, want %d; body %s", parentAfterDeletedChild.StatusCode(), http.StatusCreated, parentAfterDeletedChild.Body)
	}
}

func TestTransactionTemplateValidationErrors(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionTemplateRefs(t, client)

	invalidAccountID := int64(0)
	invalidMemberID := int64(-1)
	invalidTagIDs := []int64{refs.TagID, refs.TagID}
	assertInvalidTransactionTemplateCreate(t, client, "zero category id", httpclient.TransactionTemplateWriteRequest{
		Fqn: "Invalid:CategoryID",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(0)},
		},
	})
	assertInvalidTransactionTemplateCreate(t, client, "zero account id", httpclient.TransactionTemplateWriteRequest{
		Fqn: "Invalid:AccountID",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID), AccountId: &invalidAccountID},
		},
	})
	assertInvalidTransactionTemplateCreate(t, client, "negative member id", httpclient.TransactionTemplateWriteRequest{
		Fqn: "Invalid:MemberID",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID), MemberId: &invalidMemberID},
		},
	})
	assertInvalidTransactionTemplateCreate(t, client, "duplicate tag ids", httpclient.TransactionTemplateWriteRequest{
		Fqn: "Invalid:DuplicateTags",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID), TagIds: &invalidTagIDs},
		},
	})

	invalidCurrency := "ZZZ"
	assertInvalidTransactionTemplateCreate(t, client, "invalid currency", httpclient.TransactionTemplateWriteRequest{
		Fqn: "Invalid:Currency",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID), Currency: &invalidCurrency},
		},
	})

	memoWithWhitespace := " trailing "
	assertInvalidTransactionTemplateCreate(t, client, "whitespace fqn", httpclient.TransactionTemplateWriteRequest{
		Fqn: " Invalid:FQN",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID)},
		},
	})
	assertInvalidTransactionTemplateCreate(t, client, "whitespace memo", httpclient.TransactionTemplateWriteRequest{
		Fqn: "Invalid:Memo",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID), Memo: &memoWithWhitespace},
		},
	})

	zeroAmount := "0"
	assertInvalidTransactionTemplateCreate(t, client, "zero amount", httpclient.TransactionTemplateWriteRequest{
		Fqn: "Invalid:ZeroAmount",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID), Amount: &zeroAmount},
		},
	})

	missingRecords, err := client.REST().CreateTransactionTemplateWithBodyWithResponse(context.Background(), "application/json", apptest.JSONReader(map[string]any{
		"fqn": "Invalid:MissingRecords",
	}))
	if err != nil {
		t.Fatalf("missing records request: %v", err)
	}
	if missingRecords.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing records status = %d, want %d; body %s", missingRecords.StatusCode(), http.StatusBadRequest, missingRecords.Body)
	}

	emptyRecords, err := client.REST().CreateTransactionTemplateWithBodyWithResponse(context.Background(), "application/json", apptest.JSONReader(map[string]any{
		"fqn":     "Invalid:EmptyRecords",
		"records": []map[string]any{},
	}))
	if err != nil {
		t.Fatalf("empty records request: %v", err)
	}
	if emptyRecords.StatusCode() != http.StatusBadRequest {
		t.Fatalf("empty records status = %d, want %d; body %s", emptyRecords.StatusCode(), http.StatusBadRequest, emptyRecords.Body)
	}

	optionalCategory, err := client.REST().CreateTransactionTemplateWithBodyWithResponse(context.Background(), "application/json", apptest.JSONReader(map[string]any{
		"fqn": "Valid:MissingCategory",
		"records": []map[string]any{
			{"memo": "missing category"},
		},
	}))
	if err != nil {
		t.Fatalf("optional category request: %v", err)
	}
	if optionalCategory.StatusCode() != http.StatusCreated {
		t.Fatalf("optional category status = %d, want %d; body %s", optionalCategory.StatusCode(), http.StatusCreated, optionalCategory.Body)
	}
}

func TestTransactionTemplateReferenceChecks(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionTemplateRefs(t, client)

	assertInvalidTransactionTemplateCreate(t, client, "missing category reference", httpclient.TransactionTemplateWriteRequest{
		Fqn: "References:MissingCategory",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID + 9999)},
		},
	})
	missingAccountID := refs.CheckingAccountID + 9999
	assertInvalidTransactionTemplateCreate(t, client, "missing account reference", httpclient.TransactionTemplateWriteRequest{
		Fqn: "References:MissingAccount",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID), AccountId: &missingAccountID},
		},
	})
	missingMemberID := refs.MemberID + 9999
	assertInvalidTransactionTemplateCreate(t, client, "missing member reference", httpclient.TransactionTemplateWriteRequest{
		Fqn: "References:MissingMember",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID), MemberId: &missingMemberID},
		},
	})
	missingTagIDs := []int64{refs.TagID + 9999}
	assertInvalidTransactionTemplateCreate(t, client, "missing tag reference", httpclient.TransactionTemplateWriteRequest{
		Fqn: "References:MissingTag",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID), TagIds: &missingTagIDs},
		},
	})

	deletedAccount := client.Scenario().Account("expense:TombstonedMerchant")
	deletedCategory := client.Scenario().Category("Templates:TombstonedCategory")
	deletedMember := client.Scenario().Member("Tombstoned Template Member")
	deletedTag := client.Scenario().Tag("Templates:TombstonedTag")
	deleteAccount(t, client, deletedAccount.AccountId)
	deleteCategory(t, client, deletedCategory.CategoryId)
	deleteMember(t, client, deletedMember.MemberId)
	deleteTag(t, client, deletedTag.TagId)

	assertInvalidTransactionTemplateCreate(t, client, "tombstoned category reference", httpclient.TransactionTemplateWriteRequest{
		Fqn: "References:TombstonedCategory",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(deletedCategory.CategoryId)},
		},
	})
	assertInvalidTransactionTemplateCreate(t, client, "tombstoned account reference", httpclient.TransactionTemplateWriteRequest{
		Fqn: "References:TombstonedAccount",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID), AccountId: &deletedAccount.AccountId},
		},
	})
	assertInvalidTransactionTemplateCreate(t, client, "tombstoned member reference", httpclient.TransactionTemplateWriteRequest{
		Fqn: "References:TombstonedMember",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID), MemberId: &deletedMember.MemberId},
		},
	})
	deletedTagIDs := []int64{deletedTag.TagId}
	assertInvalidTransactionTemplateCreate(t, client, "tombstoned tag reference", httpclient.TransactionTemplateWriteRequest{
		Fqn: "References:TombstonedTag",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: apptest.Int64Ptr(refs.CategoryID), TagIds: &deletedTagIDs},
		},
	})

	hidden := true
	currencyUSD := "USD"
	hiddenCategory := client.Scenario().CategoryWithHidden("Templates:HiddenCategory", hidden)
	hiddenAccountResponse, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:         "expense:HiddenMerchant",
		AccountType: httpclient.WritableAccountTypeFlow,
		Currency:    &currencyUSD,
		IsHidden:    &hidden,
	})
	if err != nil {
		t.Fatalf("hidden account request: %v", err)
	}
	if hiddenAccountResponse.StatusCode() != http.StatusCreated {
		t.Fatalf("hidden account status = %d, want %d; body %s", hiddenAccountResponse.StatusCode(), http.StatusCreated, hiddenAccountResponse.Body)
	}
	hiddenFundingResponse, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:         "checking:HiddenFunding",
		AccountType: httpclient.WritableAccountTypeOwned,
		Currency:    &currencyUSD,
		IsHidden:    &hidden,
	})
	if err != nil {
		t.Fatalf("hidden funding account request: %v", err)
	}
	if hiddenFundingResponse.StatusCode() != http.StatusCreated {
		t.Fatalf("hidden funding account status = %d, want %d; body %s", hiddenFundingResponse.StatusCode(), http.StatusCreated, hiddenFundingResponse.Body)
	}
	hiddenTagResponse, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn:      "Templates:HiddenTag",
		IsHidden: &hidden,
	})
	if err != nil {
		t.Fatalf("hidden tag request: %v", err)
	}
	if hiddenTagResponse.StatusCode() != http.StatusCreated {
		t.Fatalf("hidden tag status = %d, want %d; body %s", hiddenTagResponse.StatusCode(), http.StatusCreated, hiddenTagResponse.Body)
	}
	hiddenTagIDs := []int64{hiddenTagResponse.JSON201.TagId}
	fundingAmount := "-10"
	merchantAmount := "10"
	created := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "References:HiddenActive",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{
				AccountId: &hiddenFundingResponse.JSON201.AccountId,
				Amount:    &fundingAmount,
				Currency:  &currencyUSD,
				TagIds:    &hiddenTagIDs,
			},
			{
				CategoryId: apptest.Int64Ptr(hiddenCategory.CategoryId),
				AccountId:  &hiddenAccountResponse.JSON201.AccountId,
				Amount:     &merchantAmount,
				Currency:   &currencyUSD,
				TagIds:     &hiddenTagIDs,
			},
		},
	})
	if created.JSON201.Records[1].CategoryId == nil ||
		*created.JSON201.Records[1].CategoryId != hiddenCategory.CategoryId ||
		created.JSON201.Records[1].AccountId == nil ||
		*created.JSON201.Records[1].AccountId != hiddenAccountResponse.JSON201.AccountId {
		t.Fatalf("hidden active references not returned as selected: %+v", created.JSON201.Records[1])
	}
	assertInt64s(t, created.JSON201.Records[1].TagIds, hiddenTagIDs)
	assertTemplateCompatibleShorthands(t, *created.JSON201, []httpclient.TransactionTemplateShorthandType{httpclient.Spend}, "hidden active references")
}

func TestTransactionTemplateTransportValidation(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionTemplateRefs(t, client)

	missingRequired, err := client.REST().CreateTransactionTemplateWithBodyWithResponse(context.Background(), "application/json", apptest.JSONReader(map[string]any{
		"records": []map[string]any{{"category_id": refs.CategoryID}},
	}))
	if err != nil {
		t.Fatalf("missing required request: %v", err)
	}
	if missingRequired.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing required status = %d, want %d; body %s", missingRequired.StatusCode(), http.StatusBadRequest, missingRequired.Body)
	}

	unknownField, err := client.REST().CreateTransactionTemplateWithBodyWithResponse(context.Background(), "application/json", apptest.JSONReader(map[string]any{
		"fqn":     "Transport:UnknownField",
		"records": []map[string]any{{"category_id": refs.CategoryID}},
		"extra":   true,
	}))
	if err != nil {
		t.Fatalf("unknown field request: %v", err)
	}
	if unknownField.StatusCode() != http.StatusBadRequest {
		t.Fatalf("unknown field status = %d, want %d; body %s", unknownField.StatusCode(), http.StatusBadRequest, unknownField.Body)
	}

	removedRecordFieldBody := map[string]any{
		"fqn": "Transport:RemovedRecordField",
		"records": []map[string]any{{
			"category_id":           refs.CategoryID,
			"reconciliation_status": "unreconciled",
		}},
	}
	removedCreateField, err := client.REST().CreateTransactionTemplateWithBodyWithResponse(context.Background(), "application/json", apptest.JSONReader(removedRecordFieldBody))
	if err != nil {
		t.Fatalf("removed create record field request: %v", err)
	}
	if removedCreateField.StatusCode() != http.StatusBadRequest {
		t.Fatalf("removed create record field status = %d, want %d; body %s", removedCreateField.StatusCode(), http.StatusBadRequest, removedCreateField.Body)
	}

	replaceTarget := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn:     "Transport:ReplaceTarget",
		Records: []httpclient.TransactionTemplateRecordRequest{{CategoryId: apptest.Int64Ptr(refs.CategoryID)}},
	})
	removedRecordFieldBody["fqn"] = replaceTarget.JSON201.Fqn
	removedReplaceField, err := client.REST().ReplaceTransactionTemplateWithBodyWithResponse(
		context.Background(),
		replaceTarget.JSON201.TransactionTemplateId,
		"application/json",
		apptest.JSONReader(removedRecordFieldBody),
	)
	if err != nil {
		t.Fatalf("removed replace record field request: %v", err)
	}
	if removedReplaceField.StatusCode() != http.StatusBadRequest {
		t.Fatalf("removed replace record field status = %d, want %d; body %s", removedReplaceField.StatusCode(), http.StatusBadRequest, removedReplaceField.Body)
	}

	badPath, err := client.REST().GetTransactionTemplateWithResponse(context.Background(), 0)
	if err != nil {
		t.Fatalf("bad path request: %v", err)
	}
	if badPath.StatusCode() != http.StatusBadRequest {
		t.Fatalf("bad path status = %d, want %d; body %s", badPath.StatusCode(), http.StatusBadRequest, badPath.Body)
	}

	for _, rawQuery := range []string{
		"sort=name",
		"sort_dir=sideways",
		"limit=0",
		"limit=501",
		"offset=-1",
	} {
		response, err := client.REST().ListTransactionTemplatesWithResponse(context.Background(), nil, apptest.ReplaceRawQuery(rawQuery))
		if err != nil {
			t.Fatalf("invalid list query %q request: %v", rawQuery, err)
		}
		if response.StatusCode() != http.StatusBadRequest {
			t.Fatalf("invalid list query %q status = %d, want %d; body %s", rawQuery, response.StatusCode(), http.StatusBadRequest, response.Body)
		}
	}
}

func createTransactionTemplateRefs(t *testing.T, client *apptest.Client) transactionTemplateRefs {
	t.Helper()

	checking := client.Scenario().AccountWithCurrency("checking:Template:Primary", "USD")
	merchant := client.Scenario().Account("expense:TemplateMerchant")
	category := client.Scenario().Category("Templates:Default")
	tag := client.Scenario().Tag("Templates:Reusable")
	member := client.Scenario().Member("Template Member")

	return transactionTemplateRefs{
		CheckingAccountID: checking.AccountId,
		MerchantAccountID: merchant.AccountId,
		CategoryID:        category.CategoryId,
		TagID:             tag.TagId,
		MemberID:          member.MemberId,
	}
}

func createTransactionTemplate(
	t *testing.T,
	client *apptest.Client,
	request httpclient.TransactionTemplateWriteRequest,
) *httpclient.CreateTransactionTemplateResponse {
	t.Helper()

	response, err := client.REST().CreateTransactionTemplateWithResponse(context.Background(), request)
	if err != nil {
		t.Fatalf("create template request: %v", err)
	}
	if response.StatusCode() != http.StatusCreated {
		t.Fatalf("create template status = %d, want %d; body %s", response.StatusCode(), http.StatusCreated, response.Body)
	}

	return response
}

func getTransactionTemplate(t *testing.T, client *apptest.Client, id int64) *httpclient.GetTransactionTemplateResponse {
	t.Helper()

	response, err := client.REST().GetTransactionTemplateWithResponse(context.Background(), id)
	if err != nil {
		t.Fatalf("get template request: %v", err)
	}
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("get template status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}

	return response
}

func assertInvalidTransactionTemplateCreate(
	t *testing.T,
	client *apptest.Client,
	label string,
	request httpclient.TransactionTemplateWriteRequest,
) {
	t.Helper()

	response, err := client.REST().CreateTransactionTemplateWithResponse(context.Background(), request)
	if err != nil {
		t.Fatalf("%s request: %v", label, err)
	}
	if response.StatusCode() != http.StatusBadRequest {
		t.Fatalf("%s status = %d, want %d; body %s", label, response.StatusCode(), http.StatusBadRequest, response.Body)
	}
	if response.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("%s code = %q, want %q", label, response.JSON400.Error.Code, httpclient.APIErrorCodeInvalidRequest)
	}
}

func assertRequiredOnlyTemplateRecord(t *testing.T, record httpclient.TransactionTemplateRecord, categoryID int64) {
	t.Helper()

	if record.CategoryId == nil || *record.CategoryId != categoryID {
		t.Fatalf("category_id = %v, want %d", record.CategoryId, categoryID)
	}
	if record.AccountId != nil || record.MemberId != nil || record.Currency != nil || record.Amount != nil || record.Memo != nil {
		t.Fatalf("optional defaults = account:%v member:%v currency:%v amount:%v memo:%v, want all nil",
			record.AccountId,
			record.MemberId,
			record.Currency,
			record.Amount,
			record.Memo,
		)
	}
	if len(record.TagIds) != 0 {
		t.Fatalf("tag_ids = %v, want empty", record.TagIds)
	}
	if record.TransactionTemplateRecordId <= 0 || record.TransactionTemplateId <= 0 || record.CreatedAt.IsZero() || record.UpdatedAt.IsZero() {
		t.Fatalf("record ids/timestamps not populated: %+v", record)
	}
}

func assertPartialTemplateRecord(
	t *testing.T,
	record httpclient.TransactionTemplateRecord,
	refs transactionTemplateRefs,
	amount string,
	memo string,
) {
	t.Helper()

	if record.CategoryId == nil || *record.CategoryId != refs.CategoryID {
		t.Fatalf("category_id = %v, want %d", record.CategoryId, refs.CategoryID)
	}
	if record.AccountId == nil || *record.AccountId != refs.MerchantAccountID {
		t.Fatalf("account_id = %v, want %d", record.AccountId, refs.MerchantAccountID)
	}
	if record.Amount == nil || *record.Amount != "4.25000000" {
		t.Fatalf("amount = %v, want %s fixed scale", record.Amount, amount)
	}
	if record.Memo == nil || *record.Memo != memo {
		t.Fatalf("memo = %v, want %q", record.Memo, memo)
	}
	assertInt64s(t, record.TagIds, []int64{refs.TagID})
}

func assertRichTemplateRecord(
	t *testing.T,
	record httpclient.TransactionTemplateRecord,
	refs transactionTemplateRefs,
	amount string,
	memo string,
) {
	t.Helper()

	if record.CategoryId == nil || *record.CategoryId != refs.CategoryID {
		t.Fatalf("category_id = %v, want %d", record.CategoryId, refs.CategoryID)
	}
	if record.AccountId == nil || *record.AccountId != refs.CheckingAccountID {
		t.Fatalf("account_id = %v, want %d", record.AccountId, refs.CheckingAccountID)
	}
	if record.MemberId == nil || *record.MemberId != refs.MemberID {
		t.Fatalf("member_id = %v, want %d", record.MemberId, refs.MemberID)
	}
	if record.Currency == nil || *record.Currency != "USD" {
		t.Fatalf("currency = %v, want USD", record.Currency)
	}
	if record.Amount == nil || *record.Amount != "-30.00000000" {
		t.Fatalf("amount = %v, want %s fixed scale", record.Amount, amount)
	}
	if record.Memo == nil || *record.Memo != memo {
		t.Fatalf("memo = %v, want %q", record.Memo, memo)
	}
	assertInt64s(t, record.TagIds, []int64{refs.TagID})
}

func assertTransactionTemplateHierarchy(t *testing.T, template httpclient.TransactionTemplate, parent string, name string, level int) {
	t.Helper()

	if template.ParentFqn == nil || *template.ParentFqn != parent {
		t.Fatalf("parent_fqn = %v, want %q", template.ParentFqn, parent)
	}
	if template.Name != name {
		t.Fatalf("name = %q, want %q", template.Name, name)
	}
	if template.Level != level {
		t.Fatalf("level = %d, want %d", template.Level, level)
	}
	if template.CreatedAt.IsZero() || template.UpdatedAt.IsZero() {
		t.Fatalf("template timestamps = %q/%q, want populated", template.CreatedAt, template.UpdatedAt)
	}
}

func assertTransactionTemplateIDs(t *testing.T, templates []httpclient.TransactionTemplate, want []int64) {
	t.Helper()

	got := make([]int64, 0, len(templates))
	for _, template := range templates {
		got = append(got, template.TransactionTemplateId)
	}
	assertInt64s(t, got, want)
}

func transactionTemplateRecordIDs(records []httpclient.TransactionTemplateRecord) []int64 {
	ids := make([]int64, 0, len(records))
	for _, record := range records {
		ids = append(ids, record.TransactionTemplateRecordId)
	}

	return ids
}

func assertTransactionTemplateUnchanged(t *testing.T, client *apptest.Client, id int64, fqn string, recordIDs []int64) {
	t.Helper()

	read := getTransactionTemplate(t, client, id)
	if read.JSON200.Fqn != fqn {
		t.Fatalf("template fqn after rejected replace = %q, want %q", read.JSON200.Fqn, fqn)
	}
	assertInt64s(t, transactionTemplateRecordIDs(read.JSON200.Records), recordIDs)
}

func deleteAccount(t *testing.T, client *apptest.Client, id int64) {
	t.Helper()

	response, err := client.REST().DeleteAccountWithResponse(context.Background(), id)
	if err != nil {
		t.Fatalf("delete account request: %v", err)
	}
	if response.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete account status = %d, want %d; body %s", response.StatusCode(), http.StatusNoContent, response.Body)
	}
}

func deleteCategory(t *testing.T, client *apptest.Client, id int64) {
	t.Helper()

	response, err := client.REST().DeleteCategoryWithResponse(context.Background(), id)
	if err != nil {
		t.Fatalf("delete category request: %v", err)
	}
	if response.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete category status = %d, want %d; body %s", response.StatusCode(), http.StatusNoContent, response.Body)
	}
}

func deleteMember(t *testing.T, client *apptest.Client, id int64) {
	t.Helper()

	response, err := client.REST().DeleteMemberWithResponse(context.Background(), id)
	if err != nil {
		t.Fatalf("delete member request: %v", err)
	}
	if response.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete member status = %d, want %d; body %s", response.StatusCode(), http.StatusNoContent, response.Body)
	}
}

func deleteTag(t *testing.T, client *apptest.Client, id int64) {
	t.Helper()

	response, err := client.REST().DeleteTagWithResponse(context.Background(), id)
	if err != nil {
		t.Fatalf("delete tag request: %v", err)
	}
	if response.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete tag status = %d, want %d; body %s", response.StatusCode(), http.StatusNoContent, response.Body)
	}
}
