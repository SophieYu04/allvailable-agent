# Allvailable home design

Design read: a minimal consumer scheduling homepage for friends, with restrained playful interaction. Native CSS and existing Lucide icons; Motion is confined to the interactive client component.

Dials: DESIGN_VARIANCE 7, MOTION_INTENSITY 5, VISUAL_DENSITY 2.

Audit: the previous page used an enclosed navigation bar, oversized stacked copy and a generic numbered instruction card. Kept the Allvailable wordmark, routes, login/create actions, short English copy, language switch and existing product behavior. Replaced the instruction card with an actual interactive availability example. User-approved light background remains; no new dark theme is introduced.

The example shows one fictional Friday dinner: three individual submissions, up to three candidate intervals, and only the selected candidate's participant statuses. It never shows a full calendar or participant-by-time grid. “Calendars stay private” makes the boundary explicit. Candidate snapshots are illustrative, not live accounts or a claim of real inference. Click/tap/arrow keys select a candidate; hover lifts controls without changing the selected result. Pointer tilt uses spring motion values, resets on exit, and is disabled for touch and reduced motion.

Legacy privacy contract: full drafts and submissions are owner-only; the group receives only candidate-specific necessary states. See the original S1 specification, sections 2.5 and 4.3, and docs/product-requirements.md. Submitted availability is not permission to expose full calendars.

The cafe image at `public/images/together.png` is generated illustrative artwork, not a photograph of actual users. It is served through the existing Next image component with reserved aspect ratio and responsive sizing.

Checks: the earlier calendar-grid browser checks describe the superseded design, not this revision. This privacy-presentation correction has not been browser-tested. Live backend privacy verification remains a separate acceptance gate.

UI refinement: concise hero explains link + screenshot/voice; candidate selector shows numbered options and start times, with a single large full interval below. Candidate-specific response rows use initials and distinct tentative icons. Form name receives focus on opening. Mobile controls retain touch targets. No tests or browser verification were run for this refinement.
