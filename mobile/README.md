# 約嗎 Flutter mobile

Product behavior is defined in [current requirements](../docs/product-requirements.md) and the [decision log](../docs/product-decisions.md). The setup and existing implementation inventory below do not establish end-to-end acceptance or override those requirements.

This directory is the iOS-first mobile workspace. The web app and TypeScript API remain at the repository root.

## Run locally

Install Flutter (Dart 3.5 or newer), then run:

```sh
flutter pub get
flutter run \
  --dart-define=SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY \
  --dart-define=API_BASE_URL=https://YOUR_API_HOST
```

To inspect the calendar layout without a backend account, use the local preview mode:

```sh
flutter run --dart-define=PREVIEW_MODE=true
```

Preview mode uses sample events and does not save changes or connect external calendars.

The checked-in `pubspec.yaml` pins the integration surface: Riverpod, go_router, Supabase Auth, SQLite/Drift dependencies, timezone handling, Firebase Messaging, and ICS parsing. Commit the generated `pubspec.lock` after running `flutter pub get` on the build machine.

## Current vertical slice

- Google and Apple OAuth are launched with Supabase PKCE and the `com.yuema.mobile://login-callback/` deep link.
- The home screen is a five-day horizontally paged calendar beginning at 08:00, with month/year icon switches and an add-event action.
- Events are written through `/api/v1/events` with bearer auth, idempotency keys, and optimistic versions. A failed write is retained as an offline draft in the local cache and retried by `CalendarRepository.syncDrafts()`.
- `/api/v1/calendar-sources` bootstraps a first-party source for older accounts and exposes per-calendar display/coordination flags.
- `/api/v1/device-calendar-busy` accepts only busy/tentative intervals from EventKit; the request has no event title or description fields.
- `/api/v1/calendar-connections` starts a short-lived, one-use OAuth state/PKCE transaction for Google or Microsoft and returns a browser authorization URL for the app deep link.
- `/api/v1/imports/ics` implements a 24-hour ICS preview and explicit apply step; missing times, invalid time zones, and recurrence rules remain clarification questions.
- `DeviceCalendarService` remains the stable Dart boundary for the deferred Apple/Android calendar integration. The MVP's writable calendar is the app-owned source exposed by `/api/v1/events`; Google Calendar stays read-only.

## iOS setup

1. Run `flutter create .` inside `mobile/` to generate the Runner project, or copy the Dart sources into your existing Flutter shell.
2. Add `com.yuema.mobile` as a URL scheme and register the Supabase callback in the iOS target.
3. Add `NSCalendarsFullAccessUsageDescription` and `NSCalendarsWriteOnlyAccessUsageDescription` to `Info.plist`. EventKit uses full calendar access for reading busy/tentative intervals; the app only writes after the person confirms a finalized event.
4. EventKit permission strings and the `com.yuema.mobile/calendar` channel are already present in `ios/Runner`; wire the deferred device-calendar busy upload when Apple calendar support is enabled.
5. Configure APNs/Firebase only in the app target; no service-role key or model key belongs in the app.

## Android follow-up

The same Pigeon contract is ready for a Kotlin `CalendarContractAdapter`. Add `READ_CALENDAR` and `WRITE_CALENDAR` runtime permission handling when Android work begins; the default target is API 24+ and the store target API should be set to the then-current Play requirement.

## Backend migration

Apply the migrations listed in the root [README](../README.md), including the four `2026091610...` MVP migrations, to the dedicated Event Planner Supabase project before using the mobile API. They add atomic invitation creation, deadline/version locks, private Google titles, submission progress, and RLS. The repository's existing Firstgram Supabase projects are unrelated and must not be used for this app.

## TimeTree → Apple Calendar

The new screenshot flow is available from Calendar → Add → Import TimeTree screenshot. It uses native Vision OCR, a separate Nebius classification/extraction pass, editable server drafts, optional Chinese Speech recognition, and EventKit only after explicit preview and target-calendar confirmation. `CalendarShare` is embedded as a native Share Extension using the existing App Group. Apple screenshot writes are now enabled by the 2026-09-27 product decision; the earlier deferred-integration description above no longer applies to this flow. See [implementation and verification](../docs/voice-calendar-import.md).
