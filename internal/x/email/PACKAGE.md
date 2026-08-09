# internal/x/email

## Purpose

- Provides pure, app-agnostic email identity canonicalization and minimal shape validation.

## Implicit Contracts

- Email identities must be normalized before storage or comparison: normalization trims surrounding whitespace and lowercases the value. Validation does not normalize.
- Validation deliberately checks only for a non-empty value containing `@` and no control characters; callers needing RFC, domain, or deliverability checks must own them.

## Boundaries

- Owns: email identity normalization and minimal shape validation.
- Does not own: authentication, account existence, deliverability, or transport behavior.
