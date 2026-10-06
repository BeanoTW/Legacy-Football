# Legacy Football — Claude Stadium UI/UX Handoff

This pack is a focused snapshot of the CURRENT main branch for a large Ground Studio / Facilities UI pass.

## Goal
Revamp the stadium experience so it is frictionless, clear, mobile-first, visually polished, and immediately understandable.

The intended mental model is:
- Customize = appearance only
- Maintain = condition / repair
- Develop = physical stadium construction
- Facilities = non-visual capability / services

A first-time player should be able to tap a stand and understand:
1. what they own,
2. what condition it is in,
3. what can be changed for free,
4. what can be built next,
5. what it costs,
6. why it can or cannot be built.

## Current canonical architecture — DO NOT regress
- GameState.infrastructure is canonical for physical assets and capital projects.
- Physical stadium development is paid.
- Cosmetic appearance changes are free.
- Stand geometry is capacity-driven.
- Width/depth structural sliders were intentionally removed.
- Structural variants exist: Traditional, Long & Low, Compact.
- Variants affect economics and visible proportions.
- Construction must complete before the live physical geometry grows.
- Corner stands are dedicated infrastructure assets: corner-NW/NE/SW/SE.
- Corner capacity counts toward canonical stadium capacity.
- Do NOT make corners borrow neighbouring stand projects.
- Ground Studio owns physical spectator structures.
- Facilities owns non-visual capability: hospitality, concessions, sanitary/accessibility, retail, parking, training, medical, offices, fan zone.
- Do not create a second economy or duplicate state.
- Preserve save compatibility.

## Current Ground Studio structure
Built stands:
- Customize
- Maintain
- Develop

Customize is now cosmetic only: naming, materials, seats, roof colour, cladding/fascia.
Do not put free physical form, capacity, structural seating type, roof engineering, or tiers back here.

Maintain:
- Shows condition.
- Healthy structures should clearly say no maintenance is needed.
- Repair work should be operational and easy to understand.

Develop:
- Shows current purchased structure.
- Shows capacity, footprint, structural variant, standing/seated type, roof type.
- Shows paid structural projects.
- Unavailable projects must explain why (cash shortfall, reserve, concurrent major work, existing project, etc.).

Corners:
- Empty corner may be Open or Floodlight pylon cosmetically.
- Spectator structure requires paid Build Corner Stand.
- Built corners use Customize / Maintain / Develop.

## Important unresolved product issue
The standalone Roof Upgrade project is currently weak conceptually.
It mostly raises roofQuality / quality and creates construction disruption, but does not yet feel like a meaningful visible progression step.

Do not hide this with prettier styling. Explore a UI that makes roof construction feel like part of a clear structural ladder, e.g.:
uncovered/basic cover -> proper roof -> cantilever/integrated roof -> tiered structure.

Flag any small simulation change that would materially improve this, but do not invent a parallel system.

## UX issues to improve
- The top horizontal component picker is dense on mobile.
- Stadium tapping should stay primary navigation, but fallback navigation can be redesigned.
- Reduce explanatory text where hierarchy/graphics can explain the system.
- Make cosmetic vs paid decisions visually distinct.
- Make project state, construction progress, condition and lock reasons instantly legible.
- Keep the stadium scene central and tactile.
- Preserve corrected corner geometry.
- Do not casually rewrite the renderer.

Potential navigation rethink:
- Stands
- Corners
- Ground
- Surroundings
or another cleaner contextual approach.

## Visual direction
- Premium football product, not generic SaaS/admin UI.
- Deep teal / British racing green identity.
- Dark broadcast-style depth.
- Selective premium purple accents.
- Purple is an accent, not the whole interface.
- Mobile is primary.

## Sensible visual upgrades
Possible:
- stronger selected-component treatment,
- clearer build-stage labels,
- construction overlays,
- maintenance/wear indicators,
- subtle visible condition wear,
- better camera framing.

Keep wear restrained: faded roof/seat treatment, worn concrete, patchy turf etc. Avoid noisy textures.

## Deliverable
Make a LARGE cohesive UI/UX pass, not micro-tweaks.

Return:
- changed files,
- concise summary of the new UX,
- main friction removed,
- any architecture/gameplay issue UI alone cannot solve,
- screenshots/previews if possible.

The implementation should work with the files in this pack. If you need an additional dependency file, state the exact path rather than redesigning around missing context.
