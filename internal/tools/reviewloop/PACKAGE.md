# github.com/mishamsk/mina/internal/tools/reviewloop

## Purpose

- Orchestrates repository review, finding validation, and focused fix sessions for a selected change range.

## Implicit Contracts

- Backend application selection includes configuration, background execution, concrete providers, shared backend helpers, and hand-written CLI and MCP surface code so accounting-data migration risks receive compatibility review wherever they originate.
- Generated application outputs are excluded; their declarative inputs and generators remain reviewable.

## Boundaries

- Owns: reviewer selection and local review-session orchestration.
- Does not own: application behavior, contract policy, reviewer judgment, or issue tracking.
