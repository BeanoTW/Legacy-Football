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

## Transfer boundary

A compact known player may be shortlisted, scouted and negotiated with without becoming a detailed footballer.

- Opening an enquiry adds a temporary `negotiation` lifecycle reason.
- Scouting shows a valuation range, not the seller's exact hidden threshold.
- For a contracted player, **enquiry precedes the first bid**. Contacting the selling club reveals its current asking position; no transfer fee is on the table until the chairman submits an opening bid.
- Free agents have no seller enquiry and move directly to personal terms.
- A compact seller valuation is derived deterministically from the saved hidden scouting profile and selling club economy; no fake detailed contract is invented.
- Opening personal terms come from the current scouting wage estimate. The player's true demand remains hidden and is used only to accept, reject or counter.
- Rejected, withdrawn or expired talks remove only the temporary negotiation reason. The player's known identity and written history remain.
- Agreement alone does not require whole-club hydration.
- **Successful transfer completion is the materialisation boundary.** Only when the player actually becomes owned does the same stable player ID enter the detailed player array and receive the user's canonical contract.
- An outgoing owned player becomes a lightweight former-player identity once detailed simulation is no longer required. Their career ledger remains append-only.

The invariant is: **simulate detail where attention and contractual ownership require it; preserve identity everywhere else.**

## Persistence

Once a player becomes relevant, their identity survives reductions in simulation detail. History can outlive active simulation.

Remember Player is a richer tracking preference, not the mechanism that keeps identity alive. Forgetting a player stops richer follow-up simulation; it must not erase already-written history.

## Architectural boundary

The intended flow is:

**World simulation → scouting knowledge layer → chairman**

not:

**World simulation → giant browsable player database → chairman**

The long-term transfer game should reward discovery, imperfect information, bargains and attachment to players the club actually found.
