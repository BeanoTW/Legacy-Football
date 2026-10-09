# First-hour cold beta protocol

This protocol is for testers who have not followed development closely. The
observer's job is to watch, not teach. If the tester asks what to do, where
something is, or what a term means, record it before helping.

## Test setup

Use a fresh career and the intended beta/release-candidate build.

Ask the tester to play naturally for up to 60 minutes. Do not give them a tour.
Only explain controls if they are completely blocked.

Record:
- build ID;
- device / viewport;
- whether they installed the PWA or used the browser;
- whether they have played football-management games before.

## What the first hour must communicate

Without being told, the tester should understand that:

- they own the club and are Director of Football & Operations;
- they cannot be sacked, but their decisions shape the club;
- the manager owns team-selection/football responsibilities;
- Inbox contains decisions and information requiring attention;
- Advance / Calendar moves time and stops when the game needs them;
- recruitment is staff-led and knowledge-based, not a global player database;
- Squad, Transfers, Staff, Finances and Facilities are distinct working areas;
- the tutorial explains systems but does not reveal optimal choices or hidden
  consequences.

## Observation sheet

For each event, record the minute, what the tester tried, what they expected,
what actually happened, and whether they recovered without help.

High-value observations:

- first reaction to Home;
- first navigation action;
- whether they notice the opening decision/tutorial;
- whether they understand why Advance stops;
- whether they know where to find unread Inbox items;
- first attempt to recruit a player;
- first attempt to alter the squad;
- first staff/manager interaction;
- first transfer negotiation;
- first fixture / watch-or-sim decision;
- first use of Finances;
- first use of Facilities;
- first save/update/settings interaction.

## Required tasks

Do not present this as a checklist to the tester. The observer uses it to judge
whether natural play reaches the key systems.

By the end of the session, ideally the tester has:

1. Created a club and understood their role.
2. Completed or deliberately skipped the relevant onboarding.
3. Found Inbox and handled at least one decision.
4. Appointed or reviewed the manager/staff.
5. Opened Squad and understood the selected XI/substitutes.
6. Reached Transfers and understood how scouting/recruitment works.
7. Started at least one scouting/recruitment action.
8. Advanced time and understood why it stopped.
9. Reached a fixture and watched or simulated it.
10. Opened Finances and understood the headline financial position.
11. Opened Facilities / Ground Studio.
12. Saved/reloaded or relaunched and resumed the same career.

## Questions to ask after play

Only ask these after the session so they do not prime the tester.

- What is your job at the club?
- What does the manager control?
- If you wanted a new striker, what would you do?
- What do you think Advance does?
- Where would you look if the game needed a decision from you?
- Which screen felt most confusing?
- Was there anywhere you felt you had to scroll/search too much?
- Did anything look clickable that was not?
- Did anything important fail to look clickable?
- Did any wording feel like developer language rather than football language?
- Did the tutorial tell you enough?
- Did the tutorial tell you too much?
- What would you try next if you kept playing?

## Failure signals

Treat these as high-priority usability findings:

- Tester believes they are the manager/head coach.
- Tester expects direct unrestricted player browsing and cannot understand
  staff-led recruitment.
- Tester repeatedly misses unread decisions.
- Tester cannot explain why time stopped.
- Tester cannot find a route back to Home or a major department.
- Tester does not realise a fixture requires action.
- Tester is afraid to make a decision because the UI implies hidden technical
  risk rather than football uncertainty.
- Tester assumes a hidden consequence is guaranteed because UI copy previewed it.
- Tester needs help to find Save / resume their career.
- Tester gets trapped in a sheet/dialog or believes progress was lost.

## Severity

Use four levels:

- **P0** — save loss, crash loop, progression impossible.
- **P1** — core workflow cannot be understood/completed without help.
- **P2** — workflow is possible but confusing, hidden or unnecessarily slow.
- **P3** — cosmetic wording/alignment/polish.

Do not downgrade repeated P2 confusion. If several cold testers fail at the same
point, it is effectively a release blocker even if each individual can eventually
work it out.

## Session report

For each tester, finish with:

- build/device;
- previous management-game experience;
- tasks completed without help;
- moments of confusion;
- P0/P1/P2/P3 findings;
- exact wording the tester used when confused;
- screenshots where layout/visibility caused the problem;
- whether they would continue playing voluntarily;
- top three changes before the next beta.

The observer should avoid explaining away confusion. If a tester misunderstands
the game, the product communicated badly; record the misunderstanding first.
