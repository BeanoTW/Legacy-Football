# Facilities Ground Experience

## Build
- Replace the Facilities landing dashboard with a large, mobile-first interactive stadium scene built from reusable SVG/CSS parts.
- Map visible hotspots to existing stand, pitch, hospitality, access, commercial, and clubhouse assets.
- Open each hotspot in a bottom sheet showing condition, current level/effect, next improvement, requirements, cost, and existing project actions.
- Keep active projects, maintenance policy, and works history available in compact secondary panels without overpowering the stadium.

## Ground evolution
- Add a derived, presentation-only seven-stage ground model based on existing facility levels, capacity, and condition.
- Show the current stage, next stage, and met/unmet requirements; stages advance automatically as underlying facilities improve, with no separate payment or new saved state.
- Structure stadium visual parts and stage modifiers for future stand, floodlight, campus, shop, and parking variants.

## Technical details
- Preserve all existing infrastructure state, project approval/cancellation, maintenance, finance, and simulation logic.
- Keep changes contained to Facilities presentation components, a small derived presentation helper, and Facilities-specific styling.
- Run the focused TypeScript check and inspect current build diagnostics after implementation.
