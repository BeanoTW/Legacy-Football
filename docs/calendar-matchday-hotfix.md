# Calendar / matchday hotfix

- ContinueCalendar must render the persisted `calendarDay(state)` value rather than faking Monday/Sunday from the Continue button state.
- Match launch controls must only be actionable on the actual matchday (`isMatchday(state)`).
- After an interactive match settles, the new week starts on Monday and the player must Continue through the calendar before the next fixture can be launched.
- Crossing Sunday remains the only day-level path that settles a full week.
