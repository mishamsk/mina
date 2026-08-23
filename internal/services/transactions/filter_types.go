package transactions

import (
	"time"

	"github.com/mishamsk/mina/internal/services/values"
)

// FilterField names one filterable transaction dimension.
type FilterField string

const (
	FilterFieldAccount    FilterField = "account"
	FilterFieldCategory   FilterField = "category"
	FilterFieldTag        FilterField = "tag"
	FilterFieldMember     FilterField = "member"
	FilterFieldCurrency   FilterField = "currency"
	FilterFieldRole       FilterField = "role"
	FilterFieldClass      FilterField = "class"
	FilterFieldLifecycle  FilterField = "lifecycle"
	FilterFieldSettlement FilterField = "settlement"
	FilterFieldShape      FilterField = "shape"
	FilterFieldAmount     FilterField = "amount"
	FilterFieldAmountUSD  FilterField = "amount_usd"
	FilterFieldInitiated  FilterField = "initiated"
	FilterFieldPending    FilterField = "pending"
	FilterFieldPosted     FilterField = "posted"
)

// FilterCompareOp is a comparison-term operator.
type FilterCompareOp string

const (
	// FilterCompareEqual matches values exactly.
	FilterCompareEqual FilterCompareOp = "="
	// FilterCompareGreater matches values above the term value.
	FilterCompareGreater FilterCompareOp = ">"
	// FilterCompareAtLeast matches values at or above the term value.
	FilterCompareAtLeast FilterCompareOp = ">="
	// FilterCompareLess matches values below the term value.
	FilterCompareLess FilterCompareOp = "<"
	// FilterCompareAtMost matches values at or below the term value.
	FilterCompareAtMost FilterCompareOp = "<="
)

// ResolvedFilter carries a validated filter expression.
type ResolvedFilter struct {
	Expression FilterExpression
}

// FilterExpression is one resolved node of a transaction filter tree.
type FilterExpression interface {
	filterExpression()
}

// FilterAnd conjoins its child expressions.
type FilterAnd struct {
	Terms []FilterExpression
}

// FilterOr disjoins its child expressions.
type FilterOr struct {
	Terms []FilterExpression
}

// FilterNot negates its child expression.
type FilterNot struct {
	Term FilterExpression
}

// FilterEntityTerm matches active journal records whose account, category, or
// tag resolves under an FQN. An empty FQN with Scoped true matches any entity
// of the kind.
type FilterEntityTerm struct {
	Field    FilterField
	FQN      string
	EntityID int64
	Scoped   bool
}

// FilterMemberTerm matches active journal records attributed to one member.
type FilterMemberTerm struct {
	Name     string
	MemberID int64
}

// FilterCurrencyTerm matches active records in one currency code.
type FilterCurrencyTerm struct {
	Currency string
}

// FilterEnumTerm matches one server-derived categorical value.
type FilterEnumTerm struct {
	Field FilterField
	Value string
}

// FilterDecimalTerm compares one signed decimal record attribute.
type FilterDecimalTerm struct {
	Field FilterField
	Op    FilterCompareOp
	Value values.Decimal
}

// FilterDateTerm compares the transaction initiated civil date.
type FilterDateTerm struct {
	Op   FilterCompareOp
	Date values.CivilDate
}

// FilterTimestampTerm compares one journal-record settlement timestamp.
type FilterTimestampTerm struct {
	Field FilterField
	Op    FilterCompareOp
	Time  time.Time
}

func (*FilterAnd) filterExpression()           {}
func (*FilterOr) filterExpression()            {}
func (*FilterNot) filterExpression()           {}
func (*FilterEntityTerm) filterExpression()    {}
func (*FilterMemberTerm) filterExpression()    {}
func (*FilterCurrencyTerm) filterExpression()  {}
func (*FilterEnumTerm) filterExpression()      {}
func (*FilterDecimalTerm) filterExpression()   {}
func (*FilterDateTerm) filterExpression()      {}
func (*FilterTimestampTerm) filterExpression() {}

var membershipFilterFields = map[FilterField]bool{
	FilterFieldAccount:    true,
	FilterFieldCategory:   true,
	FilterFieldTag:        true,
	FilterFieldMember:     true,
	FilterFieldCurrency:   true,
	FilterFieldRole:       true,
	FilterFieldClass:      true,
	FilterFieldLifecycle:  true,
	FilterFieldSettlement: true,
	FilterFieldShape:      true,
}

var comparisonFilterFields = map[FilterField]bool{
	FilterFieldAmount:    true,
	FilterFieldAmountUSD: true,
	FilterFieldInitiated: true,
	FilterFieldPending:   true,
	FilterFieldPosted:    true,
}

// FilterReferenceFQN resolves the active FQN for a category or tag ID while
// matching a non-persisted transaction.
type FilterReferenceFQN func(FilterField, int64) string
