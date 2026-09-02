# Docker Testing

Read [Testing](TESTING.md) first for shared rules and test-class navigation.

## Docker-Lifecycle-Tests

`docker-lifecycle-tests` run only through `just test-docker` and are not run by default.

Use them as a small smoke suite for Docker deployment behavior only:

- Real Docker image builds or supplied images.
- Compose service startup, restart, recreation, and replacement.
- Bind-mounted config/backups and named database/cache volumes.
- Real network listener wiring through published ports.
- Database and backup file persistence across supported container lifecycle actions.

Do not use `docker-lifecycle-tests` for:

- REST endpoint, domain validation, provider edge-case, or app scenario coverage that can be tested as `app-tests`.
- Exhaustive unsupported downgrade or deployment-platform matrices.

Docker lifecycle tests prove image and Compose deployment wiring. App behavior coverage belongs in `app-tests`.
