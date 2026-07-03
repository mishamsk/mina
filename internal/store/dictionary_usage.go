package store

import (
	"context"
	"fmt"

	"github.com/mishamsk/mina/internal/services/accounts"
	"github.com/mishamsk/mina/internal/services/categories"
	"github.com/mishamsk/mina/internal/services/members"
	"github.com/mishamsk/mina/internal/services/tags"
)

// ActiveUsage reports active resources that reference an account.
func (s *AccountStore) ActiveUsage(ctx context.Context, id int64) (accounts.ActiveUsage, error) {
	journalRecords, err := activeJournalRecordUsage(ctx, s.db, "account_id = ?", id)
	if err != nil {
		return accounts.ActiveUsage{}, fmt.Errorf("check active account journal record usage: %w", err)
	}
	templateRecords, err := activeTransactionTemplateRecordUsage(ctx, s.db, "ttr.account_id = ?", id)
	if err != nil {
		return accounts.ActiveUsage{}, fmt.Errorf("check active account transaction template usage: %w", err)
	}
	creditLimitHistory, err := activeCreditLimitHistoryUsage(ctx, s.db, id)
	if err != nil {
		return accounts.ActiveUsage{}, fmt.Errorf("check active account credit limit history usage: %w", err)
	}

	return accounts.ActiveUsage{
		JournalRecords:             journalRecords,
		TransactionTemplateRecords: templateRecords,
		CreditLimitHistory:         creditLimitHistory,
	}, nil
}

// ActiveUsage reports active resources that reference a category.
func (s *CategoryStore) ActiveUsage(ctx context.Context, id int64) (categories.ActiveUsage, error) {
	journalRecords, err := activeJournalRecordUsage(ctx, s.db, "category_id = ?", id)
	if err != nil {
		return categories.ActiveUsage{}, fmt.Errorf("check active category journal record usage: %w", err)
	}
	templateRecords, err := activeTransactionTemplateRecordUsage(ctx, s.db, "ttr.category_id = ?", id)
	if err != nil {
		return categories.ActiveUsage{}, fmt.Errorf("check active category transaction template usage: %w", err)
	}

	return categories.ActiveUsage{
		JournalRecords:             journalRecords,
		TransactionTemplateRecords: templateRecords,
	}, nil
}

// ActiveUsage reports active resources that reference a tag.
func (s *TagStore) ActiveUsage(ctx context.Context, id int64) (tags.ActiveUsage, error) {
	journalRecords, err := activeJournalRecordUsage(ctx, s.db, "list_contains(tag_ids, ?)", id)
	if err != nil {
		return tags.ActiveUsage{}, fmt.Errorf("check active tag journal record usage: %w", err)
	}
	templateRecords, err := activeTransactionTemplateRecordUsage(ctx, s.db, "list_contains(ttr.tag_ids, ?)", id)
	if err != nil {
		return tags.ActiveUsage{}, fmt.Errorf("check active tag transaction template usage: %w", err)
	}

	return tags.ActiveUsage{
		JournalRecords:             journalRecords,
		TransactionTemplateRecords: templateRecords,
	}, nil
}

// ActiveUsage reports active resources that reference a household member.
func (s *MemberStore) ActiveUsage(ctx context.Context, id int64) (members.ActiveUsage, error) {
	journalRecords, err := activeJournalRecordUsage(ctx, s.db, "member_id = ?", id)
	if err != nil {
		return members.ActiveUsage{}, fmt.Errorf("check active member journal record usage: %w", err)
	}
	templateRecords, err := activeTransactionTemplateRecordUsage(ctx, s.db, "ttr.member_id = ?", id)
	if err != nil {
		return members.ActiveUsage{}, fmt.Errorf("check active member transaction template usage: %w", err)
	}

	return members.ActiveUsage{
		JournalRecords:             journalRecords,
		TransactionTemplateRecords: templateRecords,
	}, nil
}

func activeJournalRecordUsage(ctx context.Context, db *AppDB, predicate string, args ...any) (bool, error) {
	return scanExists(
		ctx,
		db,
		`SELECT EXISTS (
SELECT 1
FROM `+db.accountingName("journal_record")+` jr
JOIN `+db.accountingName("transaction")+` t
  ON t.transaction_id = jr.transaction_id
WHERE jr.tombstoned_at IS NULL
  AND t.tombstoned_at IS NULL
  AND `+predicate+`
LIMIT 1
)`,
		args...,
	)
}

func activeTransactionTemplateRecordUsage(ctx context.Context, db *AppDB, predicate string, args ...any) (bool, error) {
	return scanExists(
		ctx,
		db,
		`SELECT EXISTS (
SELECT 1
FROM `+db.accountingName("transaction_template_record")+` ttr
JOIN `+db.accountingName("transaction_template")+` tt
  ON tt.transaction_template_id = ttr.transaction_template_id
WHERE ttr.tombstoned_at IS NULL
  AND tt.tombstoned_at IS NULL
  AND `+predicate+`
LIMIT 1
)`,
		args...,
	)
}

func activeCreditLimitHistoryUsage(ctx context.Context, db *AppDB, accountID int64) (bool, error) {
	return scanExists(
		ctx,
		db,
		`SELECT EXISTS (
SELECT 1
FROM `+db.accountingName("credit_limit_history")+`
WHERE tombstoned_at IS NULL
  AND account_id = ?
LIMIT 1
)`,
		accountID,
	)
}

func scanExists(ctx context.Context, db *AppDB, query string, args ...any) (bool, error) {
	var exists bool
	if err := db.query().QueryRowContext(ctx, query, args...).Scan(&exists); err != nil {
		return false, err
	}

	return exists, nil
}
