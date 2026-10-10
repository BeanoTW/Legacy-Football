# Dependency notice follow-up — updated 10 October 2026

The initial inventory located no top-level notice file in 31 installed package
versions. A recursive follow-up found notices embedded in code/README files and
inside vendored dependencies; absence of a top-level file did not mean absence
of a licence.

## Evidence preserved

- `notice-followup/inventory.json` records registry metadata URLs/hashes and
  upstream notice evidence for 24 of the 31 package versions: 23 pinned licence
  files, plus natural-compare's pinned README and its linked author licence.
  The full licence texts are preserved as SHA-256-named files in the same
  directory. These supplement, rather than replace, OPEN-SOURCE-NOTICES.txt.
- `notice-followup/packaged-embedded-notices.txt` preserves 15 notices from the
  installed package contents: imurmurhash's full MIT README section, esrecurse's
  BSD source header, and 13 vendored dependency notices in victory-vendor.
- `notice-followup/packaged-embedded-inventory.json` records the source paths and
  source/notice hashes for those extracts.

## Remaining gaps

Full root-package notices remain unresolved for five package versions:

| Package | Version | Evidence/limit |
| --- | --- | --- |
| @lovable.dev/vite-tanstack-config | 2.25.3 | Declares MIT; registry metadata has no source gitHead. Confirm notice and applicable service/tooling terms. |
| @humanfs/types | 0.15.0 | Declares Apache-2.0; pinned monorepo has other packages' LICENSE files but no root/types notice located. Do not substitute another package's notice without establishing applicability. |
| keyv | 4.5.4 | Declares MIT; registry metadata has no source gitHead. |
| react-remove-scroll-bar | 2.3.8 | Declares MIT; no root notice retrieved at the registry gitHead. GitHub tree request for that commit was rejected. |
| victory-vendor | 36.9.2 | Declares MIT AND ISC; 13 actual vendored notices preserved, but root-package MIT notice still unresolved. |

The two additional originally missing packages, imurmurhash and esrecurse, have
full notice text preserved directly from the locked installed package contents.

## natural-compare 1.4.0 follow-up

The README at registry gitHead `eec83eee67cfac84d6db30cdd65363f155673770`
attributes copyright (c) 2012-2015 Lauri Rooden and links directly to
`http://lauri.rooden.ee/mit-license.txt`. On 10 October 2026 that URL returned
the full MIT grant, notice condition and disclaimer with Lauri Rooden's
copyright. Both the pinned README and the fetched licence are preserved;
their source URLs and SHA-256 hashes are recorded in the inventory. The author
URL is a live document, not an immutable version-pinned licence blob. This
closes the missing-full-text discovery gap without claiming legal clearance.

## Scope

This is factual notice discovery and preservation, not legal clearance. It does
not prove which dependencies enter the shipped client/server artifacts or that
all distribution obligations have been completed. Build-only/platform packages
are included in the conservative installed inventory. Art, branding, fonts,
provider terms and the final player-facing Credits surface require their own
review. Do not silently mark unresolved items passed.
