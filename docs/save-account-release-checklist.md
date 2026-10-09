# Career save and account release checklist

This checklist deliberately distinguishes repository/CI coverage from live deployment
verification. **Do not call account registration or cross-device recovery tested** on
the strength of a successful build or simulated game checks alone.

## Automated checks
- [ ] Build, TypeScript, lint and all game-check shards pass.
- [x] Storage checks cover IndexedDB round-trip, migration, integrity protection,
      clear, rollback and quota/write errors.
- [x] Cloud sync planning tests cover missing, equal and invalid timestamps and
      differing copies.
- [x] Verify loading a newer-version or corrupt career blocks a replacement save
      without destroying its original records.
- [x] Verify two rapid writes to one slot always leave the last snapshot stored.
- [x] Verify deleting a slot waits for pending writes and cannot be resurrected
      by a previously queued cloud upload.

Automated evidence (9 October 2026): storage 28/28, save store 45/45,
fake-IndexedDB backend 11/11, migration registry 337/337, plus protection/rollback
and public engine save-queue checks. Cloud planning has 17 passing checks in
merged #299. cloud-queue.check.ts verifies upload-before-delete ordering and
local preservation against a mock API with network calls prohibited. These
checked boxes cover the automated tier; they do not complete the deployed
items below or prove production RLS/account deletion. Full candidate CI remains
a separate gate. See release-validation-2026-10-09.md.

## Deployed account / Supabase verification (requires test accounts and devices)
- [ ] Confirm the deployed site uses the intended Supabase project, and the
      `career_saves` migration and row-level-security policies exist there.
- [ ] Confirm email-link sign-in is enabled and the deployed origin/redirect
      is allowed in Supabase Auth configuration.
- [ ] Create a NEW test account through the email-link flow and return to the
      same career screen. Confirm session survives refresh.
- [ ] Start a test career, advance a week, refresh and confirm identical
      club, week, cash, squad and inbox.
- [ ] Sign in, Sync now, check that the intended three slots appear on a
      second device and load the correct progress.
- [ ] Edit the same career separately on two devices, then Sync now.
      Confirm conflicting copies are shown, neither silently replaced, and
      each explicit Keep device / Keep cloud choice acts as labelled.
- [ ] Sign out, refresh and verify local saves remain available; sign back
      in and verify the cloud copy remains linked to the correct account.
- [ ] Attempt to access another test account's saves. Confirm server-side RLS
      denies read, insert, update and delete across users.
- [ ] Disconnect network during autosave/upload. Verify the local save
      survives refresh, the cloud failure is visible, and a later Sync now
      recovers without losing progress.
- [ ] Delete a test career while signed in; refresh and sync on another device.
      Confirm the deleted career does not reappear.
- [ ] Test a newer-schema cloud career with an older client and confirm it is
      rejected without overwriting the local career.

Do not use anyone's actual existing career as a disposable test case. Make
independent test accounts/slots and preserve their snapshots before destructive
tests.
