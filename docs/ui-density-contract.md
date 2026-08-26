# Game-screen density contract

Chairman FC should behave like a game interface rather than a long document.

## Desktop and larger tablets

- The application chrome owns the viewport and remains stable while moving between club areas.
- Primary screens should fit the available viewport wherever practical.
- Long collections scroll inside their own bounded panel instead of extending the entire page.
- League tables, squad lists, transfer lists, inbox lists, scouting results, staff lists and transaction history are canonical contained-scroll surfaces.
- Headers, filters, decision controls and summary information stay visible when the collection beneath them scrolls.
- Dense layouts may reduce padding, card height and vertical gaps, but must not hide essential labels or make tap/click targets impractical.

## Mobile

- Natural vertical flow remains acceptable when a fixed-height composition would make controls cramped.
- Long lists should still prefer a clearly bounded panel when doing so remains usable on the device.
- Horizontal swiping is appropriate for peer views such as adjacent league divisions.

## Design test

Before adding vertical page length, ask whether the content is a collection. If it is, give the collection a bounded window first. Page scrolling is a fallback for whole-screen compositions, not the default for lists.
