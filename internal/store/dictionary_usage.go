package store

import (
	"context"
	"fmt"

	"github.com/mishamsk/mina/internal/services/accounts"
	"github.com/mishamsk/mina/internal/services/categories"
	"github.com/mishamsk/mina/internal/services/members"
	"github.com/mishamsk/mina/internal/services/tags"
)

// ActiveUsage reports active resources that reference accounts.
func (s *AccountStore) ActiveUsage(ctx context.Context, ids []int64) (map[int64]accounts.ActiveUsage, error) {
	if len(ids) == 0 {
		return map[int64]accounts.ActiveUsage{}, nil
	}

	placeholderList := placeholders(len(ids))
	args := make([]any, 0, len(ids)*4)
	args = append(args, int64Args(ids)...)
	args = append(args, int64Args(ids)...)
	args = append(args, int64Args(ids)...)
	args = append(args, int64Args(ids)...)
	rows, err := s.db.query().QueryContext(
		ctx,
		`SELECT jr.account_id AS account_id, 'journal_records' AS source
FROM `+s.db.accountingName("journal_record")+` jr
JOIN `+s.db.accountingName("transaction")+` t
  ON t.transaction_id = jr.transaction_id
WHERE jr.tombstoned_at IS NULL
  AND t.tombstoned_at IS NULL
  AND jr.account_id IN (`+placeholderList+`)
UNION
SELECT ttr.account_id AS account_id, 'transaction_template_records' AS source
FROM `+s.db.accountingName("transaction_template_record")+` ttr
JOIN `+s.db.accountingName("transaction_template")+` tt
  ON tt.transaction_template_id = ttr.transaction_template_id
WHERE ttr.tombstoned_at IS NULL
  AND tt.tombstoned_at IS NULL
  AND ttr.account_id IN (`+placeholderList+`)
UNION
SELECT rdr.account_id AS account_id, 'recurring_definition_records' AS source
FROM `+s.db.accountingName("recurring_definition_record")+` rdr
JOIN `+s.db.accountingName("recurring_definition")+` rd
  ON rd.recurring_definition_id = rdr.recurring_definition_id
WHERE rdr.tombstoned_at IS NULL
  AND rd.tombstoned_at IS NULL
  AND rdr.account_id IN (`+placeholderList+`)
UNION
SELECT account_id, 'credit_limit_history' AS source
FROM `+s.db.accountingName("credit_limit_history")+`
WHERE tombstoned_at IS NULL
  AND account_id IN (`+placeholderList+`)`,
		args...,
	)
	if err != nil {
		return nil, fmt.Errorf("list active account usage: %w", err)
	}

	usageByID := map[int64]accounts.ActiveUsage{}
	for rows.Next() {
		var id int64
		var source string
		if err := rows.Scan(&id, &source); err != nil {
			if closeErr := rows.Close(); closeErr != nil {
				return nil, fmt.Errorf("scan active account usage: %w; close rows: %w", err, closeErr)
			}
			return nil, fmt.Errorf("scan active account usage: %w", err)
		}

		usage := usageByID[id]
		switch source {
		case "journal_records":
			usage.JournalRecords = true
		case "transaction_template_records":
			usage.TransactionTemplateRecords = true
		case "recurring_definition_records":
			usage.RecurringDefinitionRecords = true
		case "credit_limit_history":
			usage.CreditLimitHistory = true
		default:
			if closeErr := rows.Close(); closeErr != nil {
				return nil, fmt.Errorf("scan active account usage source %q; close rows: %w", source, closeErr)
			}
			return nil, fmt.Errorf("scan active account usage source %q", source)
		}
		usageByID[id] = usage
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate active account usage: %w; close rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate active account usage: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close active account usage rows: %w", err)
	}

	return usageByID, nil
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
	recurringRecords, err := activeRecurringDefinitionRecordUsage(ctx, s.db, "rdr.category_id = ?", id)
	if err != nil {
		return categories.ActiveUsage{}, fmt.Errorf("check active category recurring definition usage: %w", err)
	}

	return categories.ActiveUsage{
		JournalRecords:             journalRecords,
		TransactionTemplateRecords: templateRecords,
		RecurringDefinitionRecords: recurringRecords,
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
	recurringRecords, err := activeRecurringDefinitionRecordUsage(ctx, s.db, "list_contains(rdr.tag_ids, ?)", id)
	if err != nil {
		return tags.ActiveUsage{}, fmt.Errorf("check active tag recurring definition usage: %w", err)
	}

	return tags.ActiveUsage{
		JournalRecords:             journalRecords,
		TransactionTemplateRecords: templateRecords,
		RecurringDefinitionRecords: recurringRecords,
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
	recurringRecords, err := activeRecurringDefinitionRecordUsage(ctx, s.db, "rdr.member_id = ?", id)
	if err != nil {
		return members.ActiveUsage{}, fmt.Errorf("check active member recurring definition usage: %w", err)
	}

	return members.ActiveUsage{
		JournalRecords:             journalRecords,
		TransactionTemplateRecords: templateRecords,
		RecurringDefinitionRecords: recurringRecords,
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

func activeRecurringDefinitionRecordUsage(ctx context.Context, db *AppDB, predicate string, args ...any) (bool, error) {
	return scanExists(
		ctx,
		db,
		`SELECT EXISTS (
SELECT 1
FROM `+db.accountingName("recurring_definition_record")+` rdr
JOIN `+db.accountingName("recurring_definition")+` rd
  ON rd.recurring_definition_id = rdr.recurring_definition_id
WHERE rdr.tombstoned_at IS NULL
  AND rd.tombstoned_at IS NULL
  AND `+predicate+`
LIMIT 1
)`,
		args...,
	)
}

func scanExists(ctx context.Context, db *AppDB, query string, args ...any) (bool, error) {
	var exists bool
	if err := db.query().QueryRowContext(ctx, query, args...).Scan(&exists); err != nil {
		return false, err
	}

	return exists, nil
}
