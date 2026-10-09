# Release metadata

Legacy Football carries two kinds of release identity:

1. **Build ID** — the exact deployment commit/fingerprint used for bug reports.
2. **Release identity** — a human version/channel such as Beta, RC or Stable.

Production deployment may set:

- `LEGACY_FOOTBALL_RELEASE_VERSION`
- `LEGACY_FOOTBALL_RELEASE_CHANNEL`

Examples:

```
LEGACY_FOOTBALL_RELEASE_VERSION=0.9.0
LEGACY_FOOTBALL_RELEASE_CHANNEL=beta
```

```
LEGACY_FOOTBALL_RELEASE_VERSION=1.0.0-rc.1
LEGACY_FOOTBALL_RELEASE_CHANNEL=rc
```

```
LEGACY_FOOTBALL_RELEASE_VERSION=1.0.0
LEGACY_FOOTBALL_RELEASE_CHANNEL=stable
```

If no release metadata is supplied, the app identifies itself as
`Development` / `development`. Do not use a Stable channel until the final
release validation matrix has passed on that exact build.

The commit-derived build ID remains authoritative for reproducing defects even
when two deployments share the same human version.
