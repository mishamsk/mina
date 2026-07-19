Review CI changes only for high-impact security or destructive risks.

Check whether a changed job:

- Lets fork-controlled code, inputs, artifacts, caches, or interpolated shell values access secrets, privileged runners, OIDC credentials, or a write-capable token.
- Grants or passes credentials that make repository, release, package, registry, deployment, or cloud resources writable from an untrusted execution path.
- Can delete, overwrite, retag, or replace previously published artifacts or releases because event, ref, environment, or target guards are missing or incorrect.
- Runs a mutable or untrusted third-party action in a privileged context where compromise could exfiltrate credentials or alter protected resources.

Ignore CI correctness, coverage, performance, style, version freshness, and harmless permission excess. Report only concrete major findings with an evidenced attack or destructive execution path. Report problems only - no positive observations.
