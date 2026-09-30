import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:shared_preferences/shared_preferences.dart';
import 'package:timezone/timezone.dart' as tz;

import '../models/calendar_event.dart';
import '../models/deadline.dart';
import '../services/api_client.dart';

class CalendarItems {
  const CalendarItems({
    required this.events,
    required this.deadlines,
    this.fromCache = false,
    this.syncFailed = false,
    this.pendingSyncCount = 0,
    this.syncErrors = const [],
    this.cachedAt,
    this.failedSources = const [],
  });

  final List<CalendarEvent> events;
  final List<Deadline> deadlines;
  final bool fromCache;
  final bool syncFailed;
  final int pendingSyncCount;
  final List<String> syncErrors;
  final DateTime? cachedAt;
  final List<String> failedSources;
}

class _Loaded<T> {
  const _Loaded(this.value,
      {this.fromCache = false,
      this.syncFailed = false,
      this.failedSources = const []});
  final T value;
  final List<String> failedSources;
  final bool fromCache;
  final bool syncFailed;
}

class CalendarRepository {
  CalendarRepository(this.api, this.preferences) : _scope = api.cacheScope;

  final String _scope;
  static final Map<String, Future<void>> _locks = {};
  Future<int>? _syncing;

  // Serialize mutations across repositories for the same account, including
  // repositories recreated by Riverpod while a request is still completing.
  Future<T> _exclusive<T>(Future<T> Function() action) {
    final previous = _locks[_scope] ?? Future<void>.value();
    final result = previous.then((_) => action());
    _locks[_scope] =
        result.then<void>((_) {}, onError: (Object _, StackTrace __) {});
    return result;
  }

  void _checkAccount() {
    if (_scope == 'signed-out' || api.cacheScope != _scope) {
      throw const ApiException(401, 'ACCOUNT_CHANGED', '請重新登入');
    }
  }

  Future<Map<String, dynamic>> _request(String method, String path,
      {Map<String, dynamic>? body, Map<String, String>? query}) async {
    _checkAccount();
    final result = await api.request(method, path, body: body, query: query);
    _checkAccount();
    return result;
  }

  String _newKey() => 'mobile-${DateTime.now().microsecondsSinceEpoch}-'
      '${Random.secure().nextInt(1 << 32)}';

  final ApiClient api;
  final SharedPreferences preferences;

  static const _sourcesKey = 'calendar.sources.v2';
  static const _eventsKey = 'calendar.events.v2';
  static const _deadlinesKey = 'calendar.deadlines.v1';
  static const _draftsKey = 'calendar.drafts.v2';

  Future<List<CalendarSource>> loadSources() async {
    final key = '$_sourcesKey.$_scope';
    try {
      final body = await _request('GET', '/api/v1/calendar-sources');
      final sources = (body['sources'] as List? ?? const [])
          .whereType<Map>()
          .map((item) =>
              CalendarSource.fromJson(Map<String, dynamic>.from(item)))
          .toList();
      await _persist(
          key,
          jsonEncode(sources
              .map((source) => {
                    'id': source.id,
                    'provider': source.provider,
                    'displayName': source.displayName,
                    'includeInDisplay': source.includeInDisplay,
                    'includeInCoordination': source.includeInCoordination,
                    'canWrite': source.canWrite,
                    'syncStatus': source.syncStatus,
                  })
              .toList()));
      return sources;
    } catch (error) {
      if (error is ApiException && error.status == 401) rethrow;
      final raw = preferences.getString(key);
      if (raw == null) return const [];
      try {
        return (jsonDecode(raw) as List)
            .whereType<Map>()
            .map((item) =>
                CalendarSource.fromJson(Map<String, dynamic>.from(item)))
            .toList();
      } catch (_) {
        return const [];
      }
    }
  }

  Future<List<SharedCalendar>> loadSharedCalendars() async {
    final body = await _request('GET', '/api/v1/calendars');
    return (body['calendars'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => SharedCalendar.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  Future<SharedCalendar> createSharedCalendar(
      String name, EventColor color) async {
    final body = await _request('POST', '/api/v1/calendars', body: {
      'name': name,
      'color': eventColorToJson(color),
      'kind': 'shared'
    });
    return SharedCalendar.fromJson(
        Map<String, dynamic>.from(body['calendar'] as Map));
  }

  Future<String> inviteToCalendar(String calendarId, String email,
      {bool viewer = false}) async {
    final body = await _request('POST', '/api/v1/calendars/$calendarId/invites',
        body: {'email': email, 'role': viewer ? 'viewer' : 'editor'});
    return (body['invite'] as Map)['token'].toString();
  }

  Future<void> acceptCalendarInvite(String token) => _request(
        'POST',
        '/api/v1/calendars/invites/accept',
        body: {'token': token},
      ).then((_) {});

  Future<void> updateCalendarMember(
          String calendarId, String userId, String role) =>
      _request('PATCH', '/api/v1/calendars/$calendarId/members/$userId',
          body: {'role': role}).then((_) {});

  Future<void> removeCalendarMember(String calendarId, String userId) =>
      _request('DELETE', '/api/v1/calendars/$calendarId/members/$userId')
          .then((_) {});

  Future<void> leaveCalendar(String calendarId) =>
      _request('DELETE', '/api/v1/calendars/$calendarId').then((_) {});

  Future<List<Map<String, dynamic>>> loadEventComments(String eventId) async {
    final body = await _request('GET', '/api/v1/events/$eventId/comments');
    return (body['comments'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  Future<Map<String, dynamic>> addEventComment(
      String eventId, String text) async {
    final body = await _request('POST', '/api/v1/events/$eventId/comments',
        body: {'body': text});
    return Map<String, dynamic>.from(body['comment'] as Map);
  }

  Future<CalendarItems> loadCalendar(DateTime start, DateTime end) =>
      _exclusive(() async {
        _checkAccount();
        final values = await Future.wait([
          _loadEventsDetailed(start, end),
          _loadDeadlinesDetailed(start, end)
        ]);
        final events = values[0] as _Loaded<List<CalendarEvent>>;
        final deadlines = values[1] as _Loaded<List<Deadline>>;
        if (!events.syncFailed && !deadlines.syncFailed) {
          await _persist(_cacheTimeKey(start, end),
              DateTime.now().toUtc().toIso8601String());
        }
        return CalendarItems(
          events: events.value,
          deadlines: deadlines.value,
          fromCache: events.fromCache || deadlines.fromCache,
          syncFailed: events.syncFailed || deadlines.syncFailed,
          pendingSyncCount: _readDrafts().length,
          cachedAt: DateTime.tryParse(
              preferences.getString(_cacheTimeKey(start, end)) ?? ''),
          failedSources: [...events.failedSources, ...deadlines.failedSources],
          syncErrors: _readDrafts()
              .where((item) => item['error'] != null)
              .map((item) => item['error'].toString())
              .toSet()
              .toList(),
        );
      });

  Future<List<CalendarEvent>> loadEvents(DateTime start, DateTime end) =>
      _exclusive(() async => (await _loadEventsDetailed(start, end)).value);

  Future<_Loaded<List<CalendarEvent>>> _loadEventsDetailed(
      DateTime start, DateTime end) async {
    final query = <String, String>{
      'start': start.toUtc().toIso8601String(),
      'end': end.toUtc().toIso8601String(),
    };
    try {
      final body = await _request('GET', '/api/v1/events', query: query);
      final events = (body['events'] as List? ?? const [])
          .whereType<Map>()
          .map(
              (item) => CalendarEvent.fromJson(Map<String, dynamic>.from(item)))
          .toList();
      try {
        final externalBody =
            await _request('GET', '/api/calendar-events', query: query);
        final external = (externalBody['events'] as List? ?? const [])
            .whereType<Map>()
            .map((item) {
          final value = Map<String, dynamic>.from(item);
          final provider = value['provider']?.toString() ?? 'external';
          final externalId =
              value['externalId']?.toString() ?? value['id']?.toString() ?? '';
          value['id'] = '$provider:$externalId';
          value['sourceId'] = '';
          return CalendarEvent.fromJson(value, external: true);
        }).toList();
        final combined = [...events, ...external];
        await _writeRange(_eventsKey, start, end,
            combined.map((event) => event.toJson()).toList());
        final ids = events.map((item) => item.id).toSet();
        await _pruneLocal(
            _localEventsKey,
            (item) =>
                ids.contains(item['id']) ||
                _eventIntersects(CalendarEvent.fromJson(item), start, end));
        return _Loaded(_mergePendingEvents(combined, start, end));
      } catch (error) {
        if (error is ApiException && error.status == 401) rethrow;
        final combined = [
          ...events,
          ..._readCachedEvents(start, end).where((event) => event.isExternal)
        ];
        await _writeRange(_eventsKey, start, end,
            combined.map((event) => event.toJson()).toList());
        final ids = events.map((item) => item.id).toSet();
        await _pruneLocal(
            _localEventsKey,
            (item) =>
                ids.contains(item['id']) ||
                _eventIntersects(CalendarEvent.fromJson(item), start, end));
        return _Loaded(_mergePendingEvents(combined, start, end),
            fromCache: true,
            syncFailed: true,
            failedSources: const ['Google 日曆']);
      }
    } catch (error) {
      if (error is ApiException && error.status == 401) rethrow;
      return _Loaded(_readCachedEvents(start, end),
          fromCache: true, syncFailed: true, failedSources: const ['App 行程']);
    }
  }

  Future<List<Deadline>> loadDeadlines(DateTime start, DateTime end) =>
      _exclusive(() async => (await _loadDeadlinesDetailed(start, end)).value);

  Future<CalendarItems> loadDeadlineOverview(
          {bool all = false, required DateTime today}) =>
      _exclusive(() async {
        final start = all ? DateTime(1) : today;
        final end = all
            ? DateTime(10000)
            : DateTime(today.year, today.month, today.day + 7);
        final result = await _loadDeadlinesDetailed(start, end, all: all);
        return CalendarItems(
            events: const [],
            deadlines: result.value,
            fromCache: result.fromCache,
            syncFailed: result.syncFailed,
            failedSources: result.failedSources);
      });

  Future<_Loaded<List<Deadline>>> _loadDeadlinesDetailed(
      DateTime start, DateTime end,
      {bool all = false}) async {
    final query = <String, String>{
      'startDate': _dateOnly(start),
      'endDateExclusive': _dateOnly(end)
    };
    try {
      final rows = <dynamic>[];
      int? offset = 0;
      do {
        final body = await _request('GET', '/api/v1/deadlines',
            query: all ? {'all': 'true', 'offset': '$offset'} : query);
        rows.addAll(body['deadlines'] as List? ?? const []);
        offset = all ? body['nextOffset'] as int? : null;
      } while (offset != null);
      final deadlines = rows
          .whereType<Map>()
          .map((item) => Deadline.fromJson(Map<String, dynamic>.from(item)))
          .toList();
      await _writeRange(_deadlinesKey, start, end,
          deadlines.map((deadline) => deadline.toJson()).toList());
      final ids = deadlines.map((item) => item.id).toSet();
      await _pruneLocal(_localDeadlinesKey, (item) {
        final date = Deadline.fromJson(item).dueOn;
        return ids.contains(item['id']) ||
            (!date.isBefore(_day(start)) && date.isBefore(_day(end)));
      });
      return _Loaded(_mergePendingDeadlines(deadlines, start, end));
    } catch (error) {
      if (error is ApiException && error.status == 401) rethrow;
      return _Loaded(_readCachedDeadlines(start, end),
          fromCache: true, syncFailed: true, failedSources: const ['截止事項']);
    }
  }

  Future<CalendarEvent> reloadEvent(String id) async {
    final body = await _request('GET', '/api/v1/events/$id');
    return CalendarEvent.fromJson(
        Map<String, dynamic>.from(body['event'] as Map));
  }

  Future<Deadline> reloadDeadline(String id) async {
    final body = await _request('GET', '/api/v1/deadlines/$id');
    return Deadline.fromJson(
        Map<String, dynamic>.from(body['deadline'] as Map));
  }

  Future<CalendarEvent> createEvent({
    required CalendarSource source,
    required String title,
    required DateTime start,
    required DateTime end,
    EventColor color = EventColor.sage,
    String? timeZone,
    bool allDay = false,
    String? calendarId,
  }) =>
      _exclusive(() async {
        _checkAccount();
        final payload = <String, dynamic>{
          'sourceId': source.id,
          'calendarId': calendarId,
          'title': title,
          'color': eventColorToJson(color),
          'allDay': allDay,
          'startAt': allDay ? null : start.toUtc().toIso8601String(),
          'endAt': allDay ? null : end.toUtc().toIso8601String(),
          'startDate': allDay ? _dateOnly(start) : null,
          'endDateExclusive': allDay ? _dateOnly(end) : null,
          'timeZone': timeZone ?? tz.local.name,
          'idempotencyKey': _newKey(),
        };
        await _queueDraft('event', payload);
        try {
          final result = await _syncOne(_readDrafts().last);
          return CalendarEvent.fromJson(result!);
        } catch (error) {
          if (!_canQueue(error)) {
            if (error is ApiException && error.code == 'ACCOUNT_CHANGED')
              rethrow;
            await _removeDraft('event', payload['idempotencyKey'] as String);
            rethrow;
          }
          return CalendarEvent.fromJson(_pendingJson(payload));
        }
      });

  Future<CalendarEvent> updateEvent(
          {required CalendarEvent event,
          required String title,
          required DateTime start,
          required DateTime end,
          EventColor color = EventColor.sage,
          String? timeZone,
          bool? allDay}) =>
      _exclusive(() async {
        _checkAccount();
        final isAllDay = allDay ?? event.allDay;
        if (event.version == '0') {
          _checkDraft('event', event.id);
          final payload = _draftFor('event', event.id);
          if (payload == null)
            throw const ApiException(409, 'DRAFT_NOT_FOUND', '離線草稿已不存在');
          final updatedPayload = {
            ...payload,
            'title': title,
            'color': eventColorToJson(color),
            'allDay': isAllDay,
            'startAt': isAllDay ? null : start.toUtc().toIso8601String(),
            'endAt': isAllDay ? null : end.toUtc().toIso8601String(),
            'startDate': isAllDay ? _dateOnly(start) : null,
            'endDateExclusive': isAllDay ? _dateOnly(end) : null,
            'timeZone': timeZone ?? event.timeZone ?? tz.local.name,
          };
          await _replaceDraft('event', event.id, updatedPayload);
          final updated = CalendarEvent(
            id: event.id,
            sourceId: event.sourceId,
            calendarId: event.calendarId,
            createdBy: event.createdBy,
            title: title,
            color: color,
            allDay: isAllDay,
            startAt: isAllDay ? null : start.toUtc(),
            endAt: isAllDay ? null : end.toUtc(),
            startDate: isAllDay ? _day(start) : null,
            endDateExclusive: isAllDay ? _day(end) : null,
            timeZone: timeZone ?? event.timeZone ?? tz.local.name,
            version: '0',
          );
          return updated;
        }
        final body =
            await _request('PATCH', '/api/v1/events/${event.id}', body: {
          'sourceId': event.sourceId,
          'calendarId': event.calendarId,
          'title': title,
          'color': eventColorToJson(color),
          'allDay': isAllDay,
          'startAt': isAllDay ? null : start.toUtc().toIso8601String(),
          'endAt': isAllDay ? null : end.toUtc().toIso8601String(),
          'startDate': isAllDay ? _dateOnly(start) : null,
          'endDateExclusive': isAllDay ? _dateOnly(end) : null,
          'timeZone': timeZone ?? event.timeZone ?? tz.local.name,
          'expectedVersion': event.version,
        });
        final updated = CalendarEvent.fromJson(
            Map<String, dynamic>.from(body['event'] as Map));
        await _upsertLocalEvent(updated);
        if (event.idempotencyKey != null) {
          await _removeDraft('event', event.idempotencyKey!);
          await _removeLocalOnly(_eventsKey, event.idempotencyKey);
        }
        return updated;
      });

  Future<void> deleteEvent(CalendarEvent event) => _exclusive(() async {
        _checkAccount();
        if (event.version == '0') {
          _checkDraft('event', event.id, cancelling: true);
          await _cancelDraft('event', event.id);
          await _removeLocalOnly(_eventsKey, event.id);
          return;
        }
        await _request('DELETE', '/api/v1/events/${event.id}',
            query: {'version': event.version});
        await _removeCached(_eventsKey, event.id);
        if (event.idempotencyKey != null)
          await _removeDraft('event', event.idempotencyKey!);
      });

  Future<Deadline> createDeadline(
          {required String title,
          required DateTime dueOn,
          bool completed = false,
          bool pinned = false,
          int pinOrder = 0}) =>
      _exclusive(() async {
        _checkAccount();
        final payload = <String, dynamic>{
          'title': title,
          'dueOn': _dateOnly(dueOn),
          'completed': completed,
          'pinned': pinned,
          'pinOrder': pinOrder,
          'idempotencyKey': _newKey(),
        };
        await _queueDraft('deadline', payload);
        try {
          final result = await _syncOne(_readDrafts().last);
          return Deadline.fromJson(result!);
        } catch (error) {
          if (!_canQueue(error)) {
            if (error is ApiException && error.code == 'ACCOUNT_CHANGED')
              rethrow;
            await _removeDraft('deadline', payload['idempotencyKey'] as String);
            rethrow;
          }
          return Deadline.fromJson(_pendingJson(payload));
        }
      });

  Future<Deadline> updateDeadline(
          {required Deadline deadline,
          required String title,
          required DateTime dueOn,
          required bool completed,
          bool? pinned,
          int pinOrder = 0}) =>
      _exclusive(() async {
        _checkAccount();
        final nextPinned = pinned ?? deadline.pinned;
        if (deadline.version == '0') {
          _checkDraft('deadline', deadline.id);
          final payload = _draftFor('deadline', deadline.id);
          if (payload == null)
            throw const ApiException(409, 'DRAFT_NOT_FOUND', '離線草稿已不存在');
          final updatedPayload = {
            ...payload,
            'title': title,
            'dueOn': _dateOnly(dueOn),
            'completed': completed,
            'pinned': nextPinned,
            'pinOrder': pinOrder,
          };
          await _replaceDraft('deadline', deadline.id, updatedPayload);
          final updated = Deadline(
            id: deadline.id,
            title: title,
            dueOn: _day(dueOn),
            completed: completed,
            version: '0',
            isPendingSync: true,
            pinned: nextPinned,
            pinOrder: pinOrder,
          );
          return updated;
        }
        final body =
            await _request('PATCH', '/api/v1/deadlines/${deadline.id}', body: {
          'title': title,
          'dueOn': _dateOnly(dueOn),
          'completed': completed,
          'pinned': nextPinned,
          'pinOrder': pinOrder,
          'expectedVersion': deadline.version,
        });
        final updated = Deadline.fromJson(
            Map<String, dynamic>.from(body['deadline'] as Map));
        await _upsertLocalDeadline(updated);
        if (deadline.idempotencyKey != null) {
          await _removeDraft('deadline', deadline.idempotencyKey!);
          await _removeLocalOnly(_deadlinesKey, deadline.idempotencyKey);
        }
        return updated;
      });

  Future<void> deleteDeadline(Deadline deadline) => _exclusive(() async {
        _checkAccount();
        if (deadline.version == '0') {
          _checkDraft('deadline', deadline.id, cancelling: true);
          await _cancelDraft('deadline', deadline.id);
          await _removeLocalOnly(_deadlinesKey, deadline.id);
          return;
        }
        await _request('DELETE', '/api/v1/deadlines/${deadline.id}',
            query: {'version': deadline.version});
        await _removeCached(_deadlinesKey, deadline.id);
        if (deadline.idempotencyKey != null)
          await _removeDraft('deadline', deadline.idempotencyKey!);
      });

  bool _canQueue(Object error) =>
      error is! ApiException ||
      (error.status != 401 &&
          (error.status != 409 || error.code.endsWith('_CREATE_FAILED')) &&
          (error.retryable || error.status >= 500));

  Future<int> syncDrafts() {
    return _syncing ??= _exclusive(() async {
      _checkAccount();
      var synced = 0;
      for (final draft in _readDrafts()) {
        try {
          await _syncOne(draft);
          synced++;
        } on ApiException catch (error) {
          if (error.status == 401) rethrow;
          // Conflicts and validation failures remain visible until corrected.
          await _markDraftError(draft, error.message,
              conflict:
                  error.status == 409 && !error.code.endsWith('_CREATE_FAILED'),
              remoteDeleted: error.code == 'REMOTE_DELETED');
          if (error.status >= 500) break;
        } catch (_) {
          await _markDraftError(draft, '尚未連線，將自動重試');
          break;
        }
      }
      return synced;
    }).whenComplete(() => _syncing = null);
  }

  Future<Map<String, dynamic>?> _syncOne(Map<String, dynamic> draft) async {
    final type = draft['type'] as String;
    final payload = Map<String, dynamic>.from(draft['payload'] as Map);
    final original =
        Map<String, dynamic>.from((draft['original'] ?? payload) as Map);
    final id = payload['idempotencyKey'] as String;
    final path = type == 'event' ? '/api/v1/events' : '/api/v1/deadlines';
    final key = type == 'event' ? _eventsKey : _deadlinesKey;
    // Always replay the immutable create request, including after a lost reply.
    final response = await _request('POST', path, body: original);
    var remote = Map<String, dynamic>.from(response[type] as Map);
    if (draft['cancelled'] == true) {
      if (response['deleted'] != true) {
        if (remote['version'].toString() != '1' &&
            !_sameContent(payload, remote)) {
          throw const ApiException(409, 'VERSION_CONFLICT', '資料已更新，請重新載入後確認取消');
        }
        await _request('DELETE', '$path/${remote['id']}',
            query: {'version': remote['version'].toString()});
      }
      await _removeCached(key, remote['id'] as String);
    } else {
      if (response['deleted'] == true) {
        throw const ApiException(409, 'REMOTE_DELETED', '資料已刪除，請取消草稿');
      }
      if (!_sameContent(payload, remote)) {
        if (remote['version'].toString() != '1') {
          throw const ApiException(409, 'VERSION_CONFLICT', '資料已更新，請重新載入後確認');
        }
        final patched = await _request('PATCH', '$path/${remote['id']}', body: {
          ...payload,
          'expectedVersion': remote['version'].toString(),
        });
        remote = Map<String, dynamic>.from(patched[type] as Map);
      }
      if (type == 'event') {
        await _upsertLocalEvent(CalendarEvent.fromJson(remote));
      } else {
        await _upsertLocalDeadline(Deadline.fromJson(remote));
      }
    }
    await _removeDraft(type, id);
    await _removeLocalOnly(key, id);
    return draft['cancelled'] == true ? null : remote;
  }

  bool _sameContent(Map<String, dynamic> payload, Map<String, dynamic> remote) {
    for (final key in payload.keys) {
      if (key == 'idempotencyKey' ||
          (key == 'timeZone' && payload['allDay'] == true)) continue;
      if (key == 'startAt' || key == 'endAt') {
        if (DateTime.tryParse(payload[key]?.toString() ?? '') !=
            DateTime.tryParse(remote[key]?.toString() ?? '')) return false;
      } else if (payload[key] != remote[key]) {
        return false;
      }
    }
    return true;
  }

  Future<void> _markDraftError(Map<String, dynamic> draft, String message,
      {bool conflict = false, bool remoteDeleted = false}) async {
    final id = (draft['payload'] as Map)['idempotencyKey'];
    await _persist(
        _draftKey,
        jsonEncode(_readDrafts()
            .map((item) => (item['payload'] as Map)['idempotencyKey'] == id
                ? {
                    ...item,
                    'error': message,
                    'conflict': conflict,
                    'remoteDeleted': remoteDeleted
                  }
                : item)
            .toList()));
  }

  Future<void> _cancelDraft(String type, String id) async {
    await _persist(
        _draftKey,
        jsonEncode(_readDrafts()
            .map((item) => item['type'] == type &&
                    (item['payload'] as Map)['idempotencyKey'] == id
                ? {...item, 'cancelled': true, 'error': null, 'conflict': false}
                : item)
            .toList()));
  }

  Map<String, dynamic> _pendingJson(Map<String, dynamic> payload) => {
        ...payload,
        'id': payload['idempotencyKey'],
        'version': '0',
      };

  Iterable<Map<String, dynamic>> _pending(String type) => _readDrafts()
      .where((item) =>
          item['type'] == type &&
          (item['cancelled'] != true || item['conflict'] == true))
      .map((item) =>
          _pendingJson(Map<String, dynamic>.from(item['payload'] as Map)));

  bool _hasPendingKey(String? key) =>
      key != null &&
      _readDrafts()
          .any((item) => (item['payload'] as Map)['idempotencyKey'] == key);

  List<CalendarEvent> _mergePendingEvents(
          List<CalendarEvent> events, DateTime start, DateTime end) =>
      [
        ...events.where((item) =>
            item.version != '0' && !_hasPendingKey(item.idempotencyKey)),
        ..._pending('event')
            .map(CalendarEvent.fromJson)
            .where((item) => _eventIntersects(item, start, end)),
      ];

  List<Deadline> _mergePendingDeadlines(
          List<Deadline> deadlines, DateTime start, DateTime end) =>
      [
        ...deadlines.where((item) =>
            item.version != '0' && !_hasPendingKey(item.idempotencyKey)),
        ..._pending('deadline').map((item) => Deadline.fromJson(item)).where(
            (item) =>
                !item.dueOn.isBefore(_day(start)) &&
                item.dueOn.isBefore(_day(end))),
      ];

  Future<void> clearExternalCaches() => _exclusive(() async {
        final prefix = '$_eventsKey.$_scope.';
        for (final key
            in preferences.getKeys().where((key) => key.startsWith(prefix))) {
          final filtered = _readList(key)
              .where((item) =>
                  item['isExternal'] != true &&
                  item['sourceId']?.toString().isNotEmpty == true)
              .toList();
          await _persist(key, jsonEncode(filtered));
        }
      });

  Future<void> clearLocalCache() => _exclusive(() async {
        final prefixes = [
          '$_eventsKey.$_scope.',
          '$_deadlinesKey.$_scope.',
          'calendar.cache-time.$_scope.'
        ];
        for (final key in preferences.getKeys().where((key) =>
            prefixes.any(key.startsWith) || key == '$_sourcesKey.$_scope')) {
          await preferences.remove(key);
        }
      });

  String _cacheTimeKey(DateTime start, DateTime end) =>
      'calendar.cache-time.$_scope.${_dateOnly(start)}_${_dateOnly(end)}';

  String get _draftKey => '$_draftsKey.$_scope';
  String _rangeKey(String kind, DateTime start, DateTime end) =>
      '$kind.$_scope.${_dateOnly(start)}_${_dateOnly(end)}';
  String get _localEventsKey => '$_eventsKey.$_scope.local';
  String get _localDeadlinesKey => '$_deadlinesKey.$_scope.local';

  Future<void> _pruneLocal(
      String key, bool Function(Map<String, dynamic>) matches) async {
    await _persist(key,
        jsonEncode(_readList(key).where((item) => !matches(item)).toList()));
  }

  Future<void> _writeRange(String kind, DateTime start, DateTime end,
          List<Map<String, dynamic>> values) =>
      _persist(_rangeKey(kind, start, end), jsonEncode(values));

  List<CalendarEvent> _readCachedEvents(DateTime start, DateTime end) {
    final values = <Map<String, dynamic>>[
      ..._readList(_rangeKey(_eventsKey, start, end)),
      ..._readList(_localEventsKey)
    ];
    final byId = <String, CalendarEvent>{};
    for (final value in values) {
      try {
        final event = CalendarEvent.fromJson(value);
        if (_eventIntersects(event, start, end)) byId[event.id] = event;
      } catch (_) {}
    }
    return _mergePendingEvents(byId.values.toList(), start, end);
  }

  List<Deadline> _readCachedDeadlines(DateTime start, DateTime end) {
    final values = <Map<String, dynamic>>[
      ..._readList(_rangeKey(_deadlinesKey, start, end)),
      if (start.year == 1)
        ...preferences
            .getKeys()
            .where((key) => key.startsWith('$_deadlinesKey.$_scope.'))
            .expand(_readList),
      ..._readList(_localDeadlinesKey)
    ];
    final byId = <String, Deadline>{};
    for (final value in values) {
      try {
        final deadline = Deadline.fromJson(value,
            pendingSync: value['version']?.toString() == '0');
        if (!deadline.dueOn.isBefore(_day(start)) &&
            deadline.dueOn.isBefore(_day(end))) byId[deadline.id] = deadline;
      } catch (_) {}
    }
    return _mergePendingDeadlines(byId.values.toList(), start, end);
  }

  List<Map<String, dynamic>> _readList(String key) {
    final raw = preferences.getString(key);
    if (raw == null) return const [];
    try {
      return (jsonDecode(raw) as List)
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  List<Map<String, dynamic>> _readDrafts() => _readList(_draftKey);

  Future<bool> _persist(String key, String value) async {
    if (!await preferences.setString(key, value)) {
      throw StateError('無法保存本機資料');
    }
    return true;
  }

  Future<void> _queueDraft(String type, Map<String, dynamic> payload) async {
    await _persist(
        _draftKey,
        jsonEncode([
          ..._readDrafts(),
          {'type': type, 'payload': payload, 'original': payload}
        ]));
  }

  void _checkDraft(String type, String id, {bool cancelling = false}) {
    final matches = _readDrafts().where((item) =>
        item['type'] == type &&
        (item['payload'] as Map)['idempotencyKey'] == id);
    if (matches.isEmpty ||
        (matches.first['conflict'] == true &&
            !(cancelling && matches.first['remoteDeleted'] == true))) {
      throw const ApiException(409, 'VERSION_CONFLICT', '草稿已同步或資料已更新，請重新載入後確認');
    }
  }

  Map<String, dynamic>? _draftFor(String type, String id) {
    for (final draft in _readDrafts()) {
      if (draft['type']?.toString() != type) continue;
      final payload = draft['payload'] is Map
          ? Map<String, dynamic>.from(draft['payload'] as Map)
          : <String, dynamic>{};
      if (payload['idempotencyKey']?.toString() == id) return payload;
    }
    return null;
  }

  Future<void> _replaceDraft(
      String type, String id, Map<String, dynamic> payload) async {
    final drafts = _readDrafts();
    final next = drafts.map((draft) {
      if (draft['type']?.toString() != type) return draft;
      final current = draft['payload'] is Map
          ? Map<String, dynamic>.from(draft['payload'] as Map)
          : <String, dynamic>{};
      return current['idempotencyKey']?.toString() == id
          ? <String, dynamic>{
              ...draft,
              'payload': payload,
              'original': draft['original'] ?? current,
              'error': null
            }
          : draft;
    }).toList();
    await _persist(_draftKey, jsonEncode(next));
  }

  Future<void> _removeDraft(String type, String id) async {
    final next = _readDrafts().where((draft) {
      if (draft['type']?.toString() != type) return true;
      final payload = draft['payload'] is Map
          ? Map<String, dynamic>.from(draft['payload'] as Map)
          : <String, dynamic>{};
      return payload['idempotencyKey']?.toString() != id;
    }).toList();
    await _persist(_draftKey, jsonEncode(next));
  }

  Future<void> _upsertLocalEvent(CalendarEvent event) async {
    await _removeCached(_eventsKey, event.id);
    final items = _readList(_localEventsKey)
        .where((item) => item['id']?.toString() != event.id)
        .toList()
      ..add(event.toJson());
    await _persist(_localEventsKey, jsonEncode(items));
  }

  Future<void> _upsertLocalDeadline(Deadline deadline) async {
    await _removeCached(_deadlinesKey, deadline.id);
    final items = _readList(_localDeadlinesKey)
        .where((item) => item['id']?.toString() != deadline.id)
        .toList()
      ..add(deadline.toJson());
    await _persist(_localDeadlinesKey, jsonEncode(items));
  }

  Future<void> _removeLocalOnly(String type, String? id) async {
    if (id == null) return;
    final key = type == _eventsKey ? _localEventsKey : _localDeadlinesKey;
    await _persist(
        key,
        jsonEncode(_readList(key)
            .where((item) => item['id']?.toString() != id)
            .toList()));
  }

  Future<void> _removeCached(String type, String id) async {
    final prefix = '$type.$_scope.';
    for (final key
        in preferences.getKeys().where((key) => key.startsWith(prefix))) {
      await _persist(
          key,
          jsonEncode(_readList(key)
              .where((item) => item['id']?.toString() != id)
              .toList()));
    }
  }
}

String _dateOnly(DateTime value) =>
    '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
DateTime _day(DateTime value) => DateTime(value.year, value.month, value.day);

bool _eventIntersects(CalendarEvent event, DateTime start, DateTime end) {
  if (event.allDay)
    return event.startDate != null &&
        event.endDateExclusive != null &&
        _day(event.startDate!).isBefore(_day(end)) &&
        _day(event.endDateExclusive!).isAfter(_day(start));
  return event.startAt != null &&
      event.endAt != null &&
      event.startAt!.isBefore(end.toUtc()) &&
      event.endAt!.isAfter(start.toUtc());
}
