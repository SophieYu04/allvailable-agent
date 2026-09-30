import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/calendar_event.dart';
import '../models/coordination.dart';
import '../models/productivity.dart';
import '../repositories/calendar_repository.dart';
import '../repositories/coordination_repository.dart';
import '../repositories/productivity_repository.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/calendar_connection_service.dart';
import '../services/device_calendar.dart';
import '../services/notification_service.dart';

final supabaseProvider =
    Provider<SupabaseClient>((ref) => Supabase.instance.client);
final preferencesProvider = Provider<SharedPreferences>(
    (ref) => throw StateError('SharedPreferences override is required'));
final accountIdProvider = Provider<String?>((ref) {
  ref.watch(authStateProvider);
  return ref.watch(supabaseProvider).auth.currentUser?.id;
});

final apiClientProvider =
    Provider<ApiClient>((ref) => ApiClient(ref.watch(supabaseProvider)));
final authServiceProvider =
    Provider<AuthService>((ref) => AuthService(ref.watch(supabaseProvider)));
final calendarConnectionServiceProvider = Provider<CalendarConnectionService>(
    (ref) => CalendarConnectionService(ref.watch(apiClientProvider)));
final deviceCalendarServiceProvider = Provider<DeviceCalendarService>(
    (ref) => DeviceCalendarService(api: ref.watch(apiClientProvider)));
final notificationServiceProvider = Provider<NotificationService>(
    (ref) => NotificationService(ref.watch(apiClientProvider)));
final calendarRepositoryProvider = Provider<CalendarRepository>((ref) {
  ref.watch(accountIdProvider);
  return CalendarRepository(
      ref.watch(apiClientProvider), ref.watch(preferencesProvider));
});
final coordinationRepositoryProvider = Provider<CoordinationRepository>((ref) {
  ref.watch(accountIdProvider);
  return CoordinationRepository(
      ref.watch(apiClientProvider), ref.watch(preferencesProvider));
});
final productivityRepositoryProvider = Provider<ProductivityRepository>((ref) {
  ref.watch(accountIdProvider);
  return ProductivityRepository(
      ref.watch(apiClientProvider), ref.watch(preferencesProvider));
});

final authStateProvider =
    StreamProvider<AuthState>((ref) => ref.watch(authServiceProvider).changes);
final sourcesProvider = FutureProvider.autoDispose<List<CalendarSource>>(
    (ref) => ref.watch(calendarRepositoryProvider).loadSources());
final sharedCalendarsProvider =
    FutureProvider.autoDispose<List<SharedCalendar>>(
        (ref) => ref.watch(calendarRepositoryProvider).loadSharedCalendars());

class CalendarRange {
  const CalendarRange(this.start, this.end);

  final DateTime start;
  final DateTime end;

  @override
  bool operator ==(Object other) =>
      other is CalendarRange && other.start == start && other.end == end;

  @override
  int get hashCode => Object.hash(start, end);
}

final calendarItemsProvider = FutureProvider.autoDispose
    .family<CalendarItems, CalendarRange>((ref, range) {
  return ref
      .watch(calendarRepositoryProvider)
      .loadCalendar(range.start, range.end);
});

final gatheringsProvider = FutureProvider.autoDispose<List<GatheringSummary>>(
    (ref) => ref.watch(coordinationRepositoryProvider).list());
final gatheringProvider = FutureProvider.autoDispose
    .family<GatheringDetails, String>(
        (ref, id) => ref.watch(coordinationRepositoryProvider).get(id));

final goalsProvider = FutureProvider.autoDispose
    .family<List<Goal>, CalendarRange>((ref, range) => ref
        .watch(productivityRepositoryProvider)
        .loadGoals(range.start, range.end));
final focusBundleProvider = FutureProvider.autoDispose
    .family<FocusBundle, CalendarRange>((ref, range) => ref
        .watch(productivityRepositoryProvider)
        .loadFocus(range.start, range.end));
final focusGroupsProvider = FutureProvider.autoDispose<List<FocusGroup>>(
    (ref) => ref.watch(productivityRepositoryProvider).loadGroups());
