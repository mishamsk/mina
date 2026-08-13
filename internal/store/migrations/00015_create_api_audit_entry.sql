-- +goose Up
CREATE SEQUENCE api_audit_entry_id_seq START 1;
CREATE TYPE api_audit_client_surface AS ENUM ('rest', 'web-ui', 'cli', 'mcp');

CREATE TABLE api_audit_entry (
	api_audit_entry_id BIGINT PRIMARY KEY DEFAULT nextval('api_audit_entry_id_seq'),
	occurred_at TIMESTAMP NOT NULL,
	operation_id TEXT NOT NULL,
	method TEXT NOT NULL,
	request_uri TEXT NOT NULL,
	response_status INTEGER NOT NULL,
	duration_microseconds BIGINT NOT NULL,
	client_surface api_audit_client_surface NOT NULL,
	request_json JSON,
	response_json JSON
);

CREATE INDEX api_audit_entry_occurred_at_idx ON api_audit_entry (occurred_at, api_audit_entry_id);
