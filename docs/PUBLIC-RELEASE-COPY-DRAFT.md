# Public release copy — working draft

**Do not publish this file as a final Privacy Notice, Terms or Credits.**
Unresolved fields are explicit below. The technical descriptions follow
privacy-data-inventory.md and the 9 October 2026 production configuration audit.
Live account deletion and cross-device isolation tests remain outstanding.

## Privacy Notice draft

Operator/controller: **[business decision required: legal name]**.
Privacy enquiries: **[business decision required: public contact]**.
Effective date: **[set when approved and published]**.

Legacy Football stores careers and preferences in your browser. Local careers
include the fictional director/club information you enter and your game progress.
The game supports three local career slots. It uses IndexedDB, with localStorage
as a fallback where available. Browser storage limits and browser/device clearing
can affect availability; export a career before moving or clearing a device.
Unreadable or newer-format save records are protected for recovery rather than
silently replaced.

Cloud saves are optional. When you sign in using an email link or one-time code,
Supabase processes authentication information and provides an account identifier.
Cloud saves contain that identifier, slot number, game state and modification
time. The production database is in Ireland. **[Confirm operator/provider
arrangements and applicable international transfer wording.]**

Signing out leaves local careers on the device. The account deletion feature is
intended to delete the signed-in account and its associated cloud saves while
preserving local careers. **[Complete live deletion validation before describing
this as verified. Specify provider backup/log retention and privacy request
handling; do not promise immediate deletion from backups.]**

Diagnostics and crash details can be copied or downloaded at your request. They
include technical information such as build, browser and viewport, and limited
career summaries; beta diagnostics exclude account email and full career data.
Review a report before sharing it through **[approved support route]**.

The application currently requests fonts from Google font services, causing your
browser to connect to those services. **[Decide whether to retain remote fonts or
self-host permitted files, and align this statement with the deployed build.]**
The web host/CDN can process connection information. **[Identify actual host,
production telemetry, cookies/storage and retention before publication.]**

**[Add intended audience/minors policy, verified purposes/legal bases where
applicable, rights/request procedure, retention periods and provider disclosures
appropriate to the operator and jurisdictions. These are not supplied by code.]**

## Terms draft

These terms are between you and **[legal operator]**. Contact:
**[public support contact]**. Effective date: **[approval/publication date]**.

Legacy Football is a football management simulation. Your career decisions,
clubs and outcomes are part of the game. **[Confirm intellectual property and
football-branding wording against the asset/provenance review; no licensing or
endorsement permission is asserted by this draft.]**

**[Approve the minimum audience age and account eligibility rules.]** Optional
cloud features require an authenticated account. Keep control of the email
account you use for sign-in. Local careers remain on the device after sign-out.

During beta, defects and changes may affect game progress or save compatibility.
The release notes identify known issues and compatibility limits. Export a save
before updating or clearing browser storage. An older client may refuse a save
written with a newer schema.

**[Legal/business review must supply permitted use and game-content rights,
account suspension/termination rules, service changes, applicable statutory
consumer rights, appropriate liability/warranty provisions, governing law and
dispute terms. No waiver, jurisdiction or licence grant is invented here.]**

## Credits draft

Legacy Football: **[approve creator/operator credits]**.

The application uses open-source software including React, TanStack, Supabase,
Radix, Tailwind, Lucide and other packages. See OPEN-SOURCE-NOTICES.txt and
dependency-license-inventory.json for the installed locked dependency inventory
and packaged notices. These include development packages and are a conservative
inventory, not a distribution-level licence clearance.

Font credits: Barlow Condensed, Instrument Serif, Inter, JetBrains Mono and Work
Sans. **[Verify exact family licences and preserve required notices before
redistributing fonts.]**

**[Supply creator/source, permission basis and attribution for the approved
crest/splash, stadium art, badge elements, portraits and match visuals. Resolve
31 packages whose top-level notice file was not located. Check hosting/service
and Lovable attribution obligations against the actual agreements.]**

## Publication checklist

- [ ] Supply legal operator and support/privacy contact.
- [ ] Approve audience/account eligibility and Terms provisions.
- [ ] Identify public origin, host/CDN, telemetry and provider retention.
- [ ] Verify live isolation, account deletion, sign-out and local preservation.
- [ ] Complete font, asset and dependency notice review.
- [ ] Approve final text and integrate the player-facing legal/credits surfaces.
- [ ] Stamp the approved version/build and link final notes/known issues.

This draft does not authorise publication or declare any release gate passed.
