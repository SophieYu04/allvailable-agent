import 'package:flutter/services.dart';

import 'api_client.dart';

/// Stable Dart boundary for EventKit (iOS) and CalendarContract (Android).
/// The native implementation only returns busy/tentative intervals and writes
/// an event after the user confirms a finalized invitation.
class DeviceCalendarService {
  const DeviceCalendarService({MethodChannel? channel, this.api})
      : _channel = channel ?? const MethodChannel('com.yuema.mobile/calendar');

  final MethodChannel _channel;
  final ApiClient? api;

  Future<List<String>> importedDraftIds(List<String> ids) async =>
      await _channel
          .invokeListMethod<String>('importedDraftIds', {'ids': ids}) ??
      [];

  Future<List<Map<String, dynamic>>> calendars() async {
    final result = await _channel.invokeMethod<List<dynamic>>('listCalendars');
    return (result ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  Future<List<Map<String, dynamic>>> readBusy(
      {required DateTime start,
      required DateTime end,
      required String timeZone}) async {
    final result = await _channel.invokeMethod<List<dynamic>>('readBusy', {
      'start': start.toUtc().toIso8601String(),
      'end': end.toUtc().toIso8601String(),
      'timeZone': timeZone
    });
    return (result ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  Future<String?> writeEvent(
          {required String title,
          required DateTime start,
          required DateTime end,
          required String calendarId,
          String? draftId,
          bool allDay = false,
          String timeZone = 'Asia/Taipei'}) =>
      _channel.invokeMethod<String>('writeEvent', {
        'title': title,
        'start': start.toUtc().toIso8601String(),
        'end': end.toUtc().toIso8601String(),
        'calendarId': calendarId,
        'allDay': allDay,
        'timeZone': timeZone,
        if (draftId != null) 'draftId': draftId,
      });

  Future<bool> requestAccess() async =>
      await _channel.invokeMethod<bool>('requestAccess') ?? false;

  Future<void> uploadBusy(
      {required String sourceId,
      required String calendarId,
      required DateTime start,
      required DateTime end,
      required List<Map<String, dynamic>> intervals}) async {
    final client = api;
    if (client == null)
      throw StateError('ApiClient is required to upload busy intervals');
    await client.request('POST', '/api/v1/device-calendar-busy', body: {
      'sourceId': sourceId,
      'calendarId': calendarId,
      'rangeStart': start.toUtc().toIso8601String(),
      'rangeEnd': end.toUtc().toIso8601String(),
      'intervals': intervals
    });
  }
}
