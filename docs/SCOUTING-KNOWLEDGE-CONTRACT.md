# Scouting Knowledge & Player Fidelity Contract

## Product rule

The football simulation may know more than the chairman does. Recruitment information reaches the player through scouting, not through an omniscient database.

## Fidelity is not visibility

Simulation detail and chairman knowledge are separate concerns.

- **Detailed** players are actively simulated because they currently matter to the game loop.
- **Known** players retain a stable identity and only the lightweight facts needed for continuity.
- **World** players can exist implicitly inside compact club/world state until the chairman discovers them.

A player becoming known does not require their whole club to become detailed.

## Discovery briefs

A scouting brief searches both the detailed Focus bubble and the compact Fringe world. It returns only a small candidate set.

Scout quality may improve selection reliability and the number of useful candidates returned. It must never create stronger players or alter a player's underlying ability.

Brief constraints such as position, age and budget are simulation-side filters. Hidden ability may be used internally as a fit signal, but exact ability is never a chairman-facing search filter.

## Compact-world discovery

When scouting identifies a player from a Fringe club:

1. Create a stable lightweight player identity.
2. Capture the hidden simulation profile needed to keep subsequent scouting deterministic.
3. Do not add the player to the detailed global player array merely because they were discovered.
4. Do not hydrate the rest of that club's squad.
5. Allow further scouting to operate against an ephemeral report subject derived from the saved identity/profile.

This keeps the world large without turning every scouting action into permanent heavy simulation.

## Information progression

Discovery means "we know this player exists". It does not mean a complete report.

Further observation progressively reveals attributes, valuation/wage confidence and personality information through the existing scouting timeline. A compact-world candidate follows the same knowledge rules as a detailed external player.

## Persistence

Once a player becomes relevant, their identity survives reductions in simulation detail. History can outlive active simulation.

Remember Player is a richer tracking preference, not the mechanism that keeps identity alive. Forgetting a player stops richer follow-up simulation; it must not erase already-written history.

## Architectural boundary

The intended flow is:

**World simulation → scouting knowledge layer → chairman**

not:

**World simulation → giant browsable player database → chairman**

The long-term transfer game should reward discovery, imperfect information, bargains and attachment to players the club actually found.