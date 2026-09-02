# Testing

Mina has exactly four app test classes. All exercise Mina at a high-level app boundary:

- `app-tests`: normal in-process app tests in `internal/apptest/runtime`.
- `e2e-tests`: testscript-driven launched-process tests in `cmd/mina/testdata/script`, driven by `cmd/mina/cli_smoke_test.go`.
- `frontend-e2e-tests`: Playwright-driven embedded UI checks in `frontend/tests/e2e`.
- `docker-lifecycle-tests`: Docker Compose deployment checks in `scripts/docker-service-test.sh`, driven by `just test-docker`.
- No unit tests and no other app test locations.
- No test code under `internal/tools/**`; validate tool changes with manual smoke checks, `just pre-commit`, and review.

## Required Reading

- If you are working on backend `app-tests` or launched-process `e2e-tests`, you must also read and follow [Backend Testing](BACKEND-TESTING.md).
- If you are working on frontend browser tests, you must also read and follow [Frontend Testing](FRONTEND-TESTING.md).
- If you are working on Docker lifecycle tests, you must also read and follow [Docker Testing](DOCKER-TESTING.md).
- If work crosses testing scopes, you must read and follow every applicable guide.
