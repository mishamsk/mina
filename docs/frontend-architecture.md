# Mina Frontend Architecture

## What Mina Frontend Is

Mina frontend is the local web UI served by `mina serve`.

- TypeScript React app in `frontend/`.
- Built assets embedded by Go and served from `/`.
- Accounting behavior remains API-first through the backend.
- UI primitives use shadcn/ui with Tailwind CSS.

## Hard Rules

- REST API paths stay under `/api`; browser UI is served from `/`.
- Accounting state comes from the backend through generated REST client code.
- Phase 2 does not use a general server-state query library by default.
- Browser IndexedDB stores UI preferences, UI-only caches, and draft UI state only.
- Do not persist accounting data copied from REST responses in IndexedDB.
- Store accessors must work inside and outside React components.
- Frontend imports must preserve the package boundaries listed below.

## Core Terms

- Frontend workspace: `frontend/`, the TypeScript app workspace.
- Embedded UI boundary: `internal/webui`, the Go-owned embedded asset and UI routing boundary.
- Generated REST client: `frontend/src/api/generated`, generated from `api/openapi.yaml`.
- UI state: browser-local preferences, UI-only caches, and draft screen state.

## Package Boundaries

Imports and runtime knowledge flow from reusable code toward route and feature code.

- `frontend/src/api/generated`: generated REST client code only.
- `frontend/src/api`: generated-client configuration and API entry points only.
- `frontend/src/components`: generic reusable UI components; if it could have come from npm and has no Mina accounting meaning, it belongs here.
- `frontend/src/components/ui`: shadcn/ui generated primitives owned as source.
- `frontend/src/pages`: top-level route screens; pages compose features and shared UI.
- `frontend/src/features`: Mina-specific product-area UI and behavior that implements a workflow but is not a top-level route.
- `frontend/src/hooks`: generic reusable React hooks; if it could be reused outside Mina, it belongs here.
- `frontend/src/lib`: frontend library support helpers such as shadcn utilities.
- `frontend/src/store`: Zustand UI-state modules, selectors, and persistence wiring.
- `frontend/src/services`: browser side-effect adapters such as IndexedDB.
- `frontend/src/models`: frontend-owned types, constants, and view models not generated from OpenAPI.
- `frontend/src/utils`: pure shared helpers; subfolders should follow the feature or service they support.

Rules:

- Generated endpoint paths and DTOs must not be handwritten.
- Do not add TanStack Query, SWR, RTK Query, or equivalent without an architecture update.
- Page code may compose features, shared components, hooks, stores, services, and API operations.
- Features may own Mina-specific UI behavior, feature hooks, and feature helpers, but not generated API setup.
- Components must stay presentational unless feature-owned.
- shadcn/ui components stay in `components/ui`; app-specific wrappers stay in `components`.
- Models stay data-focused; product behavior belongs in features or backend services.
- Services own browser side effects such as IndexedDB.
- Utils must stay pure.

## Frontend Style Guide

- Source module filenames use lowercase kebab-case, e.g. `status-page.tsx`.
- React component, type, and enum identifiers use PascalCase.
- Hooks use `use-` filenames and `useThing` exported identifiers.
- Prefer named exports for app code.
- Use generated REST types for API data; add frontend models only for UI-owned shapes.
- Use shadcn/Tailwind semantic tokens such as `bg-background` and `text-muted-foreground`.
- Avoid hardcoded colors in components unless a domain visualization requires one.
- Use Tailwind for layout, spacing, and state styling; keep reusable variants in components.
- Keep route pages thin; move workflow-specific behavior into `features`.

## Browser Storage

- IndexedDB is browser-local operational UI state only.
- Backend database files remain the only accounting state source.
- UI-only caches are disposable and must not contain accounting data copied from REST responses.

## REST Data Access

- Frontend accounting data is read and written only through configured API entry points from `frontend/src/api`, backed by generated REST client operations.
- REST response data cached in the frontend is a disposable in-memory view snapshot, not an accounting source of truth.
- Zustand may hold UI state, draft state, preferences, and transient in-memory resource snapshots needed by screens.
- IndexedDB must not store accounting data copied from REST responses. It may store UI preferences, draft UI state, and disposable UI-only caches.
- Shareable table query state belongs in the URL: filters, search text, sort, page, and page size.
- Table screens must use backend-supported pagination, filtering, and sorting for unbounded accounting data.
- Do not fetch all accounting rows and paginate client-side except for deliberately bounded lookup lists.
- Page snapshots should be keyed by normalized request params. Re-visiting a loaded page may render from memory immediately.
- Mutations use explicit refresh rules: after create, update, delete, or bulk operations, refresh or invalidate affected resource snapshots.
- Prefer refetch-after-mutation over optimistic cache surgery unless the user experience clearly requires optimism.
- Feature code may expose small resource/controller APIs around generated operations, but those APIs must stay thin and must not duplicate backend domain validation.

## Zustand Stores

- Store modules export a `useXStore` hook, narrow selector hooks, snapshot getters, and named action helpers.
- Selector hooks that return object, array, `Map`, or `Set` values use `useShallow`.
- Action helpers must be usable inside and outside React components.
- Action helpers mutate with `useXStore.setState(...)`; do not hide mutations inside React-only hooks.
- Devtools action names use `StoreName/actionName`, e.g. `StatusPageStore/setStatusPageShowDetails`.
- Getters use `getXSnapshot` names for outside-React reads.
- Mutations use Redux-devtools-compatible helper names such as `setX`, `updateX`, `clearX`, `resetX`, `hydrateX`, and `invalidateX`.

## Config

- Generated client base URL comes from the current browser origin.
- Frontend build output base path is `/`.
- Tailwind CSS v4 is wired through the Vite plugin and `src/styles.css`.
- shadcn/ui registry settings live in `frontend/components.json`.
- Vite dev server proxies `/api` to a running Mina backend.
- Local app config remains owned by `internal/appconfig` and `internal/runtime`.

## REST API

- Frontend calls go through generated operations from `api/openapi.yaml`.
- `internal/httpapi` owns REST handlers, transport mapping, and JSON errors.
- `internal/webui` does not own REST behavior or domain behavior.

## Testing

- Frontend checks run through Justfile recipes.
- Browser end-to-end tests exercise the embedded UI through `mina serve`.
- Playwright config owns frontend e2e browser projects and server startup.

## Boundary Linting

- `just frontend-lint` runs general TypeScript and ESLint checks and ignores generated output.
- Package-boundary imports from the Package Boundaries section are enforced by `no-restricted-imports` rules in `frontend/eslint.config.js`.
- `just frontend-lint` runs Stylelint for CSS.
- `just frontend-fmt` uses Prettier with Tailwind class sorting.
- Frontend lint rules live in `frontend/eslint.config.js` and `frontend/stylelint.config.js`; Justfile recipes own when they run.

## If Editing This File

- Keep this file short.
- Keep rules evergreen.
- Link to owning docs instead of repeating details.
