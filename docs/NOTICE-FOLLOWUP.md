# Dependency notice follow-up — 9 October 2026

The initial inventory located no top-level notice file in 31 installed package
versions. A recursive follow-up found notices embedded in code/README files and
inside vendored dependencies; absence of a top-level file did not mean absence
of a licence.

## Evidence preserved

- `notice-followup/inventory.json` records registry metadata URLs/hashes and
  version-pinned upstream source commits for 23 of the 31 package versions.
  Their upstream notice texts are preserved as SHA-256-named files in the same
  directory. These supplement, rather than replace, OPEN-SOURCE-NOTICES.txt.
- `notice-followup/packaged-embedded-notices.txt` preserves 15 notices from the
  installed package contents: imurmurhash's full MIT README section, esrecurse's
  BSD source header, and 13 vendored dependency notices in victory-vendor.
- `notice-followup/packaged-embedded-inventory.json` records the source paths and
  source/notice hashes for those extracts.

## Remaining gaps

Full root-package notices remain unresolved for six package versions:

| Package | Version | Evidence/limit |
| --- | --- | --- |
| @lovable.dev/vite-tanstack-config | 2.25.3 | Declares MIT; registry metadata has no source gitHead. Confirm notice and applicable service/tooling terms. |
| @humanfs/types | 0.15.0 | Declares Apache-2.0; pinned monorepo has other packages' LICENSE files but no root/types notice located. Do not substitute another package's notice without establishing applicability. |
| keyv | 4.5.4 | Declares MIT; registry metadata has no source gitHead. |
| react-remove-scroll-bar | 2.3.8 | Declares MIT; no root notice retrieved at the registry gitHead. GitHub tree request for that commit was rejected. |
| natural-compare | 1.4.0 | Declares MIT; packaged README preserves copyright and links to the author's licence; no full notice file found in pinned source. |
| victory-vendor | 36.9.2 | Declares MIT AND ISC; 13 actual vendored notices preserved, but root-package MIT notice still unresolved. |

The two additional originally missing packages, imurmurhash and esrecurse, have
full notice text preserved directly from the locked installed package contents.

## Scope

This is factual notice discovery and preservation, not legal clearance. It does
not prove which dependencies enter the shipped client/server artifacts or that
all distribution obligations have been completed. Build-only/platform packages
are included in the conservative installed inventory. Art, branding, fonts,
provider terms and the final player-facing Credits surface require their own
review. Do not silently mark unresolved items passed.
