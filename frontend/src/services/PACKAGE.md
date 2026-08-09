# frontend/src/services

## Purpose

- Owns browser persistence adapters.

## Implicit Contracts

- Persist only UI-owned preferences, caches, and drafts; never persist REST-derived accounting data or authentication material.
- Storage operations deliberately propagate failures. Stores and features own hydration, user-visible error handling, and recovery when persistence is unavailable.

## Boundaries

- Owns: IndexedDB access and storage-schema versioning.
- Does not own: API calls, Zustand state shape or lifecycle, or domain validation.
