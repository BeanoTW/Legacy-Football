# Dated transfer response timing

This foundation introduces persisted day-level response timing for transfer negotiations without replacing the existing week-level negotiation expiry safety net.

- `pendingResponseAtDay` and `pendingResponseKind` live on `TransferNegotiation` through module augmentation, so old saves remain valid.
- `scheduleTransferResponseInPlace()` deterministically chooses and persists a reply day; reloads cannot reroll it.
- The Advance timeline now shows a pending transfer reply and the existing negotiation deadline as separate events.
- The next integration step is to have enquiry, club-offer and player-term mutation paths schedule these replies and let day advancement resolve them into Inbox communications.
