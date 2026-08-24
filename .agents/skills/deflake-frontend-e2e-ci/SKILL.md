---
name: deflake-frontend-e2e-ci
description: Diagnose and harden flaky Mina frontend E2E assertions, then prove the branch in GitHub CI.
disable-model-invocation: true
---

# Deflake Frontend E2E CI

## Goal

Assess recent failed `main` frontend E2E runs, fix flaky test assertions, and validate the pushed branch.

## Success criteria

- Explain the relevant failures and synchronize assertions with observable UI behavior.
- Pass the required local checks.
- Pass `.github/workflows/ci.yml`, manually dispatched with `gh workflow run ci.yml --ref <branch>`, on the pushed branch three consecutive times at the same commit SHA.

## Constraints

- Change tests only; never change production code.
- Preserve test intent; do not work around flakiness with fixed waits or sleeps, timeout or retry increases, or weakened or skipped assertions.
- Assert behavior through the UI; never substitute REST/API assertions.
- Do not run review loops.
