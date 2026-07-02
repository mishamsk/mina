package transactiontemplates

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/accounts"
	"github.com/mishamsk/mina/internal/services/categories"
	"github.com/mishamsk/mina/internal/services/members"
	"github.com/mishamsk/mina/internal/services/tags"
	"github.com/mishamsk/mina/internal/services/transactions"
	"github.com/mishamsk/mina/internal/services/values"
)

// Template is a hierarchical, date-free set of reusable transaction record defaults.
type Template struct {
	ID           int64
	FQN          string
	ParentFQN    *string
	Name         string
	Level        int
	CreatedAt    time.Time
	UpdatedAt    time.Time
	TombstonedAt *time.Time
	Records      []TemplateRecord
}

// TemplateRecord is one reusable journal-record default inside a template.
type TemplateRecord struct {
	ID                   int64
	TemplateID           int64
	CategoryID           int64
	AccountID            *int64
	MemberID             *int64
	Currency             *string
	Amount               *values.Decimal
	TagIDs               []int64
	Memo                 *string
	PostingStatus        *transactions.PostingStatus
	ReconciliationStatus *transactions.ReconciliationStatus
	CreatedAt            time.Time
	UpdatedAt            time.Time
	TombstonedAt         *time.Time
}

// WriteInput contains fields for creating or replacing a transaction template.
type WriteInput struct {
	FQN     string
	Records []TemplateRecordInput
}

// TemplateRecordInput is one record default inside a transaction template write request.
type TemplateRecordInput struct {
	CategoryID           int64
	AccountID            *int64
	MemberID             *int64
	Currency             *string
	Amount               *values.Decimal
	TagIDs               []int64
	Memo                 *string
	PostingStatus        *transactions.PostingStatus
	ReconciliationStatus *transactions.ReconciliationStatus
}

// Repository persists transaction-template state.
type Repository interface {
	Create(context.Context, WriteInput) (Template, error)
	Get(context.Context, int64) (Template, error)
	List(context.Context, services.ListOptions) ([]Template, error)
	Replace(context.Context, int64, WriteInput) (Template, error)
	Tombstone(context.Context, int64) error
}

// AccountReader resolves active account references for template validation.
type AccountReader interface {
	List(context.Context, accounts.ListOptions) ([]accounts.Account, error)
}

// CategoryReader resolves active category references for template validation.
type CategoryReader interface {
	List(context.Context, categories.ListOptions) ([]categories.Category, error)
}

// TagReader resolves active tag references for template validation.
type TagReader interface {
	List(context.Context, tags.ListOptions) ([]tags.Tag, error)
}

// MemberReader resolves active household-member references for template validation.
type MemberReader interface {
	List(context.Context, members.ListOptions) ([]members.Member, error)
}

// Service owns transaction-template use cases and validation.
type Service struct {
	repo       Repository
	accounts   AccountReader
	categories CategoryReader
	tags       TagReader
	members    MemberReader
}

// NewService creates a transaction-template service backed by repositories.
func NewService(repo Repository, accounts AccountReader, categories CategoryReader, tags TagReader, members MemberReader) *Service {
	return &Service{
		repo:       repo,
		accounts:   accounts,
		categories: categories,
		tags:       tags,
		members:    members,
	}
}

// Create validates and creates a transaction template.
func (s *Service) Create(ctx context.Context, input WriteInput) (Template, error) {
	if err := s.validateTemplateInput(ctx, input.FQN, input.Records); err != nil {
		return Template{}, err
	}

	template, err := s.repo.Create(ctx, input)
	if errors.Is(err, services.ErrConflict) {
		return Template{}, services.Conflict("active transaction template fqn already exists")
	}
	if errors.Is(err, services.ErrInvalidReference) || errors.Is(err, services.ErrNotFound) {
		return Template{}, invalidReferenceError()
	}
	if err != nil {
		return Template{}, err
	}

	return template, nil
}

// Get returns an active transaction template with nested active record defaults by ID.
func (s *Service) Get(ctx context.Context, id int64) (Template, error) {
	if id <= 0 {
		return Template{}, services.InvalidRequest("transaction_template_id must be positive")
	}

	template, err := s.repo.Get(ctx, id)
	if errors.Is(err, services.ErrNotFound) {
		return Template{}, services.NotFound("transaction template not found")
	}
	if err != nil {
		return Template{}, err
	}

	return template, nil
}

// List returns active transaction templates with nested active record defaults.
func (s *Service) List(ctx context.Context, opts services.ListOptions) ([]Template, error) {
	if err := validateListOptions(opts); err != nil {
		return nil, err
	}

	return s.repo.List(ctx, opts)
}

// Replace validates and atomically replaces a transaction template's metadata and active records.
func (s *Service) Replace(ctx context.Context, id int64, input WriteInput) (Template, error) {
	if id <= 0 {
		return Template{}, services.InvalidRequest("transaction_template_id must be positive")
	}
	if err := validateTemplateInputShape(input.FQN, input.Records); err != nil {
		return Template{}, err
	}
	if _, err := s.repo.Get(ctx, id); errors.Is(err, services.ErrNotFound) {
		return Template{}, services.NotFound("transaction template not found")
	} else if err != nil {
		return Template{}, err
	}
	if err := s.validateTemplateReferences(ctx, input.Records); err != nil {
		return Template{}, err
	}

	template, err := s.repo.Replace(ctx, id, input)
	if errors.Is(err, services.ErrConflict) {
		return Template{}, services.Conflict("active transaction template fqn already exists")
	}
	if errors.Is(err, services.ErrInvalidReference) {
		return Template{}, invalidReferenceError()
	}
	if errors.Is(err, services.ErrNotFound) {
		return Template{}, services.NotFound("transaction template not found")
	}
	if err != nil {
		return Template{}, err
	}

	return template, nil
}

// Delete tombstones a transaction template and its active record defaults.
func (s *Service) Delete(ctx context.Context, id int64) error {
	if id <= 0 {
		return services.InvalidRequest("transaction_template_id must be positive")
	}

	if err := s.repo.Tombstone(ctx, id); errors.Is(err, services.ErrNotFound) {
		return services.NotFound("transaction template not found")
	} else if err != nil {
		return err
	}

	return nil
}

func (s *Service) validateTemplateInput(ctx context.Context, fqn string, records []TemplateRecordInput) error {
	if err := validateTemplateInputShape(fqn, records); err != nil {
		return err
	}

	return s.validateTemplateReferences(ctx, records)
}

func validateTemplateInputShape(fqn string, records []TemplateRecordInput) error {
	if err := validateFQN(fqn); err != nil {
		return err
	}
	if len(records) == 0 {
		return services.InvalidRequest("records must contain at least one record")
	}
	for index, record := range records {
		if err := validateTemplateRecordShape(index, record); err != nil {
			return err
		}
	}

	return nil
}

func validateTemplateRecordShape(index int, record TemplateRecordInput) error {
	if record.CategoryID <= 0 {
		return services.InvalidRequest(indexedField(index, "category_id") + " must be positive")
	}
	if record.AccountID != nil && *record.AccountID <= 0 {
		return services.InvalidRequest(indexedField(index, "account_id") + " must be positive")
	}
	if record.MemberID != nil && *record.MemberID <= 0 {
		return services.InvalidRequest(indexedField(index, "member_id") + " must be positive")
	}
	if record.Currency != nil && !values.ValidCurrencyCode(*record.Currency) {
		return services.InvalidRequest(indexedField(index, "currency") + " must be an ISO 4217 code or crypto code prefixed with C::")
	}
	if record.Amount != nil && record.Amount.IsZero() {
		return services.InvalidRequest(indexedField(index, "amount") + " must be non-zero")
	}
	if err := validateTagIDs(index, record.TagIDs); err != nil {
		return err
	}
	if record.Memo != nil && strings.TrimSpace(*record.Memo) != *record.Memo {
		return services.InvalidRequest(indexedField(index, "memo") + " must not have leading or trailing whitespace")
	}
	if record.PostingStatus != nil {
		switch *record.PostingStatus {
		case transactions.PostingStatusPending, transactions.PostingStatusPosted, transactions.PostingStatusCancelled:
		default:
			return services.InvalidRequest(indexedField(index, "posting_status") + " must be pending, posted, or cancelled")
		}
	}
	if record.ReconciliationStatus != nil {
		switch *record.ReconciliationStatus {
		case transactions.ReconciliationStatusReconciled, transactions.ReconciliationStatusUnreconciled:
		default:
			return services.InvalidRequest(indexedField(index, "reconciliation_status") + " must be reconciled or unreconciled")
		}
	}

	return nil
}

func (s *Service) validateTemplateReferences(ctx context.Context, records []TemplateRecordInput) error {
	references, err := s.referenceDictionaries(ctx)
	if err != nil {
		return err
	}
	for _, record := range records {
		if _, ok := references.categoryIDs[record.CategoryID]; !ok {
			return invalidReferenceError()
		}
		if record.AccountID != nil {
			if _, ok := references.accountIDs[*record.AccountID]; !ok {
				return invalidReferenceError()
			}
		}
		if record.MemberID != nil {
			if _, ok := references.memberIDs[*record.MemberID]; !ok {
				return invalidReferenceError()
			}
		}
		for _, tagID := range record.TagIDs {
			if _, ok := references.tagIDs[tagID]; !ok {
				return invalidReferenceError()
			}
		}
	}

	return nil
}

type referenceDictionaries struct {
	accountIDs  map[int64]struct{}
	categoryIDs map[int64]struct{}
	memberIDs   map[int64]struct{}
	tagIDs      map[int64]struct{}
}

func (s *Service) referenceDictionaries(ctx context.Context) (referenceDictionaries, error) {
	accountList, err := s.accounts.List(ctx, accounts.ListOptions{IncludeHidden: true})
	if err != nil {
		return referenceDictionaries{}, err
	}
	categoryList, err := s.categories.List(ctx, categories.ListOptions{IncludeHidden: true})
	if err != nil {
		return referenceDictionaries{}, err
	}
	tagList, err := s.tags.List(ctx, tags.ListOptions{IncludeHidden: true})
	if err != nil {
		return referenceDictionaries{}, err
	}
	memberList, err := s.members.List(ctx, members.ListOptions{})
	if err != nil {
		return referenceDictionaries{}, err
	}

	references := referenceDictionaries{
		accountIDs:  make(map[int64]struct{}, len(accountList)),
		categoryIDs: make(map[int64]struct{}, len(categoryList)),
		memberIDs:   make(map[int64]struct{}, len(memberList)),
		tagIDs:      make(map[int64]struct{}, len(tagList)),
	}
	for _, account := range accountList {
		references.accountIDs[account.ID] = struct{}{}
	}
	for _, category := range categoryList {
		references.categoryIDs[category.ID] = struct{}{}
	}
	for _, member := range memberList {
		references.memberIDs[member.ID] = struct{}{}
	}
	for _, tag := range tagList {
		references.tagIDs[tag.ID] = struct{}{}
	}

	return references, nil
}

func validateTagIDs(index int, tagIDs []int64) error {
	seen := map[int64]struct{}{}
	for _, tagID := range tagIDs {
		if tagID <= 0 {
			return services.InvalidRequest(indexedField(index, "tag_ids") + " values must be positive")
		}
		if _, ok := seen[tagID]; ok {
			return services.InvalidRequest(indexedField(index, "tag_ids") + " values must be unique")
		}
		seen[tagID] = struct{}{}
	}

	return nil
}

func validateFQN(fqn string) error {
	if strings.TrimSpace(fqn) != fqn || fqn == "" {
		return services.InvalidRequest("fqn must be non-empty without leading or trailing whitespace")
	}
	if strings.HasPrefix(fqn, ":") || strings.HasSuffix(fqn, ":") || strings.Contains(fqn, "::") {
		return services.InvalidRequest("fqn must be colon-separated with non-empty segments")
	}
	for segment := range strings.SplitSeq(fqn, ":") {
		if strings.TrimSpace(segment) != segment || segment == "" {
			return services.InvalidRequest("fqn segments must be non-empty without leading or trailing whitespace")
		}
	}

	return nil
}

func validateListOptions(opts services.ListOptions) error {
	switch opts.SortKey {
	case "", services.SortKeyFQN, services.SortKeyCreatedAt, services.SortKeyUpdatedAt:
	default:
		return services.InvalidRequest("sort must be fqn, created_at, or updated_at")
	}
	switch opts.SortDirection {
	case "", services.SortDirectionAsc, services.SortDirectionDesc:
	default:
		return services.InvalidRequest("sort_dir must be asc or desc")
	}
	if opts.Limit != nil && *opts.Limit <= 0 {
		return services.InvalidRequest("limit must be positive")
	}
	if opts.Offset < 0 {
		return services.InvalidRequest("offset must be non-negative")
	}

	return nil
}

func indexedField(index int, name string) string {
	return "records[" + strconv.Itoa(index) + "]." + name
}

func invalidReferenceError() error {
	return services.InvalidRequest("transaction template references missing or inactive resource")
}
