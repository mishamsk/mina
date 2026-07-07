POST {{base_url}}/api/transactions/spend
{
  "initiated_date": "{{write_date}}",
  "funding_account_id": {{balance_account_id}},
  "counterparty_account_id": {{flow_account_id}},
  "category_id": {{category_id}},
  "currency": "USD",
  "amount": "{{write_amount}}",
  "member_id": {{member_id}},
  "tag_ids": [{{tag_id}}],
  "memo": "{{write_memo}}",
  "posting_status": "posted",
  "reconciliation_status": "reconciled"
}
HTTP 201
