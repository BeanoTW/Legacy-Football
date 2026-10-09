# Legacy Football privacy and data inventory

This is the factual source for the eventual public Privacy Notice. Keep it in
sync with the application before changing legal copy.

It is an engineering inventory, not a substitute for legal review.

## Data stored only on the player's device

The game stores local career state in browser storage.

Primary storage:
- IndexedDB career records.
- Up to three career slots.
- Career state, compacted history chunks, save manifests and integrity metadata.
- Protected unreadable/future-version save copies when recovery is required.

Fallback storage:
- localStorage when IndexedDB is unavailable.
- Career save data may be stored there instead, subject to browser storage limits.

Other local browser data includes:
- active career slot;
- Continue speed;
- colour/theme and light/dark/system appearance;
- cloud-sync ownership marker;
- per-slot local modified timestamps;
- last cloud-sync timestamp;
- Supabase authentication session data managed by the Supabase client.

The game does not need to upload a local career unless the player signs in and
uses cloud sync.

## Optional account and cloud data

Cloud sync is optional.

Provider:
- Supabase.

Authentication:
- Email magic-link / OTP authentication.
- Supabase provides the authenticated user ID used to scope cloud career rows.

Cloud career storage:
- user ID;
- career slot ID;
- serialized game state;
- state modification timestamp.

The career state can contain user-entered game information such as:
- director name;
- club name and nickname;
- club visual customisation;
- decisions and progress made inside the fictional game career.

The application must not expose one account's cloud careers to another account.
Production Supabase Row Level Security must be verified before a public release.

## Data the app does not intentionally require

The game code does not intentionally require or request:
- real-world postal address;
- phone number;
- date of birth;
- payment-card details;
- contact list;
- precise location;
- microphone;
- camera;
- photo library;
- advertising ID.

If future features add any of these, update this inventory before release.

## Diagnostics and errors

### Player-generated beta diagnostics

The beta diagnostic bundle is deliberately minimal. It may contain:
- build ID;
- game schema version;
- career slot;
- fictional club name;
- season/week and league ID;
- in-game cash;
- counts of squad players, Inbox items, awaiting decisions and active negotiations;
- last local-save timestamp;
- browser user agent;
- language;
- viewport and pixel ratio;
- online/standalone state;
- selected appearance/theme.

It must not include:
- account email;
- full save contents;
- save seed;
- player records;
- contract records;
- Inbox message bodies.

The player must explicitly copy or download this diagnostic report.

### Crash details

The root crash screen can generate copyable crash details containing:
- build ID;
- route;
- timestamp;
- error message / stack where available;
- viewport;
- browser user agent.

This is also player-triggered.

### Lovable preview/editor reporting

The code contains Lovable error-reporting hooks used in the Lovable editor /
preview environment. Confirm before public launch whether any production hosting
environment injects or activates those hooks. The public Privacy Notice must
describe production telemetry based on what is actually deployed, not on the
presence of dormant integration code.

## Third-party network services

Known network-facing services in the current application:

### Supabase
Purpose:
- optional authentication;
- optional cross-device cloud career storage/synchronisation.

Data categories:
- authentication/account data handled by Supabase;
- cloud career state and timestamps.

Release checks:
- production project identified;
- RLS verified;
- deletion flow verified;
- account sign-out verified;
- retention/deletion behaviour documented.

### Google Fonts
The app currently loads fonts from Google's font/CDN endpoints:
- Barlow Condensed;
- Instrument Serif;
- Inter;
- JetBrains Mono;
- Work Sans.

This means the player's browser may connect to Google when loading the app.
Before stable release, decide whether to:
1. retain remote font loading and disclose it; or
2. self-host permitted font files and remove the external request.

Never copy font files into user-visible release artifacts without confirming
their licences and distribution terms.

### Application hosting / CDN
The final host/CDN is not defined by this repository inventory alone. Record the
actual production host before publishing the Privacy Notice because normal web
server/CDN logs can process IP address, request metadata and user agent.

## Cookies and browser storage

The application uses browser storage extensively for game state and preferences.
Supabase authentication may use browser storage as part of session persistence.

Before publishing cookie/storage wording:
- verify whether the deployed Supabase auth configuration sets cookies or only
  browser storage;
- verify whether the production host adds analytics, security or platform
  cookies independently of this repository.

Do not describe the app as using "no cookies" until the deployed site has been
checked.

## Retention and deletion

Current product behaviour:
- local career deletion clears the selected career slot;
- signed-in cloud career deletion attempts to remove the matching Supabase row;
- sign-out leaves local device careers in place;
- protected unreadable copies persist until the player explicitly clears the
  affected slot.

Public legal copy still needs:
- cloud/account retention period;
- account deletion procedure;
- support/contact route for privacy requests;
- backup/log retention behaviour of the production providers.

## Children / age

The code does not currently implement an age-gate. Before public release, decide:
- intended minimum audience age;
- whether accounts/cloud sync are available to minors;
- whether any jurisdiction-specific child privacy requirements apply.

Do not invent an age threshold in public Terms/Privacy until this product
decision is made.

## Advertising and sale of personal data

No advertising SDK or behavioural-advertising integration has been identified
in the current repository audit.

No code has been identified that sells personal data.

Re-check the deployed production stack before making absolute public statements.

## Security-relevant release checks

Before public beta/stable release:
- verify Supabase RLS with two disposable accounts;
- confirm one user cannot read/update/delete another user's career rows;
- test magic-link authentication expiry and sign-out;
- confirm anon/publishable key is the only client-side Supabase credential;
- confirm service-role keys are never shipped to the browser;
- test deletion on device + cloud;
- verify cloud conflict protection;
- confirm future-version saves remain protected;
- verify HTTPS on every production endpoint.

## Information still required before public Privacy copy is final

- Legal operator/controller name.
- Contact email/address for privacy enquiries.
- Production hosting provider.
- Production Supabase project ownership / processing region.
- Provider retention terms.
- Intended audience/minimum age decision.
- Whether Google Fonts remain remote.
- Whether production telemetry beyond the current code audit is enabled.
- Account deletion mechanism and retention policy.
