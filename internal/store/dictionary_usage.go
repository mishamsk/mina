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

// ActiveUsage reports active resources that reference categories.
func (s *CategoryStore) ActiveUsage(ctx context.Context, ids []int64) (map[int64]categories.ActiveUsage, error) {
	if len(ids) == 0 {
		return map[int64]categories.ActiveUsage{}, nil
	}

	placeholderList := placeholders(len(ids))
	args := make([]any, 0, len(ids)*3)
	args = append(args, int64Args(ids)...)
	args = append(args, int64Args(ids)...)
	args = append(args, int64Args(ids)...)
	rows, err := s.db.query().QueryContext(
		ctx,
		`SELECT jr.category_id AS category_id, 'journal_records' AS source
FROM `+s.db.accountingName("journal_record")+` jr
JOIN `+s.db.accountingName("transaction")+` t
  ON t.transaction_id = jr.transaction_id
WHERE jr.tombstoned_at IS NULL
  AND t.tombstoned_at IS NULL
  AND jr.category_id IN (`+placeholderList+`)
UNION
SELECT ttr.category_id AS category_id, 'transaction_template_records' AS source
FROM `+s.db.accountingName("transaction_template_record")+` ttr
JOIN `+s.db.accountingName("transaction_template")+` tt
  ON tt.transaction_template_id = ttr.transaction_template_id
WHERE ttr.tombstoned_at IS NULL
  AND tt.tombstoned_at IS NULL
  AND ttr.category_id IN (`+placeholderList+`)
UNION
SELECT rdr.category_id AS category_id, 'recurring_definition_records' AS source
FROM `+s.db.accountingName("recurring_definition_record")+` rdr
JOIN `+s.db.accountingName("recurring_definition")+` rd
  ON rd.recurring_definition_id = rdr.recurring_definition_id
WHERE rdr.tombstoned_at IS NULL
  AND rd.tombstoned_at IS NULL
  AND rdr.category_id IN (`+placeholderList+`)`,
		args...,
	)
	if err != nil {
		return nil, fmt.Errorf("list active category usage: %w", err)
	}

	usageByID := map[int64]categories.ActiveUsage{}
	for rows.Next() {
		var id int64
		var source string
		if err := rows.Scan(&id, &source); err != nil {
			if closeErr := rows.Close(); closeErr != nil {
				return nil, fmt.Errorf("scan active category usage: %w; close rows: %w", err, closeErr)
			}
			return nil, fmt.Errorf("scan active category usage: %w", err)
		}

		usage := usageByID[id]
		switch source {
		case "journal_records":
			usage.JournalRecords = true
		case "transaction_template_records":
			usage.TransactionTemplateRecords = true
		case "recurring_definition_records":
			usage.RecurringDefinitionRecords = true
		default:
			if closeErr := rows.Close(); closeErr != nil {
				return nil, fmt.Errorf("scan active category usage source %q; close rows: %w", source, closeErr)
			}
			return nil, fmt.Errorf("scan active category usage source %q", source)
		}
		usageByID[id] = usage
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate active category usage: %w; close rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate active category usage: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close active category usage rows: %w", err)
	}

	return usageByID, nil
}

// ActiveUsage reports active resources that reference tags.
func (s *TagStore) ActiveUsage(ctx context.Context, ids []int64) (map[int64]tags.ActiveUsage, error) {
	if len(ids) == 0 {
		return map[int64]tags.ActiveUsage{}, nil
	}

	placeholderList := placeholders(len(ids))
	args := make([]any, 0, len(ids)*3)
	args = append(args, int64Args(ids)...)
	args = append(args, int64Args(ids)...)
	args = append(args, int64Args(ids)...)
	rows, err := s.db.query().QueryContext(
		ctx,
		`SELECT tag.tag_id AS tag_id, 'journal_records' AS source
FROM `+s.db.accountingName("journal_record")+` jr
JOIN `+s.db.accountingName("transaction")+` t
  ON t.transaction_id = jr.transaction_id
CROSS JOIN UNNEST(jr.tag_ids) AS tag(tag_id)
WHERE jr.tombstoned_at IS NULL
  AND t.tombstoned_at IS NULL
  AND tag.tag_id IN (`+placeholderList+`)
UNION
SELECT tag.tag_id AS tag_id, 'transaction_template_records' AS source
FROM `+s.db.accountingName("transaction_template_record")+` ttr
JOIN `+s.db.accountingName("transaction_template")+` tt
  ON tt.transaction_template_id = ttr.transaction_template_id
CROSS JOIN UNNEST(ttr.tag_ids) AS tag(tag_id)
WHERE ttr.tombstoned_at IS NULL
  AND tt.tombstoned_at IS NULL
  AND tag.tag_id IN (`+placeholderList+`)
UNION
SELECT tag.tag_id AS tag_id, 'recurring_definition_records' AS source
FROM `+s.db.accountingName("recurring_definition_record")+` rdr
JOIN `+s.db.accountingName("recurring_definition")+` rd
  ON rd.recurring_definition_id = rdr.recurring_definition_id
CROSS JOIN UNNEST(rdr.tag_ids) AS tag(tag_id)
WHERE rdr.tombstoned_at IS NULL
  AND rd.tombstoned_at IS NULL
  AND tag.tag_id IN (`+placeholderList+`)`,
		args...,
	)
	if err != nil {
		return nil, fmt.Errorf("list active tag usage: %w", err)
	}

	usageByID := map[int64]tags.ActiveUsage{}
	for rows.Next() {
		var id int64
		var source string
		if err := rows.Scan(&id, &source); err != nil {
			if closeErr := rows.Close(); closeErr != nil {
				return nil, fmt.Errorf("scan active tag usage: %w; close rows: %w", err, closeErr)
			}
			return nil, fmt.Errorf("scan active tag usage: %w", err)
		}

		usage := usageByID[id]
		switch source {
		case "journal_records":
			usage.JournalRecords = true
		case "transaction_template_records":
			usage.TransactionTemplateRecords = true
		case "recurring_definition_records":
			usage.RecurringDefinitionRecords = true
		default:
			if closeErr := rows.Close(); closeErr != nil {
				return nil, fmt.Errorf("scan active tag usage source %q; close rows: %w", source, closeErr)
			}
			return nil, fmt.Errorf("scan active tag usage source %q", source)
		}
		usageByID[id] = usage
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate active tag usage: %w; close rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate active tag usage: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close active tag usage rows: %w", err)
	}

	return usageByID, nil
}

// ActiveUsage reports active resources that reference household members.
func (s *MemberStore) ActiveUsage(ctx context.Context, ids []int64) (map[int64]members.ActiveUsage, error) {
	if len(ids) == 0 {
		return map[int64]members.ActiveUsage{}, nil
	}

	placeholderList := placeholders(len(ids))
	args := make([]any, 0, len(ids)*3)
	args = append(args, int64Args(ids)...)
	args = append(args, int64Args(ids)...)
	args = append(args, int64Args(ids)...)
	rows, err := s.db.query().QueryContext(
		ctx,
		`SELECT jr.member_id AS member_id, 'journal_records' AS source
FROM `+s.db.accountingName("journal_record")+` jr
JOIN `+s.db.accountingName("transaction")+` t
  ON t.transaction_id = jr.transaction_id
WHERE jr.tombstoned_at IS NULL
  AND t.tombstoned_at IS NULL
  AND jr.member_id IN (`+placeholderList+`)
UNION
SELECT ttr.member_id AS member_id, 'transaction_template_records' AS source
FROM `+s.db.accountingName("transaction_template_record")+` ttr
JOIN `+s.db.accountingName("transaction_template")+` tt
  ON tt.transaction_template_id = ttr.transaction_template_id
WHERE ttr.tombstoned_at IS NULL
  AND tt.tombstoned_at IS NULL
  AND ttr.member_id IN (`+placeholderList+`)
UNION
SELECT rdr.member_id AS member_id, 'recurring_definition_records' AS source
FROM `+s.db.accountingName("recurring_definition_record")+` rdr
JOIN `+s.db.accountingName("recurring_definition")+` rd
  ON rd.recurring_definition_id = rdr.recurring_definition_id
WHERE rdr.tombstoned_at IS NULL
  AND rd.tombstoned_at IS NULL
  AND rdr.member_id IN (`+placeholderList+`)`,
		args...,
	)
	if err != nil {
		return nil, fmt.Errorf("list active member usage: %w", err)
	}

	usageByID := map[int64]members.ActiveUsage{}
	for rows.Next() {
		var id int64
		var source string
		if err := rows.Scan(&id, &source); err != nil {
			if closeErr := rows.Close(); closeErr != nil {
				return nil, fmt.Errorf("scan active member usage: %w; close rows: %w", err, closeErr)
			}
			return nil, fmt.Errorf("scan active member usage: %w", err)
		}

		usage := usageByID[id]
		switch source {
		case "journal_records":
			usage.JournalRecords = true
		case "transaction_template_records":
			usage.TransactionTemplateRecords = true
		case "recurring_definition_records":
			usage.RecurringDefinitionRecords = true
		default:
			if closeErr := rows.Close(); closeErr != nil {
				return nil, fmt.Errorf("scan active member usage source %q; close rows: %w", source, closeErr)
			}
			return nil, fmt.Errorf("scan active member usage source %q", source)
		}
		usageByID[id] = usage
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate active member usage: %w; close rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate active member usage: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close active member usage rows: %w", err)
	}

	return usageByID, nil
}
