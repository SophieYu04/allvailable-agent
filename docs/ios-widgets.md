# iOS widgets

The `YuemaWidgets` WidgetKit extension implements the approved minimal design:
week (medium), month with personal stamps (large), deadline (small/medium),
goals (small/medium), subjects (small/medium), and group podium (medium).
No instructional labels, color legend, section headings, or per-day countdown
sentences are rendered. Accessibility labels remain available to VoiceOver.

## Runtime

Requires iOS 17 for the extension; the Flutter app retains its current minimum.
Flutter publishes an atomic JSON snapshot through `com.yuema.mobile/widgets`.
The app and extension share the App Group in `WIDGET_APP_GROUP`. Snapshots contain
only display data and an account-bound action nonce, never authentication tokens.
Refresh occurs on app foreground, successful mutations, local timer changes, and
five-minute foreground intervals. WidgetKit decides when requested reloads run.
Taipei calendar boundaries are used for week/month, checkins, and deadlines.
Timeline entries include midnight and the six-hour snapshot expiration. Expired
snapshots display an update icon instead of stale shared data. Logout/account
changes remove the snapshot. Remote revocation cannot invalidate an offline
snapshot immediately; six hours is its maximum local lifetime.

Widget interactions use `Link` to open an app action route, not inline App Intents.
Checkin sets an explicit boolean and timer actions use existing repositories.
Account, nonce, date, resource access, and timer identity are checked; repeated
operations are serialized and deduplicated. No parallel native timer is created.
Actions currently require resource revalidation online; an action is not shown as
successful solely because the widget was tapped. Existing repository offline
queues still handle interruptions after validation. Errors remain visible in App.

The first three active goals/subjects and first accessible group's weekly server
ranking are shown. Widget-specific resource pickers, lock-screen families, and
Live Activities are not part of this implementation. The parent app remains the
place to select/edit resources and finish a focus session. Timer text advances
using the system date renderer; it does not poll the server every second.

## Signing

Debug/Profile: group.com.yuema.mobile.widgets
Release: group.com.yuema.yuemaMobile.widgets

These follow the project's existing, different bundle identifiers. Register the
corresponding App Group for both the containing app and extension in the Apple
Developer team, then regenerate provisioning profiles before a physical-device
archive. Do not normalize existing bundle identifiers just to make signing pass.
The extension is embedded in Runner through the Embed Widgets build phase.

## Verification

Run `flutter test`, `flutter analyze --no-fatal-infos`, and
`flutter build ios --simulator --debug` in `mobile/`.

Physical-device checklist: add all six widgets; log in; create events/goals/subjects;
compare snapshots; tap a goal twice; pause/resume and switch subjects; cross Taipei
midnight; revoke shared access; sign out/switch account; test large text and tinted
Home Screen appearances. A simulator compilation does not certify device signing,
WidgetKit reload timing, or an authenticated end-to-end deployment.

Implementation verification (2026-09-23): all 29 Flutter tests passed; the focused
widget tests also passed after the routing/time-sampling changes. Static analysis
has no errors or warnings (existing informational style lints remain). The
standalone arm64 simulator extension and the complete simulator Runner app built
successfully, with `PlugIns/YuemaWidgets.appex` present. Device signing and
interactive Home Screen testing have not been performed.
