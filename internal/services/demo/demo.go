package demo

import (
	"context"
	"fmt"
	"time"

	"github.com/mishamsk/mina/internal/services/accounts"
	"github.com/mishamsk/mina/internal/services/categories"
	"github.com/mishamsk/mina/internal/services/creditlimits"
	"github.com/mishamsk/mina/internal/services/exchangerates"
	"github.com/mishamsk/mina/internal/services/members"
	"github.com/mishamsk/mina/internal/services/tags"
	"github.com/mishamsk/mina/internal/services/transactions"
	"github.com/mishamsk/mina/internal/services/values"
)

// Dependencies are root demo seeding service dependencies.
type Dependencies struct {
	Atomic func(context.Context, func(Services) error) error
}

// Services is the transaction-scoped service set demo seeding uses.
type Services struct {
	Accounts      *accounts.Service
	Categories    *categories.Service
	Tags          *tags.Service
	Members       *members.Service
	CreditLimits  *creditlimits.Service
	ExchangeRates *exchangerates.Service
	Transactions  *transactions.Service
}

// Summary reports seeded demo data counts.
type Summary struct {
	Members            int
	Accounts           int
	Categories         int
	Tags               int
	ExchangeRates      int
	CreditLimitEntries int
	Transactions       int
}

// Service owns deterministic demo seeding use cases.
type Service struct {
	deps Dependencies
}

// NewService creates a demo seeding service.
func NewService(deps Dependencies) *Service {
	return &Service{deps: deps}
}

// Seed creates deterministic demo data for April-May 2026.
func (s *Service) Seed(ctx context.Context) (Summary, error) {
	var summary Summary
	err := s.deps.Atomic(ctx, func(services Services) error {
		builder := seedBuilder{
			services: services,
			members:  map[string]int64{},
			accounts: map[string]int64{},
			cats:     map[string]int64{},
			tags:     map[string]int64{},
		}
		if err := builder.seed(ctx); err != nil {
			return err
		}

		summary = builder.summary
		return nil
	})
	if err != nil {
		return Summary{}, err
	}

	return summary, nil
}

type seedBuilder struct {
	services Services
	summary  Summary
	members  map[string]int64
	accounts map[string]int64
	cats     map[string]int64
	tags     map[string]int64
}

func (b *seedBuilder) seed(ctx context.Context) error {
	if err := b.seedMembers(ctx); err != nil {
		return err
	}
	if err := b.seedAccounts(ctx); err != nil {
		return err
	}
	if err := b.seedCategories(ctx); err != nil {
		return err
	}
	if err := b.seedTags(ctx); err != nil {
		return err
	}
	if err := b.seedRatesAndLimits(ctx); err != nil {
		return err
	}
	if err := b.seedTransactions(ctx); err != nil {
		return err
	}

	return nil
}

func (b *seedBuilder) seedMembers(ctx context.Context) error {
	for _, name := range []string{"Avery", "Morgan", "Riley"} {
		member, err := b.services.Members.Create(ctx, members.CreateInput{Name: name})
		if err != nil {
			return fmt.Errorf("create member %q: %w", name, err)
		}
		b.members[name] = member.ID
		b.summary.Members++
	}

	return nil
}

func (b *seedBuilder) seedAccounts(ctx context.Context) error {
	accountInputs := []struct {
		fqn         string
		accountType accounts.AccountType
		currency    *string
	}{
		{"checking:Chase:Joint", accounts.AccountTypeBalance, strPtr("USD")},
		{"savings:Ally:Emergency", accounts.AccountTypeBalance, strPtr("USD")},
		{"mortgage:Rocket:Home", accounts.AccountTypeBalance, strPtr("USD")},
		{"credit_card:Chase:Sapphire", accounts.AccountTypeBalance, strPtr("USD")},
		{"credit_card:Amex:BlueCash", accounts.AccountTypeBalance, strPtr("USD")},
		{"cash:Wallet", accounts.AccountTypeBalance, strPtr("USD")},
		{"cash:Travel:EUR", accounts.AccountTypeBalance, strPtr("EUR")},
		{"cash:Travel:JPY", accounts.AccountTypeBalance, strPtr("JPY")},
		{"trading:USD", accounts.AccountTypeBalance, strPtr("USD")},
		{"trading:EUR", accounts.AccountTypeBalance, strPtr("EUR")},
		{"trading:JPY", accounts.AccountTypeBalance, strPtr("JPY")},
		{"merchant:ExchangeProvider", accounts.AccountTypeFlow, nil},
		{"bank:Chase:fees", accounts.AccountTypeFlow, strPtr("USD")},
		{"bank:Chase:interest", accounts.AccountTypeFlow, strPtr("USD")},
		{"income:AcmePayroll", accounts.AccountTypeFlow, strPtr("USD")},
		{"income:Freelance", accounts.AccountTypeFlow, strPtr("USD")},
		{"merchant:TraderJoes", accounts.AccountTypeFlow, strPtr("USD")},
		{"merchant:BlueBottle", accounts.AccountTypeFlow, strPtr("USD")},
		{"merchant:MTA", accounts.AccountTypeFlow, strPtr("USD")},
		{"merchant:Shell", accounts.AccountTypeFlow, strPtr("USD")},
		{"merchant:Target", accounts.AccountTypeFlow, strPtr("USD")},
		{"merchant:Netflix", accounts.AccountTypeFlow, strPtr("USD")},
		{"merchant:CVS", accounts.AccountTypeFlow, strPtr("USD")},
		{"merchant:Restaurant:Local", accounts.AccountTypeFlow, strPtr("USD")},
		{"merchant:Books", accounts.AccountTypeFlow, strPtr("USD")},
		{"merchant:Utilities:ConEd", accounts.AccountTypeFlow, strPtr("USD")},
		{"merchant:MortgageEscrow", accounts.AccountTypeFlow, strPtr("USD")},
		{"person:Friend:Jordan", accounts.AccountTypeBalance, strPtr("USD")},
		{"person:Pool:BeachHouse", accounts.AccountTypeBalance, strPtr("USD")},
		{"merchant:Travel:Hotel:Lisbon", accounts.AccountTypeFlow, nil},
		{"merchant:Travel:Dining:Lisbon", accounts.AccountTypeFlow, nil},
		{"merchant:Travel:Transit:Tokyo", accounts.AccountTypeFlow, nil},
		{"system:opening_balance", accounts.AccountTypeSystem, strPtr("USD")},
		{"system:reconciliation_adjustment", accounts.AccountTypeSystem, strPtr("USD")},
		{"system:rounding", accounts.AccountTypeSystem, nil},
		{"system:fx_gain_loss", accounts.AccountTypeSystem, nil},
	}
	for _, input := range accountInputs {
		account, err := b.services.Accounts.Create(ctx, accounts.CreateInput{
			FQN:         input.fqn,
			AccountType: input.accountType,
			Currency:    input.currency,
		})
		if err != nil {
			return fmt.Errorf("create account %q: %w", input.fqn, err)
		}
		b.accounts[input.fqn] = account.ID
		b.summary.Accounts++
	}

	return nil
}

func (b *seedBuilder) seedCategories(ctx context.Context) error {
	categoryInputs := []struct {
		fqn            string
		economicIntent categories.CategoryEconomicIntent
	}{
		{"Income:Salary", categories.CategoryEconomicIntentIncome},
		{"Income:Freelance", categories.CategoryEconomicIntentIncome},
		{"Income:BankInterest", categories.CategoryEconomicIntentIncome},
		{"Bank:Fees", categories.CategoryEconomicIntentFee},
		{"Refunds:Retail", categories.CategoryEconomicIntentRefund},
		{"Housing:Mortgage:Principal", categories.CategoryEconomicIntentTransfer},
		{"Housing:Mortgage:Interest", categories.CategoryEconomicIntentExpense},
		{"Housing:Utilities", categories.CategoryEconomicIntentExpense},
		{"Food:Groceries", categories.CategoryEconomicIntentExpense},
		{"Food:Coffee", categories.CategoryEconomicIntentExpense},
		{"Food:Restaurants", categories.CategoryEconomicIntentExpense},
		{"Transport:Transit", categories.CategoryEconomicIntentExpense},
		{"Transport:Fuel", categories.CategoryEconomicIntentExpense},
		{"Shopping:Household", categories.CategoryEconomicIntentExpense},
		{"Health:Pharmacy", categories.CategoryEconomicIntentExpense},
		{"Entertainment:Books", categories.CategoryEconomicIntentExpense},
		{"Entertainment:Streaming", categories.CategoryEconomicIntentExpense},
		{"Transfer", categories.CategoryEconomicIntentTransfer},
		{"Savings", categories.CategoryEconomicIntentTransfer},
		{"Debt:CreditCardPayment", categories.CategoryEconomicIntentTransfer},
		{"Debt:FriendLoan", categories.CategoryEconomicIntentTransfer},
		{"Travel:Pool", categories.CategoryEconomicIntentTransfer},
		{"Travel:Vacation", categories.CategoryEconomicIntentExpense},
		{"Travel:Dining", categories.CategoryEconomicIntentExpense},
		{"Travel:Transit", categories.CategoryEconomicIntentExpense},
		{"Currency:Exchange", categories.CategoryEconomicIntentExchange},
		{"Adjustment:Opening", categories.CategoryEconomicIntentAdjustment},
		{"FX:GainLoss", categories.CategoryEconomicIntentFXGainLoss},
		{"Cash:Withdrawal", categories.CategoryEconomicIntentTransfer},
	}
	for _, input := range categoryInputs {
		category, err := b.services.Categories.Create(ctx, categories.CreateInput{
			FQN:            input.fqn,
			EconomicIntent: input.economicIntent,
		})
		if err != nil {
			return fmt.Errorf("create category %q: %w", input.fqn, err)
		}
		b.cats[input.fqn] = category.ID
		b.summary.Categories++
	}

	return nil
}

func (b *seedBuilder) seedTags(ctx context.Context) error {
	for _, fqn := range []string{
		"Shared:Family",
		"Shared:Jordan",
		"Trips:Vacation:Lisbon2026",
		"Trips:Vacation:Tokyo2026",
		"Projects:Home",
		"Cash",
		"Income",
		"CardPayment",
	} {
		tag, err := b.services.Tags.Create(ctx, tags.CreateInput{FQN: fqn})
		if err != nil {
			return fmt.Errorf("create tag %q: %w", fqn, err)
		}
		b.tags[fqn] = tag.ID
		b.summary.Tags++
	}

	return nil
}

func (b *seedBuilder) seedRatesAndLimits(ctx context.Context) error {
	for _, input := range []exchangerates.CreateInput{
		{FromCurrency: "EUR", ToCurrency: "USD", Rate: mustDecimal("1.08000000"), EffectiveDate: mustDate("2026-04-03")},
		{FromCurrency: "EUR", ToCurrency: "USD", Rate: mustDecimal("1.09000000"), EffectiveDate: mustDate("2026-04-17")},
		{FromCurrency: "EUR", ToCurrency: "USD", Rate: mustDecimal("1.10000000"), EffectiveDate: mustDate("2026-05-08")},
		{FromCurrency: "EUR", ToCurrency: "USD", Rate: mustDecimal("1.12000000"), EffectiveDate: mustDate("2026-05-22")},
		{FromCurrency: "JPY", ToCurrency: "USD", Rate: mustDecimal("0.00670000"), EffectiveDate: mustDate("2026-04-10")},
		{FromCurrency: "JPY", ToCurrency: "USD", Rate: mustDecimal("0.00680000"), EffectiveDate: mustDate("2026-05-15")},
	} {
		if _, err := b.services.ExchangeRates.Create(ctx, input); err != nil {
			return fmt.Errorf("create exchange rate %s/%s %s: %w", input.FromCurrency, input.ToCurrency, input.EffectiveDate, err)
		}
		b.summary.ExchangeRates++
	}

	for _, input := range []struct {
		account string
		limit   string
		date    string
	}{
		{"credit_card:Chase:Sapphire", "18000.00", "2026-04-01"},
		{"credit_card:Amex:BlueCash", "12000.00", "2026-04-01"},
		{"credit_card:Chase:Sapphire", "20000.00", "2026-05-15"},
	} {
		if _, err := b.services.CreditLimits.Create(ctx, b.accounts[input.account], creditlimits.CreateInput{
			CreditLimit:   mustDecimal(input.limit),
			EffectiveDate: mustCivilDate(input.date),
		}); err != nil {
			return fmt.Errorf("create credit limit %q %s: %w", input.account, input.date, err)
		}
		b.summary.CreditLimitEntries++
	}

	return nil
}

func (b *seedBuilder) seedTransactions(ctx context.Context) error {
	if err := b.seedIncome(ctx); err != nil {
		return err
	}
	if err := b.seedRecurring(ctx); err != nil {
		return err
	}
	if err := b.seedDailySpend(ctx); err != nil {
		return err
	}
	if err := b.seedCashAndFriends(ctx); err != nil {
		return err
	}
	if err := b.seedTravel(ctx); err != nil {
		return err
	}
	if err := b.seedSemanticCoverage(ctx); err != nil {
		return err
	}

	return nil
}

func (b *seedBuilder) seedIncome(ctx context.Context) error {
	for _, date := range []string{"2026-04-03", "2026-04-17", "2026-05-01", "2026-05-15", "2026-05-29"} {
		if err := b.tx(ctx, date,
			b.rec("checking:Chase:Joint", "Avery", "USD", 325000, 325000, "Income:Salary", []string{"Income"}, "Acme payroll", date),
			b.rec("income:AcmePayroll", "", "USD", -325000, -325000, "Income:Salary", []string{"Income"}, "Acme payroll", date),
		); err != nil {
			return err
		}
	}
	for _, date := range []string{"2026-04-22", "2026-05-20"} {
		if err := b.tx(ctx, date,
			b.rec("checking:Chase:Joint", "Morgan", "USD", 85000, 85000, "Income:Freelance", []string{"Income"}, "Freelance design", date),
			b.rec("income:Freelance", "", "USD", -85000, -85000, "Income:Freelance", []string{"Income"}, "Freelance design", date),
		); err != nil {
			return err
		}
	}

	return nil
}

func (b *seedBuilder) seedRecurring(ctx context.Context) error {
	for _, date := range []string{"2026-04-05", "2026-05-05"} {
		if err := b.tx(ctx, date,
			b.rec("checking:Chase:Joint", "", "USD", -300000, -300000, "Housing:Mortgage:Principal", []string{"Shared:Family"}, "Mortgage payment", date),
			b.rec("mortgage:Rocket:Home", "", "USD", 220000, 220000, "Housing:Mortgage:Principal", []string{"Shared:Family"}, "Mortgage principal", date),
			b.rec("merchant:MortgageEscrow", "", "USD", 80000, 80000, "Housing:Mortgage:Interest", []string{"Shared:Family"}, "Mortgage interest and escrow", date),
		); err != nil {
			return err
		}
	}
	for _, input := range []struct {
		date   string
		card   string
		amount int
	}{
		{"2026-04-12", "credit_card:Chase:Sapphire", 145000},
		{"2026-04-18", "credit_card:Amex:BlueCash", 62000},
		{"2026-05-12", "credit_card:Chase:Sapphire", 172000},
		{"2026-05-18", "credit_card:Amex:BlueCash", 74000},
	} {
		if err := b.tx(ctx, input.date,
			b.rec("checking:Chase:Joint", "", "USD", -input.amount, -input.amount, "Debt:CreditCardPayment", []string{"CardPayment"}, "Credit card payment", input.date),
			b.rec(input.card, "", "USD", input.amount, input.amount, "Debt:CreditCardPayment", []string{"CardPayment"}, "Credit card payment", input.date),
		); err != nil {
			return err
		}
	}
	for _, date := range []string{"2026-04-06", "2026-04-13", "2026-04-20", "2026-04-27", "2026-05-04", "2026-05-11", "2026-05-18", "2026-05-25"} {
		if err := b.tx(ctx, date,
			b.rec("checking:Chase:Joint", "", "USD", -25000, -25000, "Savings", []string{"Shared:Family"}, "Weekly savings transfer", date),
			b.rec("savings:Ally:Emergency", "", "USD", 25000, 25000, "Savings", []string{"Shared:Family"}, "Weekly savings transfer", date),
		); err != nil {
			return err
		}
	}
	for _, input := range []struct {
		date     string
		merchant string
		category string
		amount   int
		memo     string
	}{
		{"2026-04-08", "merchant:Utilities:ConEd", "Housing:Utilities", 18432, "Electric bill"},
		{"2026-05-08", "merchant:Utilities:ConEd", "Housing:Utilities", 16945, "Electric bill"},
		{"2026-04-10", "merchant:Netflix", "Entertainment:Streaming", 2199, "Streaming subscription"},
		{"2026-05-10", "merchant:Netflix", "Entertainment:Streaming", 2199, "Streaming subscription"},
	} {
		if err := b.simpleSpend(ctx, input.date, "checking:Chase:Joint", input.merchant, input.category, input.amount, input.memo, []string{"Shared:Family"}); err != nil {
			return err
		}
	}

	return nil
}

func (b *seedBuilder) seedDailySpend(ctx context.Context) error {
	start := mustDate("2026-04-01")
	for day := 0; day < 61; day++ {
		date := start.AddDate(0, 0, day).Format("2006-01-02")
		if day%10 == 4 {
			if err := b.tx(ctx, date,
				b.rec("credit_card:Chase:Sapphire", "Avery", "USD", -7200, -7200, "Food:Restaurants", []string{"Shared:Jordan"}, "Dinner split with Jordan", date),
				b.rec("merchant:Restaurant:Local", "", "USD", 5400, 5400, "Food:Restaurants", []string{"Shared:Jordan"}, "Dinner split with Jordan", date),
				b.rec("person:Friend:Jordan", "", "USD", 1800, 1800, "Debt:FriendLoan", []string{"Shared:Jordan"}, "Jordan share of dinner", date),
			); err != nil {
				return err
			}
			continue
		}
		merchant, category, amount, member, memo := dailySpend(day)
		card := "credit_card:Chase:Sapphire"
		if day%3 == 0 {
			card = "credit_card:Amex:BlueCash"
		}
		if err := b.simpleSpendWithMember(ctx, date, card, merchant, category, amount, member, memo, []string{"Shared:Family"}); err != nil {
			return err
		}
	}

	return nil
}

func (b *seedBuilder) seedCashAndFriends(ctx context.Context) error {
	for _, date := range []string{"2026-04-04", "2026-04-19", "2026-05-03", "2026-05-17", "2026-05-30"} {
		if err := b.tx(ctx, date,
			b.rec("checking:Chase:Joint", "", "USD", -12000, -12000, "Cash:Withdrawal", []string{"Cash"}, "ATM withdrawal", date),
			b.rec("cash:Wallet", "", "USD", 12000, 12000, "Cash:Withdrawal", []string{"Cash"}, "ATM withdrawal", date),
		); err != nil {
			return err
		}
	}
	for _, input := range []struct {
		date   string
		amount int
		memo   string
	}{
		{"2026-04-07", 1800, "Farmers market cash"},
		{"2026-04-16", 2400, "School fundraiser cash"},
		{"2026-04-26", 1600, "Cash lunch"},
		{"2026-05-06", 2200, "Cash snacks"},
		{"2026-05-14", 3400, "Cash parking"},
		{"2026-05-23", 2800, "Cash market"},
	} {
		if err := b.simpleSpend(ctx, input.date, "cash:Wallet", "merchant:Restaurant:Local", "Food:Restaurants", input.amount, input.memo, []string{"Cash"}); err != nil {
			return err
		}
	}
	for _, input := range []struct {
		date   string
		amount int
		memo   string
	}{
		{"2026-04-11", -10000, "Loan to Jordan"},
		{"2026-04-25", 4500, "Jordan partial repayment"},
		{"2026-05-09", -6000, "Beach house deposit for Jordan"},
		{"2026-05-24", 11500, "Jordan repayment and pool true-up"},
	} {
		checkingAmount := input.amount
		friendAmount := -input.amount
		if err := b.tx(ctx, input.date,
			b.rec("checking:Chase:Joint", "", "USD", checkingAmount, checkingAmount, "Debt:FriendLoan", []string{"Shared:Jordan"}, input.memo, input.date),
			b.rec("person:Friend:Jordan", "", "USD", friendAmount, friendAmount, "Debt:FriendLoan", []string{"Shared:Jordan"}, input.memo, input.date),
		); err != nil {
			return err
		}
	}
	for _, input := range []struct {
		date   string
		amount int
	}{
		{"2026-04-28", 30000},
		{"2026-05-02", 50000},
		{"2026-05-16", -20000},
	} {
		if err := b.tx(ctx, input.date,
			b.rec("checking:Chase:Joint", "", "USD", -input.amount, -input.amount, "Travel:Pool", []string{"Trips:Vacation:Lisbon2026"}, "Beach house money pool", input.date),
			b.rec("person:Pool:BeachHouse", "", "USD", input.amount, input.amount, "Travel:Pool", []string{"Trips:Vacation:Lisbon2026"}, "Beach house money pool", input.date),
		); err != nil {
			return err
		}
	}

	return nil
}

func (b *seedBuilder) seedTravel(ctx context.Context) error {
	for _, input := range []struct {
		date        string
		usdCents    int
		eurCents    int
		merchant    string
		category    string
		memo        string
		tag         string
		payAccount  string
		payCurrency string
		payCents    int
	}{
		{"2026-04-18", 43200, 40000, "merchant:Travel:Hotel:Lisbon", "Travel:Vacation", "Lisbon hotel deposit", "Trips:Vacation:Lisbon2026", "credit_card:Chase:Sapphire", "USD", 43200},
		{"2026-04-19", 5400, 5000, "merchant:Travel:Dining:Lisbon", "Travel:Dining", "Lisbon dinner", "Trips:Vacation:Lisbon2026", "credit_card:Chase:Sapphire", "USD", 5400},
		{"2026-05-07", 10900, 10000, "merchant:Travel:Dining:Lisbon", "Travel:Dining", "Lisbon food tour", "Trips:Vacation:Lisbon2026", "credit_card:Chase:Sapphire", "USD", 10900},
		{"2026-05-21", 6720, 6000, "merchant:Travel:Dining:Lisbon", "Travel:Dining", "Lisbon cafe", "Trips:Vacation:Lisbon2026", "cash:Travel:EUR", "EUR", 6000},
	} {
		records := []transactions.JournalRecordInput{
			b.rec(input.payAccount, "Morgan", input.payCurrency, -input.payCents, -input.usdCents, input.category, []string{input.tag}, input.memo, input.date),
			b.rec(input.merchant, "", "EUR", input.eurCents, input.usdCents, input.category, []string{input.tag}, input.memo, input.date),
		}
		if input.payCurrency != "EUR" {
			records = []transactions.JournalRecordInput{
				b.rec(input.payAccount, "Morgan", input.payCurrency, -input.payCents, -input.usdCents, "Currency:Exchange", []string{input.tag}, input.memo, input.date),
				b.rec("merchant:ExchangeProvider", "", input.payCurrency, input.payCents, input.usdCents, "Currency:Exchange", []string{input.tag}, input.memo, input.date),
				b.rec("merchant:ExchangeProvider", "", "EUR", -input.eurCents, -input.usdCents, "Currency:Exchange", []string{input.tag}, input.memo, input.date),
				b.rec("cash:Travel:EUR", "", "EUR", input.eurCents, input.usdCents, "Currency:Exchange", []string{input.tag}, input.memo, input.date),
				b.rec("cash:Travel:EUR", "Morgan", "EUR", -input.eurCents, -input.usdCents, input.category, []string{input.tag}, input.memo, input.date),
				b.rec(input.merchant, "", "EUR", input.eurCents, input.usdCents, input.category, []string{input.tag}, input.memo, input.date),
			}
		}
		if err := b.tx(ctx, input.date, records...); err != nil {
			return err
		}
	}
	for _, input := range []struct {
		date     string
		usdCents int
		jpyCents int
	}{
		{"2026-04-24", 3350, 500000},
		{"2026-05-22", 4080, 600000},
	} {
		if err := b.tx(ctx, input.date,
			b.rec("credit_card:Chase:Sapphire", "Riley", "USD", -input.usdCents, -input.usdCents, "Currency:Exchange", []string{"Trips:Vacation:Tokyo2026"}, "Tokyo transit card", input.date),
			b.rec("merchant:ExchangeProvider", "", "USD", input.usdCents, input.usdCents, "Currency:Exchange", []string{"Trips:Vacation:Tokyo2026"}, "Tokyo transit card", input.date),
			b.rec("merchant:ExchangeProvider", "", "JPY", -input.jpyCents, -input.usdCents, "Currency:Exchange", []string{"Trips:Vacation:Tokyo2026"}, "Tokyo transit card", input.date),
			b.rec("cash:Travel:JPY", "", "JPY", input.jpyCents, input.usdCents, "Currency:Exchange", []string{"Trips:Vacation:Tokyo2026"}, "Tokyo transit card", input.date),
			b.rec("cash:Travel:JPY", "Riley", "JPY", -input.jpyCents, -input.usdCents, "Travel:Transit", []string{"Trips:Vacation:Tokyo2026"}, "Tokyo transit card", input.date),
			b.rec("merchant:Travel:Transit:Tokyo", "", "JPY", input.jpyCents, input.usdCents, "Travel:Transit", []string{"Trips:Vacation:Tokyo2026"}, "Tokyo transit card", input.date),
		); err != nil {
			return err
		}
	}
	for _, input := range []struct {
		date     string
		usdCents int
		eurCents int
	}{
		{"2026-05-01", 33000, 30000},
		{"2026-05-19", 22400, 20000},
	} {
		if err := b.tx(ctx, input.date,
			b.rec("checking:Chase:Joint", "", "USD", -input.usdCents, -input.usdCents, "Currency:Exchange", []string{"Trips:Vacation:Lisbon2026"}, "Currency exchange", input.date),
			b.rec("merchant:ExchangeProvider", "", "USD", input.usdCents, input.usdCents, "Currency:Exchange", []string{"Trips:Vacation:Lisbon2026"}, "Currency exchange", input.date),
			b.rec("merchant:ExchangeProvider", "", "EUR", -input.eurCents, -input.usdCents, "Currency:Exchange", []string{"Trips:Vacation:Lisbon2026"}, "Currency exchange", input.date),
			b.rec("cash:Travel:EUR", "", "EUR", input.eurCents, input.usdCents, "Currency:Exchange", []string{"Trips:Vacation:Lisbon2026"}, "Currency exchange", input.date),
		); err != nil {
			return err
		}
	}

	return nil
}

func (b *seedBuilder) seedSemanticCoverage(ctx context.Context) error {
	if err := b.tx(ctx, "2026-04-02",
		b.rec("checking:Chase:Joint", "", "USD", 100000, 100000, "Adjustment:Opening", []string{"Shared:Family"}, "Opening balance", "2026-04-02"),
		b.rec("system:opening_balance", "", "USD", -100000, -100000, "Adjustment:Opening", []string{"Shared:Family"}, "Opening balance", "2026-04-02"),
	); err != nil {
		return err
	}
	if err := b.tx(ctx, "2026-04-09",
		b.rec("checking:Chase:Joint", "", "USD", 3499, 3499, "Refunds:Retail", []string{"Shared:Family"}, "Target return", "2026-04-09"),
		b.rec("merchant:Target", "", "USD", -3499, -3499, "Refunds:Retail", []string{"Shared:Family"}, "Target return", "2026-04-09"),
	); err != nil {
		return err
	}
	if err := b.tx(ctx, "2026-04-15",
		b.rec("checking:Chase:Joint", "", "USD", -10000, -10000, "Transfer", []string{"Shared:Family"}, "Wire transfer with fee", "2026-04-15"),
		b.rec("savings:Ally:Emergency", "", "USD", 10000, 10000, "Transfer", []string{"Shared:Family"}, "Wire transfer with fee", "2026-04-15"),
		b.rec("checking:Chase:Joint", "", "USD", -25, -25, "Bank:Fees", []string{"Shared:Family"}, "Wire transfer fee", "2026-04-15"),
		b.rec("bank:Chase:fees", "", "USD", 25, 25, "Bank:Fees", []string{"Shared:Family"}, "Wire transfer fee", "2026-04-15"),
	); err != nil {
		return err
	}
	if err := b.tx(ctx, "2026-04-21",
		b.rec("cash:Travel:EUR", "", "EUR", 1200, 1308, "FX:GainLoss", []string{"Trips:Vacation:Lisbon2026"}, "EUR valuation gain", "2026-04-21"),
		b.rec("system:fx_gain_loss", "", "EUR", -1200, -1308, "FX:GainLoss", []string{"Trips:Vacation:Lisbon2026"}, "EUR valuation gain", "2026-04-21"),
	); err != nil {
		return err
	}
	if err := b.tx(ctx, "2026-04-23",
		b.rec("checking:Chase:Joint", "", "USD", 215, 215, "Income:BankInterest", []string{"Income"}, "Checking interest", "2026-04-23"),
		b.rec("bank:Chase:interest", "", "USD", -215, -215, "Income:BankInterest", []string{"Income"}, "Checking interest", "2026-04-23"),
	); err != nil {
		return err
	}
	if err := b.tx(ctx, "2026-05-26",
		b.rec("checking:Chase:Joint", "Avery", "USD", -500, -500, "Food:Coffee", []string{"Shared:Family"}, "Mixed payroll correction", "2026-05-26"),
		b.rec("merchant:BlueBottle", "", "USD", 500, 500, "Food:Coffee", []string{"Shared:Family"}, "Mixed payroll correction", "2026-05-26"),
		b.rec("checking:Chase:Joint", "Avery", "USD", 10000, 10000, "Income:Salary", []string{"Income"}, "Mixed payroll correction", "2026-05-26"),
		b.rec("income:AcmePayroll", "", "USD", -10000, -10000, "Income:Salary", []string{"Income"}, "Mixed payroll correction", "2026-05-26"),
	); err != nil {
		return err
	}

	return nil
}

func (b *seedBuilder) simpleSpend(
	ctx context.Context,
	date string,
	source string,
	merchant string,
	category string,
	amount int,
	memo string,
	tagFQNs []string,
) error {
	return b.simpleSpendWithMember(ctx, date, source, merchant, category, amount, "", memo, tagFQNs)
}

func (b *seedBuilder) simpleSpendWithMember(
	ctx context.Context,
	date string,
	source string,
	merchant string,
	category string,
	amount int,
	member string,
	memo string,
	tagFQNs []string,
) error {
	return b.tx(ctx, date,
		b.rec(source, member, "USD", -amount, -amount, category, tagFQNs, memo, date),
		b.rec(merchant, "", "USD", amount, amount, category, tagFQNs, memo, date),
	)
}

func (b *seedBuilder) tx(ctx context.Context, date string, records ...transactions.JournalRecordInput) error {
	if _, err := b.services.Transactions.Create(ctx, transactions.CreateInput{
		InitiatedDate: mustCivilDate(date),
		Records:       records,
	}); err != nil {
		return fmt.Errorf("create transaction %s: %w", date, err)
	}
	b.summary.Transactions++

	return nil
}

func (b *seedBuilder) rec(
	accountFQN string,
	memberName string,
	currency string,
	amountCents int,
	amountUSDCents int,
	categoryFQN string,
	tagFQNs []string,
	memo string,
	postedDate string,
) transactions.JournalRecordInput {
	var memberID *int64
	if memberName != "" {
		id := b.members[memberName]
		memberID = &id
	}
	tagIDs := make([]int64, 0, len(tagFQNs))
	for _, fqn := range tagFQNs {
		tagIDs = append(tagIDs, b.tags[fqn])
	}

	return transactions.JournalRecordInput{
		AccountID:            b.accounts[accountFQN],
		MemberID:             memberID,
		Currency:             currency,
		Amount:               money(amountCents),
		AmountUSD:            decimalPtr(money(amountUSDCents)),
		CategoryID:           b.cats[categoryFQN],
		TagIDs:               tagIDs,
		Memo:                 strPtr(memo),
		PostedDate:           timePtr(postedDate),
		PostingStatus:        transactions.PostingStatusPosted,
		ReconciliationStatus: transactions.ReconciliationStatusReconciled,
		Source:               transactions.SourceManual,
	}
}

func decimalPtr(value values.Decimal) *values.Decimal {
	return &value
}

func dailySpend(day int) (string, string, int, string, string) {
	inputs := []struct {
		merchant string
		category string
		base     int
		member   string
		memo     string
	}{
		{"merchant:TraderJoes", "Food:Groceries", 6425, "Avery", "Groceries"},
		{"merchant:BlueBottle", "Food:Coffee", 625, "Morgan", "Coffee"},
		{"merchant:MTA", "Transport:Transit", 580, "Riley", "Subway"},
		{"merchant:Shell", "Transport:Fuel", 4830, "Avery", "Fuel"},
		{"merchant:Target", "Shopping:Household", 3850, "Morgan", "Household supplies"},
		{"merchant:CVS", "Health:Pharmacy", 1860, "Riley", "Pharmacy"},
		{"merchant:Restaurant:Local", "Food:Restaurants", 2840, "Avery", "Local restaurant"},
		{"merchant:Books", "Entertainment:Books", 2150, "Morgan", "Books"},
	}
	input := inputs[day%len(inputs)]
	amount := input.base + (day%7)*137

	return input.merchant, input.category, amount, input.member, input.memo
}

func money(cents int) values.Decimal {
	sign := ""
	if cents < 0 {
		sign = "-"
		cents = -cents
	}

	return mustDecimal(fmt.Sprintf("%s%d.%02d", sign, cents/100, cents%100))
}

func strPtr(value string) *string {
	return &value
}

func timePtr(value string) *time.Time {
	parsed := mustDate(value)

	return &parsed
}

func mustDecimal(value string) values.Decimal {
	parsed, err := values.ParseDecimal(value)
	if err != nil {
		panic(err)
	}

	return parsed
}

func mustCivilDate(value string) values.CivilDate {
	parsed, err := values.ParseCivilDate(value)
	if err != nil {
		panic(err)
	}

	return parsed
}

func mustDate(value string) time.Time {
	parsed, err := time.Parse("2006-01-02", value)
	if err != nil {
		panic(err)
	}

	return parsed
}
