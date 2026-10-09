# Legacy Football production cloud audit

Audit date: 2026-10-09

This document records the production Supabase state verified during pre-launch
hardening. Re-run it on the intended release candidate; it is not a permanent
guarantee that the deployment remains unchanged.

## Project

- Supabase project: Football Finances Empire
- Project ref: uctylgwwqeqrycjekeor
- Region: eu-west-1 (Ireland)
- Database: PostgreSQL 17
- Project status at audit: ACTIVE_HEALTHY

The application source currently targets this project by default when no
environment-specific Supabase URL is supplied.

## Career save table

Verified table: public.career_saves

Columns:
- user_id uuid
- slot_id text
- state jsonb
- state_updated_at timestamptz
- updated_at timestamptz

Primary key:
- (user_id, slot_id)

Slot constraint:
- slot-1
- slot-2
- slot-3

user_id references auth.users(id).

Row Level Security was enabled at audit time.

## Verified RLS policies

The live database had explicit policies for every operation:

- SELECT: auth.uid() = user_id
- INSERT: WITH CHECK auth.uid() = user_id
- UPDATE: USING auth.uid() = user_id and WITH CHECK auth.uid() = user_id
- DELETE: auth.uid() = user_id

This is the required ownership model for cloud careers: the browser client may
only access rows belonging to its authenticated Supabase user.

Before stable release, repeat this check and perform a practical two-account
test with disposable users so policy configuration and client behaviour are both
verified.

## Security advisor review

During this audit Supabase reported that public.rls_auto_enable(), a
SECURITY DEFINER event-trigger helper, was executable by anon/authenticated
clients.

The helper is used internally by the active ensure_rls ddl_command_end event
trigger to enable RLS automatically on newly created public tables. Client RPC
access was unnecessary.

Applied production migration:
- lock_down_rls_auto_enable

Change:
- revoked EXECUTE on public.rls_auto_enable() from public, anon and authenticated.

The ensure_rls event trigger remains active.

After the migration, the SECURITY DEFINER exposure warnings were no longer
reported.

## Remaining Supabase advisor warning

At the end of this audit the remaining security advisor warning was:

- Leaked password protection disabled.

Legacy Football currently uses email magic-link / OTP authentication in its UI,
rather than asking players to create a password. Reassess this warning if
password authentication is enabled later.

## Client credentials

The browser application is designed to use a Supabase publishable/anon client
credential only.

Release gate:
- confirm no service_role or other privileged key appears in browser source,
  environment output, bundles or public repository history;
- rotate any credential if its role is uncertain;
- prefer the current publishable-key format for browser clients.

A publishable/anon key is not an authorization boundary. RLS remains mandatory.

## Required live tests before public release

Use two disposable accounts, A and B.

Account A:
1. Sign in.
2. Create/sync careers in all three slots.
3. Verify reload/download on a second browser/device.

Account B:
1. Sign in independently.
2. Confirm no A career appears.
3. Create its own slot with the same slot ID.
4. Confirm it cannot update/delete/read A's rows.

Then:
- create a deliberate local/cloud conflict and verify the player is asked which
  copy to keep;
- verify a newer cloud state cannot be silently overwritten by an older local
  state;
- verify cloud deletion removes only the signed-in user's selected slot;
- verify sign-out leaves local careers available but blocks cloud mutations;
- verify switching accounts on a browser with linked local careers triggers the
  ownership protection;
- verify an unreadable/future-schema local save cannot be destroyed by sync.

## Account deletion and retention — unresolved

The current game exposes career deletion and sign-out, but this audit has not
verified a player-facing full Supabase account deletion flow.

Before publishing Privacy/Terms, decide and implement/document:
- how a player requests/deletes their account;
- whether deleting an account cascades career_saves;
- how long authentication/account records are retained;
- whether provider backups/logs have separate retention;
- support/contact route for deletion/privacy requests.

## Release sign-off

Repeat on the final release candidate:

- [ ] project is healthy;
- [ ] career_saves RLS enabled;
- [ ] all four ownership policies present;
- [ ] no client-executable privileged SECURITY DEFINER helper;
- [ ] two-account isolation test passed;
- [ ] conflict-resolution test passed;
- [ ] deletion test passed;
- [ ] client bundle contains no privileged Supabase key;
- [ ] Privacy Notice matches the actual production configuration.
