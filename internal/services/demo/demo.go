package demo

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/accounts"
	"github.com/mishamsk/mina/internal/services/categories"
	"github.com/mishamsk/mina/internal/services/creditlimits"
	"github.com/mishamsk/mina/internal/services/exchangerates"
	"github.com/mishamsk/mina/internal/services/members"
	"github.com/mishamsk/mina/internal/services/recurring"
	"github.com/mishamsk/mina/internal/services/tags"
	"github.com/mishamsk/mina/internal/services/transactions"
	"github.com/mishamsk/mina/internal/services/transactiontemplates"
	"github.com/mishamsk/mina/internal/services/values"
)

// Dependencies are root demo seeding service dependencies.
type Dependencies struct {
	Atomic func(context.Context, func(Services) error) error
	Clock  Clock
}

// Clock provides the runtime-owned current time for the default seed anchor.
type Clock interface {
	Now() time.Time
}

// Services is the transaction-scoped service set demo seeding uses.
type Services struct {
	Accounts      *accounts.Service
	Categories    *categories.Service
	Tags          *tags.Service
	Members       *members.Service
	CreditLimits  *creditlimits.Service
	ExchangeRates *exchangerates.Service
	Recurring     *recurring.Service
	Templates     *transactiontemplates.Service
	Transactions  *transactions.Service
}

// Summary reports seeded demo data counts.
type Summary struct {
	Members              int
	Accounts             int
	Categories           int
	Tags                 int
	ExchangeRates        int
	CreditLimitEntries   int
	TransactionTemplates int
	Transactions         int
	RecurringDefinitions int
	RecurringOccurrences int
}

// DefaultMaxMonths is the default demo history window.
const DefaultMaxMonths = 6

// Service owns deterministic demo seeding use cases.
type Service struct {
	deps Dependencies
}

// NewService creates a demo seeding service.
func NewService(deps Dependencies) *Service {
	return &Service{deps: deps}
}

// Seed creates deterministic demo data ending at anchorDate and bounded by maxMonths.
// Nil values use the current local civil date and DefaultMaxMonths.
func (s *Service) Seed(ctx context.Context, anchorDate *values.CivilDate, maxMonths *int) (Summary, error) {
	if anchorDate == nil {
		defaultAnchor := values.LocalCivilDateFromTime(s.deps.Clock.Now())
		anchorDate = &defaultAnchor
	}
	resolvedMaxMonths := DefaultMaxMonths
	if maxMonths != nil {
		resolvedMaxMonths = *maxMonths
	}
	if resolvedMaxMonths < 1 {
		return Summary{}, services.InvalidRequest("demo max months must be at least 1")
	}
	if err := ValidateAnchorDate(*anchorDate); err != nil {
		return Summary{}, err
	}

	var summary Summary
	err := s.deps.Atomic(ctx, func(services Services) error {
		builder := seedBuilder{
			services:   services,
			anchorDate: *anchorDate,
			maxMonths:  resolvedMaxMonths,
			members:    map[string]int64{},
			accounts:   map[string]int64{},
			cats:       map[string]int64{},
			tags:       map[string]int64{},
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

// ValidateAnchorDate reports whether anchorDate can produce valid demo dates.
func ValidateAnchorDate(anchorDate values.CivilDate) error {
	const latestTemplateOffsetDays = 12

	historyStart := monthsBefore(anchorDate.Time(), DefaultMaxMonths)
	latestTemplateDate := anchorDate.Time().AddDate(0, 0, latestTemplateOffsetDays)
	if historyStart.Year() < 0 || latestTemplateDate.Year() > 9999 {
		return services.InvalidRequest("demo anchor date is outside the supported seed range")
	}

	return nil
}

type seedBuilder struct {
	services   Services
	anchorDate values.CivilDate
	maxMonths  int
	summary    Summary
	members    map[string]int64
	accounts   map[string]int64
	cats       map[string]int64
	tags       map[string]int64
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
	if err := b.seedRecurringDefinitions(ctx); err != nil {
		return err
	}
	if err := b.seedTransactionTemplates(ctx); err != nil {
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
		featured    bool
	}{
		{"bank:Chase:joint_checking", accounts.AccountTypeOwned, strPtr("USD"), true},
		{"bank:Chase:Sapphire", accounts.AccountTypeOwned, strPtr("USD"), true},
		{"bank:Chase:fees", accounts.AccountTypeFlow, strPtr("USD"), false},
		{"bank:Chase:interest", accounts.AccountTypeFlow, strPtr("USD"), false},
		{"bank:Amex:BlueCash", accounts.AccountTypeOwned, strPtr("USD"), false},
		{"bank:Ally:emergency_savings", accounts.AccountTypeOwned, strPtr("USD"), true},
		{"bank:Rocket:mortgage", accounts.AccountTypeFlow, strPtr("USD"), false},
		{"bank:Fidelity:USD", accounts.AccountTypeOwned, strPtr("USD"), false},
		{"bank:Fidelity:EUR", accounts.AccountTypeOwned, strPtr("EUR"), false},
		{"bank:Fidelity:JPY", accounts.AccountTypeOwned, strPtr("JPY"), false},
		{"cash:Wallet", accounts.AccountTypeOwned, nil, false},
		{"cash:Home-Stash", accounts.AccountTypeOwned, nil, false},
		{"employers:Acme:salary", accounts.AccountTypeFlow, strPtr("USD"), false},
		{"employers:Acme:expenses", accounts.AccountTypeParty, strPtr("USD"), false},
		{"clients:NorthstarDesign", accounts.AccountTypeFlow, strPtr("USD"), false},
		{"merchant:TraderJoes", accounts.AccountTypeFlow, strPtr("USD"), false},
		{"merchant:BlueBottle", accounts.AccountTypeFlow, strPtr("USD"), false},
		{"merchant:MTA", accounts.AccountTypeFlow, strPtr("USD"), false},
		{"merchant:Shell", accounts.AccountTypeFlow, strPtr("USD"), false},
		{"merchant:Target", accounts.AccountTypeFlow, strPtr("USD"), false},
		{"merchant:Netflix", accounts.AccountTypeFlow, strPtr("USD"), false},
		{"merchant:CVS", accounts.AccountTypeFlow, strPtr("USD"), false},
		{"merchant:ConEd", accounts.AccountTypeFlow, strPtr("USD"), false},
		{"merchant:PowellsBooks", accounts.AccountTypeFlow, strPtr("USD"), false},
		{"merchant:Amazon:flow", accounts.AccountTypeFlow, strPtr("USD"), false},
		{"merchant:Amazon:gift_card", accounts.AccountTypeOwned, strPtr("USD"), false},
		{"merchant:unspecified", accounts.AccountTypeFlow, nil, false},
		{"insurer:StateFarm", accounts.AccountTypeFlow, strPtr("USD"), false},
		{"person:Friend:Jordan", accounts.AccountTypeParty, strPtr("USD"), false},
		{"person:Pool:BeachHouse", accounts.AccountTypeParty, strPtr("USD"), false},
	}
	for _, input := range accountInputs {
		var displayLabel *string
		if input.fqn == "merchant:Amazon:flow" {
			displayLabel = strPtr("Amazon")
		}
		account, err := b.services.Accounts.Create(ctx, accounts.CreateInput{
			FQN:          input.fqn,
			DisplayLabel: displayLabel,
			AccountType:  input.accountType,
			Currency:     input.currency,
			IsFeatured:   input.featured,
		})
		if err != nil {
			return fmt.Errorf("create account %q: %w", input.fqn, err)
		}
		b.accounts[input.fqn] = account.ID
		b.summary.Accounts++
	}

	systemType := accounts.AccountTypeSystem
	systemAccounts, err := b.services.Accounts.List(ctx, accounts.ListOptions{
		IncludeHidden: true,
		AccountType:   &systemType,
	})
	if err != nil {
		return fmt.Errorf("list fixed system accounts: %w", err)
	}
	for _, account := range systemAccounts.Items {
		b.accounts[account.FQN] = account.ID
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
		{"Bank:Fees", categories.CategoryEconomicIntentExpense},
		{"Refunds:Retail", categories.CategoryEconomicIntentExpense},
		{"Housing:Mortgage:Principal", categories.CategoryEconomicIntentExpense},
		{"Housing:Mortgage:Interest", categories.CategoryEconomicIntentExpense},
		{"Housing:Mortgage:Escrow", categories.CategoryEconomicIntentExpense},
		{"Housing:Mortgage:Insurance", categories.CategoryEconomicIntentExpense},
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
		{"Travel:Vacation", categories.CategoryEconomicIntentExpense},
		{"Travel:Dining", categories.CategoryEconomicIntentExpense},
		{"Travel:Transit", categories.CategoryEconomicIntentExpense},
		{"Income:Bonus", categories.CategoryEconomicIntentIncome},
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
		b.lisbonTag(),
		b.tokyoTag(),
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

func (b *seedBuilder) seedTransactionTemplates(ctx context.Context) error {
	const cleaningMerchantFQN = "merchant:BrightHomeCleaning"
	cleaningMerchant, err := b.services.Accounts.Create(ctx, accounts.CreateInput{
		FQN:         cleaningMerchantFQN,
		AccountType: accounts.AccountTypeFlow,
		Currency:    strPtr("USD"),
	})
	if err != nil {
		return fmt.Errorf("create account %q: %w", cleaningMerchantFQN, err)
	}
	b.accounts[cleaningMerchantFQN] = cleaningMerchant.ID
	b.summary.Accounts++

	const cleaningCategoryFQN = "Housing:Cleaning"
	cleaningCategory, err := b.services.Categories.Create(ctx, categories.CreateInput{
		FQN:            cleaningCategoryFQN,
		EconomicIntent: categories.CategoryEconomicIntentExpense,
	})
	if err != nil {
		return fmt.Errorf("create category %q: %w", cleaningCategoryFQN, err)
	}
	b.cats[cleaningCategoryFQN] = cleaningCategory.ID
	b.summary.Categories++

	inputs := []transactiontemplates.WriteInput{
		{
			FQN: "Household:Cleaning:Cash Payment",
			Records: []transactiontemplates.TemplateRecordInput{
				b.templateRecord("cash:Wallet", "Morgan", "USD", -12000, "", []string{"Projects:Home"}, "Household cleaning"),
				b.templateRecord(cleaningMerchantFQN, "", "USD", 12000, cleaningCategoryFQN, []string{"Projects:Home"}, "Household cleaning"),
			},
		},
		{
			FQN: "Income:Freelance Deposit",
			Records: []transactiontemplates.TemplateRecordInput{
				b.templateRecord("bank:Chase:joint_checking", "Morgan", "USD", 85000, "", []string{"Income"}, "Freelance design"),
				b.templateRecord("clients:NorthstarDesign", "", "USD", -85000, "Income:Freelance", []string{"Income"}, "Freelance design"),
			},
		},
		{
			FQN: "Cash:ATM Withdrawal",
			Records: []transactiontemplates.TemplateRecordInput{
				b.templateRecord("bank:Chase:joint_checking", "", "USD", -12000, "", []string{"Cash"}, "ATM withdrawal"),
				b.templateRecord("cash:Wallet", "", "USD", 12000, "", []string{"Cash"}, "ATM withdrawal"),
			},
		},
		{
			FQN: "Household:Cleaning:Finish in Advanced",
			Records: []transactiontemplates.TemplateRecordInput{
				b.templateRecord("cash:Wallet", "Morgan", "USD", -12000, "", []string{"Projects:Home"}, ""),
			},
		},
	}
	for _, input := range inputs {
		if _, err := b.services.Templates.Create(ctx, input); err != nil {
			return fmt.Errorf("create transaction template %q: %w", input.FQN, err)
		}
		b.summary.TransactionTemplates++
	}

	return nil
}

func (b *seedBuilder) seedRatesAndLimits(ctx context.Context) error {
	for _, input := range []exchangerates.CreateInput{
		{
			FromCurrency:  "EUR",
			ToCurrency:    "USD",
			Rate:          mustDecimal("1.08000000"),
			EffectiveDate: mustDate(b.templateDate("2026-04-03")),
		},
		{
			FromCurrency:  "EUR",
			ToCurrency:    "USD",
			Rate:          mustDecimal("1.09000000"),
			EffectiveDate: mustDate(b.templateDate("2026-04-17")),
		},
		{
			FromCurrency:  "EUR",
			ToCurrency:    "USD",
			Rate:          mustDecimal("1.10000000"),
			EffectiveDate: mustDate(b.templateDate("2026-05-08")),
		},
		{
			FromCurrency:  "EUR",
			ToCurrency:    "USD",
			Rate:          mustDecimal("1.12000000"),
			EffectiveDate: mustDate(b.templateDate("2026-05-22")),
		},
		{
			FromCurrency:  "JPY",
			ToCurrency:    "USD",
			Rate:          mustDecimal("0.00670000"),
			EffectiveDate: mustDate(b.templateDate("2026-04-10")),
		},
		{
			FromCurrency:  "JPY",
			ToCurrency:    "USD",
			Rate:          mustDecimal("0.00680000"),
			EffectiveDate: mustDate(b.templateDate("2026-05-15")),
		},
	} {
		if _, err := b.services.ExchangeRates.Create(ctx, input); err != nil {
			return fmt.Errorf(
				"create exchange rate %s/%s %s: %w",
				input.FromCurrency,
				input.ToCurrency,
				formatDate(input.EffectiveDate),
				err,
			)
		}
		b.summary.ExchangeRates++
	}

	for _, input := range []struct {
		account string
		limit   string
		date    string
	}{
		{"bank:Chase:Sapphire", "18000.00", "2026-04-01"},
		{"bank:Amex:BlueCash", "12000.00", "2026-04-01"},
		{"bank:Chase:Sapphire", "20000.00", "2026-05-15"},
	} {
		if _, err := b.services.CreditLimits.Create(ctx, b.accounts[input.account], creditlimits.CreateInput{
			CreditLimit:   mustDecimal(input.limit),
			EffectiveDate: mustCivilDate(b.templateDate(input.date)),
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
	if err := b.seedRecurringHistory(ctx); err != nil {
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
	historyStart := b.historyStart()
	for date := b.anchorDate.Time().AddDate(0, 0, -2); !date.Before(historyStart); date = date.AddDate(0, 0, -14) {
		if err := b.tx(ctx, formatDate(date),
			b.rec("bank:Chase:joint_checking", "Avery", "USD", 325000, 325000, "", []string{"Income"}, "Acme payroll"),
			b.rec("employers:Acme:salary", "", "USD", -325000, -325000, "Income:Salary", []string{"Income"}, "Acme payroll"),
		); err != nil {
			return err
		}
	}
	for month := 0; ; month++ {
		date := b.fullHistoryStart().AddDate(0, month, 10)
		if date.After(b.anchorDate.Time()) {
			break
		}
		if err := b.tx(ctx, formatDate(date),
			b.rec("bank:Chase:joint_checking", "Morgan", "USD", 85000, 85000, "", []string{"Income"}, "Freelance design"),
			b.rec("clients:NorthstarDesign", "", "USD", -85000, -85000, "Income:Freelance", []string{"Income"}, "Freelance design"),
		); err != nil {
			return err
		}
	}
	if err := b.tx(ctx, formatDate(b.anchorDate.Time().AddDate(0, 0, -30)),
		b.rec("bank:Chase:joint_checking", "Avery", "USD", 500000, 500000, "", []string{"Income"}, "Annual performance bonus"),
		b.rec("employers:Acme:salary", "", "USD", -500000, -500000, "Income:Bonus", []string{"Income"}, "Annual performance bonus"),
	); err != nil {
		return err
	}
	if err := b.tx(ctx, formatDate(b.anchorDate.Time().AddDate(0, 0, -7)),
		b.rec("bank:Chase:joint_checking", "Avery", "USD", -50000, -50000, "", []string{"Income"}, "Bonus overpayment clawback"),
		b.rec("employers:Acme:salary", "", "USD", 50000, 50000, "Income:Bonus", []string{"Income"}, "Bonus overpayment clawback"),
	); err != nil {
		return err
	}

	return nil
}

func (b *seedBuilder) seedRecurringHistory(ctx context.Context) error {
	fullHistoryStart := b.fullHistoryStart()
	mortgageAnchor := mustCivilDate(b.templateDate("2026-06-05"))
	chasePaymentAnchor := mustCivilDate(b.templateDate("2026-06-12"))
	streamingAnchor := mustCivilDate(b.templateDate("2026-06-10"))
	mortgageOccurrenceAnchor := b.monthlyOccurrenceAnchor("2026-06-05")
	chasePaymentOccurrenceAnchor := b.monthlyOccurrenceAnchor("2026-06-12")
	streamingOccurrenceAnchor := b.monthlyOccurrenceAnchor("2026-06-10")
	for month := 0; month < DefaultMaxMonths; month++ {
		mortgageDate := recurring.IntervalDueDate(mortgageAnchor, month-DefaultMaxMonths, "MONTH").Time()
		if !mortgageDate.After(b.anchorDate.Time()) && mortgageDate.Before(mortgageOccurrenceAnchor.Time()) {
			if err := b.tx(ctx, formatDate(mortgageDate),
				b.rec("bank:Chase:joint_checking", "", "USD", -300000, -300000, "", []string{"Shared:Family"}, "Mortgage payment"),
				b.rec("bank:Rocket:mortgage", "", "USD", 220000, 220000, "Housing:Mortgage:Principal", []string{"Shared:Family"}, "Mortgage principal"),
				b.rec("bank:Rocket:mortgage", "", "USD", 45000, 45000, "Housing:Mortgage:Interest", []string{"Shared:Family"}, "Mortgage interest"),
				b.rec("bank:Rocket:mortgage", "", "USD", 25000, 25000, "Housing:Mortgage:Escrow", []string{"Shared:Family"}, "Mortgage escrow"),
				b.rec("bank:Rocket:mortgage", "", "USD", 10000, 10000, "Housing:Mortgage:Insurance", []string{"Shared:Family"}, "Mortgage insurance"),
			); err != nil {
				return err
			}
		}

		chasePaymentDate := recurring.IntervalDueDate(chasePaymentAnchor, month-DefaultMaxMonths, "MONTH").Time()
		if !chasePaymentDate.After(b.anchorDate.Time()) && chasePaymentDate.Before(chasePaymentOccurrenceAnchor.Time()) {
			if err := b.tx(ctx, formatDate(chasePaymentDate),
				b.rec("bank:Chase:joint_checking", "", "USD", -45000, -45000, "", []string{"CardPayment"}, "Credit card payment"),
				b.rec("bank:Chase:Sapphire", "", "USD", 45000, 45000, "", []string{"CardPayment"}, "Credit card payment"),
			); err != nil {
				return err
			}
		}
		amexPaymentDate := fullHistoryStart.AddDate(0, month, 17)
		if !amexPaymentDate.After(b.anchorDate.Time()) {
			if err := b.tx(ctx, formatDate(amexPaymentDate),
				b.rec("bank:Chase:joint_checking", "", "USD", -25000, -25000, "", []string{"CardPayment"}, "Credit card payment"),
				b.rec("bank:Amex:BlueCash", "", "USD", 25000, 25000, "", []string{"CardPayment"}, "Credit card payment"),
			); err != nil {
				return err
			}
		}
		utilityDate := fullHistoryStart.AddDate(0, month, 7)
		if !utilityDate.After(b.anchorDate.Time()) {
			amount := 16500 + month*287
			if err := b.simpleSpend(ctx, formatDate(utilityDate), "bank:Chase:joint_checking", "merchant:ConEd", "Housing:Utilities", amount, "Electric bill", []string{"Shared:Family"}); err != nil {
				return err
			}
		}
		streamingDate := recurring.IntervalDueDate(streamingAnchor, month-DefaultMaxMonths, "MONTH").Time()
		if !streamingDate.After(b.anchorDate.Time()) && streamingDate.Before(streamingOccurrenceAnchor.Time()) {
			if err := b.simpleSpend(ctx, formatDate(streamingDate), "bank:Chase:joint_checking", "merchant:Netflix", "Entertainment:Streaming", 2199, "Streaming subscription", []string{"Shared:Family"}); err != nil {
				return err
			}
		}
	}
	weeklyOccurrenceAnchor := b.weeklyOccurrenceAnchor()
	for date := b.weeklyTransferStartDate(); date.Before(weeklyOccurrenceAnchor.Time()); date = date.AddDate(0, 0, 7) {
		if err := b.tx(ctx, formatDate(date),
			b.rec("bank:Chase:joint_checking", "", "USD", -25000, -25000, "", []string{"Shared:Family"}, "Weekly savings transfer"),
			b.rec("bank:Ally:emergency_savings", "", "USD", 25000, 25000, "", []string{"Shared:Family"}, "Weekly savings transfer"),
		); err != nil {
			return err
		}
	}

	return nil
}

func (b *seedBuilder) seedRecurringDefinitions(ctx context.Context) error {
	definitions := []recurring.WriteInput{
		{
			FQN:          "Household:Mortgage",
			ScheduleRule: intervalScheduleRule(1, "MONTH"),
			AnchorDate:   b.monthlyOccurrenceAnchor("2026-06-05"),
			Records: []recurring.RecordInput{
				b.recurringRecord("bank:Chase:joint_checking", "USD", -300000, "", []string{"Shared:Family"}, "Mortgage payment"),
				b.recurringRecord("bank:Rocket:mortgage", "USD", 220000, "Housing:Mortgage:Principal", []string{"Shared:Family"}, "Mortgage principal"),
				b.recurringRecord("bank:Rocket:mortgage", "USD", 45000, "Housing:Mortgage:Interest", []string{"Shared:Family"}, "Mortgage interest"),
				b.recurringRecord("bank:Rocket:mortgage", "USD", 25000, "Housing:Mortgage:Escrow", []string{"Shared:Family"}, "Mortgage escrow"),
				b.recurringRecord("bank:Rocket:mortgage", "USD", 10000, "Housing:Mortgage:Insurance", []string{"Shared:Family"}, "Mortgage insurance"),
			},
		},
		{
			FQN:          "Subscriptions:Netflix",
			ScheduleRule: intervalScheduleRule(1, "MONTH"),
			AnchorDate:   b.monthlyOccurrenceAnchor("2026-06-10"),
			Records: []recurring.RecordInput{
				b.recurringRecord("bank:Chase:joint_checking", "USD", -2199, "", []string{"Shared:Family"}, "Streaming subscription"),
				b.recurringRecord("merchant:Netflix", "USD", 2199, "Entertainment:Streaming", []string{"Shared:Family"}, "Streaming subscription"),
			},
		},
		{
			FQN:          "Savings:WeeklyTransfer",
			ScheduleRule: intervalScheduleRule(1, "WEEK"),
			AnchorDate:   b.weeklyOccurrenceAnchor(),
			Records: []recurring.RecordInput{
				b.recurringRecord("bank:Chase:joint_checking", "USD", -25000, "", []string{"Shared:Family"}, "Weekly savings transfer"),
				b.recurringRecord("bank:Ally:emergency_savings", "USD", 25000, "", []string{"Shared:Family"}, "Weekly savings transfer"),
			},
		},
		{
			FQN:          "Debt:CreditCardPayment",
			ScheduleRule: intervalScheduleRule(1, "MONTH"),
			AnchorDate:   b.monthlyOccurrenceAnchor("2026-06-12"),
			Records: []recurring.RecordInput{
				b.recurringRecord("bank:Chase:joint_checking", "USD", -45000, "", []string{"CardPayment"}, "Credit card payment"),
				b.recurringRecord("bank:Chase:Sapphire", "USD", 45000, "", []string{"CardPayment"}, "Credit card payment"),
			},
		},
	}
	for _, input := range definitions {
		if _, err := b.services.Recurring.Create(ctx, input); err != nil {
			return fmt.Errorf("create recurring definition %q: %w", input.FQN, err)
		}
		b.summary.RecurringDefinitions++
	}

	occurrences, err := b.services.Recurring.ListOccurrences(ctx, recurring.OccurrenceListOptions{
		ListOptions: services.ListOptions{IncludeTotalCount: true},
		Today:       b.anchorDate,
	})
	if err != nil {
		return fmt.Errorf("materialize recurring occurrences: %w", err)
	}
	b.summary.RecurringOccurrences = int(occurrences.TotalCount)

	return nil
}

func (b *seedBuilder) seedDailySpend(ctx context.Context) error {
	for day, current := 0, b.fullHistoryStart(); !current.After(b.anchorDate.Time()); day, current = day+1, current.AddDate(0, 0, 1) {
		date := formatDate(current)
		if day%10 == 4 {
			if err := b.tx(ctx, date,
				b.rec("bank:Chase:Sapphire", "Avery", "USD", -7200, -7200, "", []string{"Shared:Jordan"}, "Dinner split with Jordan"),
				b.rec("merchant:unspecified", "", "USD", 5400, 5400, "Food:Restaurants", []string{"Shared:Jordan"}, "Dinner split with Jordan"),
				b.rec("person:Friend:Jordan", "", "USD", 1800, 1800, "", []string{"Shared:Jordan"}, "Jordan share of dinner"),
			); err != nil {
				return err
			}
			continue
		}
		merchant, category, amount, member, memo := dailySpend(day)
		card := "bank:Chase:Sapphire"
		if day%3 == 0 {
			card = "bank:Amex:BlueCash"
		}
		if err := b.simpleSpendWithMember(ctx, date, card, merchant, category, amount, member, memo, []string{"Shared:Family"}); err != nil {
			return err
		}
	}

	return nil
}

func (b *seedBuilder) seedCashAndFriends(ctx context.Context) error {
	for _, date := range []string{"2026-04-04", "2026-04-19", "2026-05-03", "2026-05-17", "2026-05-30"} {
		if err := b.tx(ctx, b.templateDate(date),
			b.rec("bank:Chase:joint_checking", "", "USD", -12000, -12000, "", []string{"Cash"}, "ATM withdrawal"),
			b.rec("cash:Wallet", "", "USD", 12000, 12000, "", []string{"Cash"}, "ATM withdrawal"),
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
		if err := b.simpleSpend(ctx, b.templateDate(input.date), "cash:Wallet", "merchant:unspecified", "Food:Restaurants", input.amount, input.memo, []string{"Cash"}); err != nil {
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
		if err := b.tx(ctx, b.templateDate(input.date),
			b.rec("bank:Chase:joint_checking", "", "USD", checkingAmount, checkingAmount, "", []string{"Shared:Jordan"}, input.memo),
			b.rec("person:Friend:Jordan", "", "USD", friendAmount, friendAmount, "", []string{"Shared:Jordan"}, input.memo),
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
		if err := b.tx(ctx, b.templateDate(input.date),
			b.rec("bank:Chase:joint_checking", "", "USD", -input.amount, -input.amount, "", []string{b.lisbonTag()}, "Beach house money pool"),
			b.rec("person:Pool:BeachHouse", "", "USD", input.amount, input.amount, "", []string{b.lisbonTag()}, "Beach house money pool"),
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
		{"2026-04-18", 43200, 40000, "merchant:unspecified", "Travel:Vacation", "Lisbon hotel deposit", b.lisbonTag(), "bank:Chase:Sapphire", "USD", 43200},
		{"2026-04-19", 5400, 5000, "merchant:unspecified", "Travel:Dining", "Lisbon dinner", b.lisbonTag(), "bank:Chase:Sapphire", "USD", 5400},
		{"2026-05-07", 10900, 10000, "merchant:unspecified", "Travel:Dining", "Lisbon food tour", b.lisbonTag(), "bank:Chase:Sapphire", "USD", 10900},
		{"2026-05-21", 6720, 6000, "merchant:unspecified", "Travel:Dining", "Lisbon cafe", b.lisbonTag(), "cash:Wallet", "EUR", 6000},
	} {
		records := []transactions.JournalRecordInput{
			b.rec(input.payAccount, "Morgan", input.payCurrency, -input.payCents, -input.usdCents, "", []string{input.tag}, input.memo),
			b.rec(input.merchant, "", "EUR", input.eurCents, input.usdCents, input.category, []string{input.tag}, input.memo),
		}
		if input.payCurrency != "EUR" {
			if err := b.tx(ctx, b.templateDate(input.date),
				b.rec(input.payAccount, "Morgan", input.payCurrency, -input.payCents, -input.usdCents, "", []string{input.tag}, input.memo),
				b.rec("system:exchange", "", input.payCurrency, input.payCents, input.usdCents, "", []string{input.tag}, input.memo),
				b.rec("system:exchange", "", "EUR", -input.eurCents, -input.usdCents, "", []string{input.tag}, input.memo),
				b.rec("cash:Wallet", "", "EUR", input.eurCents, input.usdCents, "", []string{input.tag}, input.memo),
			); err != nil {
				return err
			}
			records = []transactions.JournalRecordInput{
				b.rec("cash:Wallet", "Morgan", "EUR", -input.eurCents, -input.usdCents, "", []string{input.tag}, input.memo),
				b.rec(input.merchant, "", "EUR", input.eurCents, input.usdCents, input.category, []string{input.tag}, input.memo),
			}
		}
		if err := b.tx(ctx, b.templateDate(input.date), records...); err != nil {
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
		if err := b.tx(ctx, b.templateDate(input.date),
			b.rec("bank:Chase:Sapphire", "Riley", "USD", -input.usdCents, -input.usdCents, "", []string{b.tokyoTag()}, "Tokyo transit card"),
			b.rec("system:exchange", "", "USD", input.usdCents, input.usdCents, "", []string{b.tokyoTag()}, "Tokyo transit card"),
			b.rec("system:exchange", "", "JPY", -input.jpyCents, -input.usdCents, "", []string{b.tokyoTag()}, "Tokyo transit card"),
			b.rec("cash:Home-Stash", "", "JPY", input.jpyCents, input.usdCents, "", []string{b.tokyoTag()}, "Tokyo transit card"),
		); err != nil {
			return err
		}
		if err := b.tx(ctx, b.templateDate(input.date),
			b.rec("cash:Home-Stash", "Riley", "JPY", -input.jpyCents, -input.usdCents, "", []string{b.tokyoTag()}, "Tokyo transit card"),
			b.rec("merchant:unspecified", "", "JPY", input.jpyCents, input.usdCents, "Travel:Transit", []string{b.tokyoTag()}, "Tokyo transit card"),
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
		if err := b.tx(ctx, b.templateDate(input.date),
			b.rec("bank:Chase:joint_checking", "", "USD", -input.usdCents, -input.usdCents, "", []string{b.lisbonTag()}, "Currency exchange"),
			b.rec("system:exchange", "", "USD", input.usdCents, input.usdCents, "", []string{b.lisbonTag()}, "Currency exchange"),
			b.rec("system:exchange", "", "EUR", -input.eurCents, -input.usdCents, "", []string{b.lisbonTag()}, "Currency exchange"),
			b.rec("cash:Wallet", "", "EUR", input.eurCents, input.usdCents, "", []string{b.lisbonTag()}, "Currency exchange"),
		); err != nil {
			return err
		}
	}

	return nil
}

func (b *seedBuilder) seedSemanticCoverage(ctx context.Context) error {
	openingBalanceDate := b.fullHistoryStart()
	if err := b.tx(ctx, formatDate(openingBalanceDate),
		b.rec("bank:Chase:joint_checking", "", "USD", 2500000, 2500000, "", []string{"Shared:Family"}, "Opening balance"),
		b.rec("system:opening_balance", "", "USD", -2500000, -2500000, "", []string{"Shared:Family"}, "Opening balance"),
	); err != nil {
		return err
	}
	if err := b.tx(ctx, b.templateDate("2026-04-09"),
		b.rec("bank:Chase:joint_checking", "", "USD", 3499, 3499, "", []string{"Shared:Family"}, "Target return"),
		b.rec("merchant:Target", "", "USD", -3499, -3499, "Shopping:Household", []string{"Shared:Family"}, "Target return"),
	); err != nil {
		return err
	}
	if err := b.tx(ctx, b.templateDate("2026-04-15"),
		b.rec("bank:Chase:joint_checking", "", "USD", -10000, -10000, "", []string{"Shared:Family"}, "Wire transfer with fee"),
		b.rec("bank:Ally:emergency_savings", "", "USD", 10000, 10000, "", []string{"Shared:Family"}, "Wire transfer with fee"),
		b.rec("bank:Chase:joint_checking", "", "USD", -25, -25, "", []string{"Shared:Family"}, "Wire transfer fee"),
		b.rec("bank:Chase:fees", "", "USD", 25, 25, "Bank:Fees", []string{"Shared:Family"}, "Wire transfer fee"),
	); err != nil {
		return err
	}
	if err := b.tx(ctx, b.templateDate("2026-04-21"),
		b.rec("cash:Wallet", "", "EUR", 1200, 1308, "", []string{b.lisbonTag()}, "EUR correction"),
		b.rec("system:correction", "", "EUR", -1200, -1308, "", []string{b.lisbonTag()}, "EUR correction"),
	); err != nil {
		return err
	}
	if err := b.tx(ctx, b.templateDate("2026-04-23"),
		b.rec("bank:Chase:joint_checking", "", "USD", 215, 215, "", []string{"Income"}, "Checking interest"),
		b.rec("bank:Chase:interest", "", "USD", -215, -215, "Income:BankInterest", []string{"Income"}, "Checking interest"),
	); err != nil {
		return err
	}
	if err := b.tx(ctx, b.templateDate("2026-05-26"),
		b.rec("bank:Chase:joint_checking", "Avery", "USD", -500, -500, "", []string{"Shared:Family"}, "Mixed payroll correction"),
		b.rec("merchant:BlueBottle", "", "USD", 500, 500, "Food:Coffee", []string{"Shared:Family"}, "Mixed payroll correction"),
		b.rec("bank:Chase:joint_checking", "Avery", "USD", 10000, 10000, "", []string{"Income"}, "Mixed payroll correction"),
		b.rec("employers:Acme:salary", "", "USD", -10000, -10000, "Income:Salary", []string{"Income"}, "Mixed payroll correction"),
	); err != nil {
		return err
	}
	if err := b.tx(ctx, b.templateDate("2026-05-27"),
		b.rec("bank:Chase:joint_checking", "Morgan", "USD", -8250, -8250, "", []string{"Shared:Family"}, "Household errands"),
		b.rec("merchant:TraderJoes", "", "USD", 5425, 5425, "Food:Groceries", []string{"Shared:Family"}, "Household errands"),
		b.rec("merchant:Target", "", "USD", 2825, 2825, "Shopping:Household", []string{"Shared:Family"}, "Household errands"),
	); err != nil {
		return err
	}
	if err := b.tx(ctx, b.templateDate("2026-05-28"),
		b.rec("bank:Chase:Sapphire", "Avery", "USD", -4200, -4200, "", []string{"Shared:Family"}, "Reimbursable client dinner"),
		b.rec("employers:Acme:expenses", "", "USD", 4200, 4200, "", []string{"Shared:Family"}, "Reimbursable client dinner"),
	); err != nil {
		return err
	}
	if err := b.tx(ctx, b.templateDate("2026-05-29"),
		b.rec("bank:Chase:joint_checking", "", "USD", -10000, -10000, "", []string{"Shared:Family"}, "Fund Amazon gift card"),
		b.rec("merchant:Amazon:gift_card", "", "USD", 10000, 10000, "", []string{"Shared:Family"}, "Fund Amazon gift card"),
	); err != nil {
		return err
	}
	if err := b.simpleSpend(ctx, b.templateDate("2026-05-30"), "merchant:Amazon:gift_card", "merchant:Amazon:flow", "Shopping:Household", 3500, "Amazon gift card purchase", []string{"Shared:Family"}); err != nil {
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
		b.rec(source, member, "USD", -amount, -amount, "", tagFQNs, memo),
		b.rec(merchant, "", "USD", amount, amount, category, tagFQNs, memo),
	)
}

func (b *seedBuilder) tx(ctx context.Context, date string, records ...transactions.JournalRecordInput) error {
	initiatedDate := mustCivilDate(date)
	if initiatedDate.Time().Before(b.historyStart()) {
		return nil
	}
	if _, err := b.services.Transactions.Create(ctx, transactions.CreateInput{
		InitiatedDate: initiatedDate,
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
	var categoryID *int64
	if categoryFQN != "" {
		id := b.cats[categoryFQN]
		categoryID = &id
	}
	var settlement *transactions.SettlementIntent
	if categoryID == nil && !strings.HasPrefix(accountFQN, "system:") {
		settlement = &transactions.SettlementIntent{Status: transactions.SettlementStatusPosted}
	}

	return transactions.JournalRecordInput{
		AccountID:            b.accounts[accountFQN],
		MemberID:             memberID,
		Currency:             currency,
		Amount:               money(amountCents),
		AmountUSD:            decimalPtr(money(amountUSDCents)),
		CategoryID:           categoryID,
		TagIDs:               tagIDs,
		Memo:                 strPtr(memo),
		Settlement:           settlement,
		ReconciliationStatus: transactions.ReconciliationStatusReconciled,
		Source:               transactions.SourceManual,
	}
}

func (b *seedBuilder) templateRecord(
	accountFQN string,
	memberName string,
	currency string,
	amountCents int,
	categoryFQN string,
	tagFQNs []string,
	memo string,
) transactiontemplates.TemplateRecordInput {
	accountID := b.accounts[accountFQN]
	var memberID *int64
	if memberName != "" {
		id := b.members[memberName]
		memberID = &id
	}
	var categoryID *int64
	if categoryFQN != "" {
		id := b.cats[categoryFQN]
		categoryID = &id
	}
	tagIDs := make([]int64, 0, len(tagFQNs))
	for _, fqn := range tagFQNs {
		tagIDs = append(tagIDs, b.tags[fqn])
	}
	amount := money(amountCents)

	return transactiontemplates.TemplateRecordInput{
		AccountID:  &accountID,
		MemberID:   memberID,
		Currency:   strPtr(currency),
		Amount:     &amount,
		CategoryID: categoryID,
		TagIDs:     tagIDs,
		Memo:       strPtr(memo),
	}
}

func (b *seedBuilder) recurringRecord(accountFQN, currency string, amountCents int, categoryFQN string, tagFQNs []string, memo string) recurring.RecordInput {
	accountID := b.accounts[accountFQN]
	var categoryID *int64
	if categoryFQN != "" {
		id := b.cats[categoryFQN]
		categoryID = &id
	}
	tagIDs := make([]int64, 0, len(tagFQNs))
	for _, fqn := range tagFQNs {
		tagIDs = append(tagIDs, b.tags[fqn])
	}
	amount := money(amountCents)

	return recurring.RecordInput{
		AccountID:  &accountID,
		Currency:   strPtr(currency),
		Amount:     &amount,
		CategoryID: recurring.OptionalInt64{Specified: true, Value: categoryID},
		TagIDs:     recurring.OptionalInt64Slice{Specified: true, Values: tagIDs},
		Memo:       recurring.OptionalString{Specified: true, Value: strPtr(memo)},
	}
}

func intervalScheduleRule(every int, unit string) json.RawMessage {
	return json.RawMessage(fmt.Sprintf(`{"version":1,"kind":"interval","every":%d,"unit":%q}`, every, unit))
}

func (b *seedBuilder) historyStart() time.Time {
	return monthsBefore(b.anchorDate.Time(), b.historyMonths())
}

func (b *seedBuilder) historyMonths() int {
	return min(b.maxMonths, DefaultMaxMonths)
}

func (b *seedBuilder) fullHistoryStart() time.Time {
	return monthsBefore(b.anchorDate.Time(), DefaultMaxMonths)
}

func (b *seedBuilder) weeklyTransferStartDate() time.Time {
	return b.fullHistoryStart().AddDate(0, 0, 5)
}

func (b *seedBuilder) nextWeeklyTransferDate() time.Time {
	date := b.weeklyTransferStartDate()
	for !date.After(b.anchorDate.Time()) {
		date = date.AddDate(0, 0, 7)
	}

	return date
}

func (b *seedBuilder) monthlyOccurrenceAnchor(nextTemplateDate string) values.CivilDate {
	nextDate := mustCivilDate(b.templateDate(nextTemplateDate))
	historyStart := b.historyStart()
	for offset := -2; ; offset++ {
		anchor := recurring.IntervalDueDate(nextDate, offset, "MONTH")
		if !anchor.Time().Before(historyStart) {
			return anchor
		}
	}
}

func (b *seedBuilder) weeklyOccurrenceAnchor() values.CivilDate {
	anchor := b.nextWeeklyTransferDate().AddDate(0, 0, -6*7)
	for anchor.Before(b.historyStart()) {
		anchor = anchor.AddDate(0, 0, 7)
	}

	return values.CivilDateFromTime(anchor)
}

func monthsBefore(anchorDate time.Time, months int) time.Time {
	year, month, day := anchorDate.Date()
	targetMonth := time.Date(year, month-time.Month(months), 1, 0, 0, 0, 0, anchorDate.Location())
	targetMonthEnd := targetMonth.AddDate(0, 1, -1)
	if day > targetMonthEnd.Day() {
		day = targetMonthEnd.Day()
	}

	return time.Date(targetMonth.Year(), targetMonth.Month(), day, 0, 0, 0, 0, anchorDate.Location())
}

func (b *seedBuilder) templateDate(value string) string {
	const templateAnchor = "2026-05-31"

	offset := int(mustDate(value).Sub(mustDate(templateAnchor)) / (24 * time.Hour))

	return formatDate(b.anchorDate.Time().AddDate(0, 0, offset))
}

func (b *seedBuilder) lisbonTag() string {
	return b.tripTag("Lisbon", "2026-04-18")
}

func (b *seedBuilder) tokyoTag() string {
	return b.tripTag("Tokyo", "2026-04-24")
}

func (b *seedBuilder) tripTag(city, templateStartDate string) string {
	year := mustDate(b.templateDate(templateStartDate)).Year()

	return fmt.Sprintf("Trips:Vacation:%s%d", city, year)
}

func formatDate(value time.Time) string {
	return value.Format("2006-01-02")
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
		{"merchant:unspecified", "Food:Restaurants", 2840, "Avery", "Local restaurant"},
		{"merchant:PowellsBooks", "Entertainment:Books", 2150, "Morgan", "Books"},
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
