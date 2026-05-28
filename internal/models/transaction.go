package models

// PostingStatus is a journal record posting lifecycle state.
type PostingStatus string

const (
	// PostingStatusPending identifies a pending journal record.
	PostingStatusPending PostingStatus = "pending"
	// PostingStatusPosted identifies a posted journal record.
	PostingStatusPosted PostingStatus = "posted"
	// PostingStatusCancelled identifies a cancelled journal record.
	PostingStatusCancelled PostingStatus = "cancelled"
)

// ReconciliationStatus is a journal record reconciliation state.
type ReconciliationStatus string

const (
	// ReconciliationStatusReconciled identifies a reconciled journal record.
	ReconciliationStatusReconciled ReconciliationStatus = "reconciled"
	// ReconciliationStatusUnreconciled identifies an unreconciled journal record.
	ReconciliationStatusUnreconciled ReconciliationStatus = "unreconciled"
)

// Source identifies how a journal record was created.
type Source string

const (
	// SourceManual identifies manually-entered records.
	SourceManual Source = "manual"
)

// Transaction is a double-entry transaction with nested journal records.
type Transaction struct {
	ID            int64           `json:"transaction_id"`
	InitiatedDate string          `json:"initiated_date"`
	CreatedAt     string          `json:"created_at"`
	TombstonedAt  *string         `json:"tombstoned_at,omitempty"`
	Records       []JournalRecord `json:"records"`
}

// JournalRecord is one debit or credit entry inside a transaction.
type JournalRecord struct {
	ID                   int64                `json:"record_id"`
	TransactionID        int64                `json:"transaction_id"`
	AccountID            int64                `json:"account_id"`
	MemberID             *int64               `json:"member_id,omitempty"`
	Currency             string               `json:"currency"`
	Amount               string               `json:"amount"`
	AmountUSD            string               `json:"amount_usd"`
	CategoryID           int64                `json:"category_id"`
	TagIDs               []int64              `json:"tag_ids"`
	Memo                 *string              `json:"memo,omitempty"`
	PendingDate          *string              `json:"pending_date,omitempty"`
	PostedDate           *string              `json:"posted_date,omitempty"`
	PostingStatus        PostingStatus        `json:"posting_status"`
	ReconciliationStatus ReconciliationStatus `json:"reconciliation_status"`
	Source               Source               `json:"source"`
	ExternalID           *string              `json:"external_id,omitempty"`
	ExternalSystem       *string              `json:"external_system,omitempty"`
	CreatedAt            string               `json:"created_at"`
	UpdatedAt            string               `json:"updated_at"`
	TombstonedAt         *string              `json:"tombstoned_at,omitempty"`
}

// CreateTransactionRequest is the request body for creating a transaction.
type CreateTransactionRequest struct {
	InitiatedDate string                       `json:"initiated_date"`
	Records       []CreateJournalRecordRequest `json:"records"`
}

// UpdateTransactionRequest is the request body for replacing a transaction.
type UpdateTransactionRequest struct {
	InitiatedDate string                       `json:"initiated_date"`
	Records       []CreateJournalRecordRequest `json:"records"`
}

// CreateJournalRecordRequest is one record inside a create transaction request.
type CreateJournalRecordRequest struct {
	AccountID            int64                `json:"account_id"`
	MemberID             *int64               `json:"member_id,omitempty"`
	Currency             string               `json:"currency"`
	Amount               string               `json:"amount"`
	AmountUSD            string               `json:"amount_usd"`
	CategoryID           int64                `json:"category_id"`
	TagIDs               []int64              `json:"tag_ids,omitempty"`
	Memo                 *string              `json:"memo,omitempty"`
	PendingDate          *string              `json:"pending_date,omitempty"`
	PostedDate           *string              `json:"posted_date,omitempty"`
	PostingStatus        PostingStatus        `json:"posting_status"`
	ReconciliationStatus ReconciliationStatus `json:"reconciliation_status"`
	Source               Source               `json:"source"`
	ExternalID           *string              `json:"external_id,omitempty"`
	ExternalSystem       *string              `json:"external_system,omitempty"`
}

// TransactionListResponse is the response body for transaction list endpoints.
type TransactionListResponse struct {
	Transactions []Transaction `json:"transactions"`
}

// JournalRecordSearchResponse is the response body for record search endpoints.
type JournalRecordSearchResponse struct {
	Records []JournalRecord `json:"records"`
}

// BulkCategorizeRecordsRequest is the request body for assigning one category to records.
type BulkCategorizeRecordsRequest struct {
	RecordIDs  []int64 `json:"record_ids"`
	CategoryID int64   `json:"category_id"`
}

// BulkTagRecordsRequest is the request body for adding and removing record tags.
type BulkTagRecordsRequest struct {
	RecordIDs    []int64 `json:"record_ids"`
	AddTagIDs    []int64 `json:"add_tag_ids,omitempty"`
	RemoveTagIDs []int64 `json:"remove_tag_ids,omitempty"`
}

// BulkReassignRecordsAccountRequest is the request body for assigning one account to records.
type BulkReassignRecordsAccountRequest struct {
	RecordIDs []int64 `json:"record_ids"`
	AccountID int64   `json:"account_id"`
}

// BulkUpdateRecordStatusRequest is the request body for updating record statuses.
type BulkUpdateRecordStatusRequest struct {
	RecordIDs            []int64               `json:"record_ids"`
	PostingStatus        *PostingStatus        `json:"posting_status,omitempty"`
	ReconciliationStatus *ReconciliationStatus `json:"reconciliation_status,omitempty"`
}

// BulkRecordOperationResponse is the response body for bulk record operations.
type BulkRecordOperationResponse struct {
	RecordIDs    []int64 `json:"record_ids"`
	UpdatedCount int     `json:"updated_count"`
}
