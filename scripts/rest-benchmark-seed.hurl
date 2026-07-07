POST {{base_url}}/api/categories
{
  "fqn": "{{category_fqn}}",
  "economic_intent": "expense"
}
HTTP 201

POST {{base_url}}/api/members
{
  "name": "{{member_name}}"
}
HTTP 201

POST {{base_url}}/api/accounts
{
  "fqn": "{{account_fqn}}",
  "account_type": "{{account_type}}",
  "is_featured": {{is_featured}},
  "currency": "USD"
}
HTTP 201

POST {{base_url}}/api/tags
{
  "fqn": "{{tag_fqn}}"
}
HTTP 201
