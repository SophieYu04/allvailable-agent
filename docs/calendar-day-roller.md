# iPhone calendar interaction update

User request: continuous dates, one-day detents and haptics; real calendar API; no seeded data; no automatic keyboard on a time-block tap.

Implemented:
- Five visible days remain, but the horizontal strip moves in individual days and snaps to full day boundaries. A recentred 25-day render window permits continued scrolling without five-day page breaks.
- Selection haptics at each changed date, with a small date marker under each header.
- Fixed hour rail, shared vertical positioning, preserved visible calendar during API range loading and a wider data window for adjacent dates.
- Removed all seeded preview events and deadlines. User-entered items are not deleted by this change.
- Event/deadline/title forms no longer autofocus. Tapping a title field still opens the keyboard normally.

Verification: 32 Flutter tests pass, including daily snapping/haptics across the year boundary and the actual 390×844 calendar screen with an empty calendar and keyboard remaining hidden after a slot tap. Flutter analyze has no errors or warnings (informational style lints remain).

Real calendar connection remains pending source selection. Existing cloud API is implemented but the current environment has no Event Planner-specific Supabase/backend configuration. The connected Supabase account lists only unrelated projects, which were not used or modified. A question was sent offering the original Google/cloud source or iPhone EventKit. Empty preview is not a connected calendar.
