# Legacy Football release notes

Use this document as the source template for each public beta, release candidate
and 1.0 release. The exact build ID should always be copied from the deployed
build so reports can be tied back to one commit.

## Release header

- Version:
- Channel: Beta / Release Candidate / Stable
- Build:
- Release date:
- Minimum save schema:
- Migration notes:

## Headline changes

Summarise the few changes a returning player will actually notice.

- 
- 
- 

## Gameplay and simulation

- 

## Transfers / recruitment / staff

- 

## Facilities / finances / club operations

- 

## Matchday / calendar / presentation

- 

## Saves / cloud / updates

- 

## UI / accessibility

- 

## Fixed

- 

## Save compatibility

State this explicitly for every release:

- Can saves from the previous public build load?
- Does opening the save migrate it?
- Can a save opened in this release still be loaded by the previous release?
- Is there any known migration risk?
- Was the release soak completed, and for how many seasons?

## Known issues

Link to `docs/KNOWN-ISSUES.md` and copy only player-relevant issues here.

## Validation completed

Record the actual release gates completed on the final commit:

- [ ] Build / typecheck / lint / game checks
- [ ] Release soak
- [ ] Save/account release checklist
- [ ] First-hour cold beta test
- [ ] Accessibility/mobile release gate
- [ ] Update-from-previous-build test
- [ ] Production cloud/account test
- [ ] Legal / credits review

## Rollback note

If the release causes save, migration or update problems, record the last known
good build here before deployment so rollback is unambiguous.

- Last known good version:
- Last known good build:
