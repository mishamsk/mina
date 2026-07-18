# Plan: Basic GitHub CI and continuous Docker publication (Kata qxan)

Add reusable GitHub-hosted validation and Docker-image workflows, then continuously publish a tested multi-architecture `main` image from the default branch. Manual runs may publish and test immutable images from other branches without moving the deployable `main` tag.

## Plan Context

- Current delivery goal: make `ghcr.io/mishamsk/mina:main` usable for the maintainer's deployment as soon as validated `main` commits land.
- `.github/` has no existing workflows or Dependabot configuration. Repository Actions are enabled; the default `GITHUB_TOKEN` is read-only, so Docker publication must grant `packages: write` explicitly.
- Add three workflows: reusable `tests.yml`, reusable `docker-image.yml`, and concrete `build-and-publish-docker.yml`, which composes the first two.
- `build-and-publish-docker.yml` runs on pushes to `main` and manual dispatch from a selected branch. No automatic pull-request trigger is in scope yet.
- Every delivery runs `just pre-commit`, `just test`, `just test-integration`, and `just test-frontend-e2e`. A future PR workflow must call the same reusable test workflow.
- Every image build publishes only its full commit-SHA tag. A tested current `main` commit also advances the mutable `main` tag without rebuilding the image.
- Per-ref concurrency is latest-wins: a newer run cancels an obsolete run for the same ref. Immediately before promotion, re-read `refs/heads/main`; a stale or re-run SHA must never move `main` backward.
- A canceled or failed run may leave an unpromoted SHA image. Only `main` is the deployable tested-image contract.
- Release triggers, semantic-version image tags, `latest`, automatic PR CI, and Docker path filtering are out of scope. Add path detection only with the future PR caller, when Docker work becomes conditional.
- GHCR creates the first container package as private. After the first successful build, the owner must explicitly make it public; this irreversible GitHub setting remains a human gate.
- These are CI/tooling/documentation changes, not application-code changes. Follow the plan's targeted checks instead of adding unrelated broad local test runs; the activated workflow itself executes all four application validation recipes.

## Tasks

### Task/Commit 1: Add the reusable non-Docker test workflow

Establish one repository-owned validation boundary for current delivery and future PR automation. Pin runner tooling and validate GitHub workflow semantics locally so malformed workflow changes fail before push.

- [x] Add `just` and `prek` to `mise.toml` at current explicit versions; adjust `just init` only as needed so `mise install` owns the `prek` installation.
- [x] Track `github.com/rhysd/actionlint/cmd/actionlint` as a versioned Go tool.
- [x] Add a Justfile `workflow-check` recipe that runs the tracked `actionlint` tool.
- [x] Add a `mina-workflow-check` local pre-commit hook for `.github/workflows/*.yml` and `.yaml`; keep generic YAML validation unchanged.
- [x] Add `.github/workflows/tests.yml` with `workflow_call`, read-only permissions, and full-commit-SHA pins for every external action.
- [x] Use parallel matrix entries for these exact repository recipes:
  - [x] `just pre-commit`
  - [x] `just test`
  - [x] `just test-integration`
  - [x] `just test-frontend-e2e`
- [x] Install repo-declared tools through mise and run `just frontend-install` only for matrix entries that need frontend dependencies.
- [x] Verification
  - [x] `just workflow-check` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue `qxan`
  - [x] Commit changes

### Task/Commit 2: Publish and verify Docker images

Add the reusable registry-image boundary and the specifically named entry workflow that composes tests with publication. The immutable image must be pulled from GHCR and exercised through the existing Compose lifecycle recipe before `main` advances.

- [x] Add a Justfile-owned remote-image manifest check that requires both `linux/amd64` and `linux/arm64` in the published image index.
- [x] Add `.github/workflows/docker-image.yml` with `workflow_call` and a boolean input controlling eligibility for `main` promotion.
- [x] Authenticate to GHCR with `GITHUB_TOKEN`; grant only `contents: read` and `packages: write` from the caller.
- [x] Build and push `ghcr.io/mishamsk/mina:<full-commit-sha>` from `docker/Dockerfile` for `linux/amd64` and `linux/arm64`, preserving source, revision, version, and creation labels.
- [x] Pin checkout, mise, QEMU, Buildx, registry-login, and build/push actions to verified full commit SHAs; enable the GitHub Actions BuildKit cache.
- [x] Run the remote manifest check against the SHA tag.
- [x] Run `MINA_IMAGE=ghcr.io/mishamsk/mina:<full-commit-sha> just test-docker`; do not substitute a locally built lifecycle image.
- [x] When promotion is requested, re-read remote `refs/heads/main` and skip promotion unless it still equals the workflow commit SHA.
- [x] After the registry-image test and current-tip guard pass, retag the already-published manifest as `ghcr.io/mishamsk/mina:main` without rebuilding it.
- [x] Add `.github/workflows/build-and-publish-docker.yml`:
  - [x] Trigger automatically on pushes to `main` and expose `workflow_dispatch` for a selected branch.
  - [x] Call `tests.yml`, then call `docker-image.yml` only after every test matrix entry passes.
  - [x] Use a workflow-and-ref concurrency group with `cancel-in-progress: true` so unrelated refs remain independent.
  - [x] Request `main` promotion only for `refs/heads/main`; non-main manual runs publish only the SHA tag.
- [x] Update `README.md`, `docker/PACKAGE.md`, and the existing Docker item in `PROJECT_STATE.md` concisely with the SHA/`main` policy, registry-image gate, manual branch workflow, and equivalent local `just` commands.
- [x] Do not add release, semantic-version, `latest`, branch-name, or pull-request behavior.
- [x] Verification
  - [x] `just workflow-check` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue `qxan`
  - [x] Commit changes

### Task/Commit 3: Add weekly dependency maintenance

Enable GitHub-native dependency update PRs across every dependency surface while keeping normal weekly noise bounded by ecosystem grouping. Automatic PR validation remains deferred; maintainers can dispatch the Docker publication workflow for a Dependabot branch after the workflow exists on `main`.

- [ ] Add `.github/dependabot.yml` with weekly update entries for:
  - [ ] Go modules at `/`
  - [ ] npm/pnpm at `/frontend`
  - [ ] Docker at `/docker`
  - [ ] GitHub Actions at `/`
- [ ] Group normal version updates by ecosystem, including major updates, so a typical cycle produces at most one grouped PR per ecosystem when grouping is supported.
- [ ] Use one consistent weekly day, time, and `America/New_York` timezone.
- [ ] Keep Dependabot responsible only for proposing changes; do not add auto-merge or an automatic PR workflow.
- [ ] Verification
  - [ ] `just pre-commit` passes
  - [ ] `git diff --check` passes
  - [ ] Update progress in Kata issue `qxan`
  - [ ] Commit changes

### Task 4: Activate and prove the delivery path

This task begins only after Tasks 1-3 land on `main`, because GitHub exposes manual dispatch only for a workflow present on the default branch. Prove the real hosted path and make the resulting image anonymously deployable before closing the issue.

- [ ] Record the first automatic `build-and-publish-docker` run ID, URL, commit SHA, and result.
- [ ] Confirm its reusable test call passed all four matrix entries.
- [ ] Confirm the SHA image manifest contains `linux/amd64` and `linux/arm64`.
- [ ] Confirm logs show `just test-docker` consumed the published GHCR SHA tag.
- [ ] Confirm `ghcr.io/mishamsk/mina:main` resolves to the same tested image index as the SHA tag.
- [ ] HUMAN GATE: the owner changes the new `mishamsk/mina` GHCR package visibility from Private to Public and confirms the irreversible change.
- [ ] With a fresh anonymous Docker configuration, confirm the public SHA and `main` manifests can be read or pulled without credentials.
- [ ] Record the `main` image digest, manually dispatch `build-and-publish-docker` from a non-main branch, and wait for success.
- [ ] Confirm the manual run publishes and tests its full-SHA tag while the recorded `main` digest remains unchanged.
- [ ] Add hosted-run URLs, image tags/digests, manifest platforms, anonymous-pull evidence, and the branch-delivery result to Kata issue `qxan`.
- [ ] Fix and commit any defect exposed by activation, then repeat every affected activation check.

## Final Verification

- [ ] `just workflow-check` passes
- [ ] `just pre-commit` passes
- [ ] The worktree is clean after all implementation commits
- [ ] With a clean worktree, run `just review-loop "Basic GitHub CI and Docker publication (kata qxan): reusable workflow_call tests and Docker image workflows; build-and-publish-docker runs on main and manual branch dispatch; full non-Docker suite gates SHA publication; published registry image passes Compose lifecycle before guarded main promotion; latest-wins per-ref concurrency; weekly grouped Dependabot for Go, frontend, Docker, and Actions; no PR or release trigger"`
- [ ] Complete Task 4 after the reviewed implementation lands on `main`
- [ ] Move this plan to `docs/plans/completed/` and commit the move
- [ ] Close Kata issue `qxan` with implementation commits, GitHub run URLs, image digests, and validation evidence
