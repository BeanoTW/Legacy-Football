# Accessibility and mobile release gate

Run this checklist on the intended release candidate. Passing automated CI alone is
not enough: these checks depend on real browser focus behaviour, text scaling,
touch ergonomics and device viewport constraints.

## Required devices / viewports

Minimum manual matrix:

- Small phone: 360×800 class viewport.
- Typical Android phone: 412×915 class viewport.
- Tablet portrait: ~768×1024.
- Tablet landscape: ~1024×768.
- Laptop: 1280×720.
- Desktop: 1920×1080.

At least one run must use an actual mid-range Android device or installed PWA,
not only desktop browser emulation.

## Keyboard and focus

On desktop/laptop, complete these without a mouse:

- Move through primary navigation with Tab / Shift+Tab.
- Open and close Inbox items.
- Open a decision and reach every available choice.
- Navigate Squad and switch pitch/stats views.
- Navigate Transfers lenses and open a player/deal.
- Open Staff, Facilities and Settings.
- Open and dismiss dialogs/sheets.
- Trigger Save now and Check for updates.

Pass criteria:

- Focus is always visible.
- Focus order follows visual/logical order.
- No keyboard trap inside sheets/dialogs.
- Escape closes modal surfaces where expected.
- Focus returns to a sensible trigger after a dialog closes.
- Icon-only controls have an accessible name.

## Screen-reader semantics

Spot-check with TalkBack, VoiceOver or a desktop screen reader:

- Club masthead announces meaningful club/season context.
- Navigation identifies the active destination.
- Unread Inbox count is understandable without colour.
- Decision status is announced in text.
- Calendar days expose date, fixture and event meaning.
- Tables identify headers correctly.
- Form controls have labels.
- Dialog/sheet titles are announced.
- Match result and important status changes are not colour-only.

Do not require every decorative football graphic to be announced. Decorative
crests, stadium art and ambient icons should be hidden from assistive technology
when they add no information.

## Text scaling and zoom

Test browser zoom at 125%, 150% and 200% on desktop and system/browser text
scaling on mobile.

Pass criteria:

- No primary action disappears off-screen without a way to scroll to it.
- Text does not overlap adjacent controls.
- Dialogs remain scrollable.
- Bottom navigation / Continue controls do not cover content.
- Tables may horizontally scroll where necessary, but the page itself should
  not gain accidental horizontal overflow.
- No essential text is clipped with no accessible alternative.

## Touch targets

On phone/tablet:

- Primary buttons, navigation, calendar days and decision choices are easy to
  hit with one thumb.
- Adjacent destructive and safe actions are not so close that accidental taps
  are likely.
- Icon-only buttons have enough physical hit area even when the icon is small.
- Horizontal swipe areas do not block normal vertical page scrolling.
- Drag interactions have a tap/click alternative where the action is required
  to play the game.

Target roughly 44×44 CSS px for important isolated touch actions where the
layout permits it; compact dense controls may be smaller only when they remain
reliably tappable and are not destructive.

## Colour, contrast and themes

Check every supported appearance/theme combination:

- Light.
- Dark.
- System.
- Club.
- Heritage.
- Floodlights / other shipped club atmosphere themes.

Pass criteria:

- Body text, muted text and button labels remain readable.
- Focus rings are visible.
- Disabled controls are distinguishable without becoming unreadable.
- Selected/unselected states are not colour-only.
- Income/expense, form/result and warning/success states include text, symbol or
  structure in addition to colour.
- Charts/tables remain understandable where colour vision is limited.

## Motion and animation

- Confirm repeated pulse/bounce effects do not block interaction.
- Do not use animation as the only way to communicate required attention.
- Respect reduced-motion preference for non-essential decorative movement where
  practical.
- Match viewer speed controls remain usable without requiring animation to infer
  game state.

## Mobile / installed PWA

Test an installed PWA/home-screen app:

- Cold launch.
- Resume after several minutes in background.
- Rotate device.
- Go offline, continue to a safe local screen, then reconnect.
- Trigger a local save offline.
- Reopen app and verify the career remains.
- Reconnect and retry cloud sync.
- Install/update flow does not cover navigation with browser chrome or safe-area
  issues.
- Bottom dock respects safe-area inset.
- Keyboard opening on text fields does not permanently break viewport height.

## Critical football workflows

Complete each at least once on phone and desktop:

1. Start a new career.
2. Complete onboarding.
3. Appoint manager/staff.
4. Open Inbox and make a decision.
5. Scout/recruit a player.
6. Negotiate a transfer or loan.
7. Change squad selection.
8. Watch or simulate a fixture.
9. Use Calendar/Advance.
10. Open Finances, Facilities and Board.
11. Save, refresh/relaunch and resume.
12. Switch career slots.

Any workflow that is technically possible but requires unexplained horizontal
scrolling, hidden controls or repeated accidental taps is a release defect.

## Release-blocking severity

Treat as **P0/P1** before 1.0:

- A keyboard/screen-reader user cannot complete a required decision.
- Text scaling makes a required action unreachable.
- A mobile layout hides navigation or Continue.
- A destructive action is effectively indistinguishable from a safe action.
- A theme makes essential text unreadable.
- A modal traps focus or cannot be dismissed.
- The installed PWA loses access to the current career after normal
  background/resume/update behaviour.

Cosmetic alignment, decorative alt text and minor density issues can be lower
severity when they do not obstruct play.
