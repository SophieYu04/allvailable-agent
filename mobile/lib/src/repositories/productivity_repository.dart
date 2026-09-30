import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/productivity.dart';
import '../services/api_client.dart';
import '../services/widget_service.dart';

class ProductivityRepository {
  ProductivityRepository(this.api, this.preferences) : _scope = api.cacheScope;
  final ApiClient api;
  final SharedPreferences preferences;
  final String _scope;
  Future<Map<String, dynamic>> _request(String method, String path,
      {Map<String, dynamic>? body, Map<String, String>? query}) async {
    if (_scope == 'signed-out' || api.cacheScope != _scope) {
      throw const ApiException(401, 'ACCOUNT_CHANGED', '請重新登入');
    }
    final result = await api.request(method, path, body: body, query: query);
    if (api.cacheScope != _scope) {
      throw const ApiException(401, 'ACCOUNT_CHANGED', '請重新登入');
    }
    return result;
  }

  String get _pendingCheckins => 'productivity.checkins.$_scope';
  String get _localTimer => 'productivity.timer.$_scope';
  String get _pendingFocus => 'productivity.focus.$_scope';

  Future<List<Goal>> loadGoals(DateTime start, DateTime end) async {
    await syncPending();
    final body = await _request('GET', '/api/v1/goals',
        query: {'start': dateKey(start), 'end': dateKey(end)});
    return (body['goals'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => Goal.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  Future<Goal> createGoal(
      {required String title,
      required String color,
      required String icon,
      required String mode}) async {
    final body = await _request('POST', '/api/v1/goals',
        body: {'title': title, 'color': color, 'icon': icon, 'mode': mode});
    return Goal.fromJson(Map<String, dynamic>.from(body['goal'] as Map));
  }

  Future<void> setCheckin(String goalId, DateTime day, bool checked) async {
    final op = {
      'goalId': goalId,
      'date': dateKey(day),
      'checked': checked,
      'key': 'checkin-${DateTime.now().microsecondsSinceEpoch}'
    };
    try {
      await _sendCheckin(op);
    } catch (_) {
      await _append(_pendingCheckins, op);
    }
    WidgetService.changed();
  }

  Future<void> _sendCheckin(Map<String, dynamic> op) => op['checked'] == true
      ? _request('POST', '/api/v1/goals/${op['goalId']}/checkins',
          body: {'date': op['date'], 'idempotencyKey': op['key']}).then((_) {})
      : _request('DELETE', '/api/v1/goals/${op['goalId']}/checkins',
          query: {'date': op['date'] as String}).then((_) {});

  Future<Subject> createSubject(String name, String color) async {
    final body = await _request('POST', '/api/v1/subjects',
        body: {'name': name, 'color': color});
    return Subject.fromJson(Map<String, dynamic>.from(body['subject'] as Map));
  }

  Future<Subject> updateSubject(Subject subject,
      {required String name,
      required String color,
      bool archived = false}) async {
    final body =
        await _request('PATCH', '/api/v1/subjects/${subject.id}', body: {
      'name': name,
      'color': color,
      'archived': archived,
      'expectedVersion': subject.version
    });
    return Subject.fromJson(Map<String, dynamic>.from(body['subject'] as Map));
  }

  Future<void> archiveGoal(Goal goal) =>
      _request('PATCH', '/api/v1/goals/${goal.id}', body: {
        'title': goal.title,
        'color': goal.color,
        'icon': goal.icon,
        'reminderTime': null,
        'archived': true,
        'expectedVersion': goal.version
      }).then((_) {});

  Future<void> setGoalReminder(Goal goal, String? time) =>
      _request('PATCH', '/api/v1/goals/${goal.id}', body: {
        'title': goal.title,
        'color': goal.color,
        'icon': goal.icon,
        'reminderTime': time,
        'archived': false,
        'expectedVersion': goal.version
      }).then((_) {});

  Future<FocusBundle> loadFocus(DateTime start, DateTime end) async {
    await syncPending();
    final values = await Future.wait([
      _request('GET', '/api/v1/subjects'),
      _request('GET', '/api/v1/focus-sessions', query: {
        'start': start.toUtc().toIso8601String(),
        'end': end.toUtc().toIso8601String()
      })
    ]);
    return FocusBundle(
        subjects: (values[0]['subjects'] as List? ?? const [])
            .whereType<Map>()
            .map((item) => Subject.fromJson(Map<String, dynamic>.from(item)))
            .toList(),
        sessions: (values[1]['sessions'] as List? ?? const [])
            .whereType<Map>()
            .map((item) =>
                FocusSession.fromJson(Map<String, dynamic>.from(item)))
            .toList());
  }

  Map<String, dynamic>? activeLocalTimer() {
    final raw = preferences.getString(_localTimer);
    if (raw == null) return null;
    try {
      return Map<String, dynamic>.from(jsonDecode(raw) as Map);
    } catch (_) {
      return null;
    }
  }

  Future<void> startTimer(Subject subject) async {
    if (activeLocalTimer() != null) throw StateError('已有進行中的計時');
    final now = DateTime.now();
    final local = {
      'subjectId': subject.id,
      'subjectName': subject.name,
      'color': subject.color,
      'status': 'running',
      'startedAt': now.toIso8601String(),
      'segments': [
        {'start': now.toIso8601String(), 'end': null}
      ]
    };
    try {
      final body = await _request('POST', '/api/v1/focus-sessions', body: {
        'action': 'start',
        'subjectId': subject.id,
        'idempotencyKey': 'timer-${now.microsecondsSinceEpoch}'
      });
      final session = Map<String, dynamic>.from(body['session'] as Map);
      local['remoteId'] = session['id'];
      local['remoteVersion'] = session['version'];
    } on ApiException {
      rethrow;
    } catch (_) {
      // Network unavailable: keep a local timer and import its exact segments later.
    }
    await preferences.setString(_localTimer, jsonEncode(local));
    WidgetService.changed();
  }

  Future<void> pauseTimer() async {
    final timer = activeLocalTimer();
    if (timer == null || timer['status'] != 'running') return;
    final occurredAt = DateTime.now();
    final segments = (timer['segments'] as List)
        .map((item) => Map<String, dynamic>.from(item as Map))
        .toList();
    segments.last['end'] = occurredAt.toIso8601String();
    timer['segments'] = segments;
    timer['status'] = 'paused';
    await _syncRemoteAction(timer, 'pause', occurredAt);
    await preferences.setString(_localTimer, jsonEncode(timer));
    WidgetService.changed();
  }

  Future<void> resumeTimer() async {
    final timer = activeLocalTimer();
    if (timer == null || timer['status'] != 'paused') return;
    final occurredAt = DateTime.now();
    final segments = (timer['segments'] as List)
        .map((item) => Map<String, dynamic>.from(item as Map))
        .toList()
      ..add({'start': occurredAt.toIso8601String(), 'end': null});
    timer['segments'] = segments;
    timer['status'] = 'running';
    await _syncRemoteAction(timer, 'resume', occurredAt);
    await preferences.setString(_localTimer, jsonEncode(timer));
    WidgetService.changed();
  }

  Future<void> stopTimer() async {
    final timer = activeLocalTimer();
    if (timer == null) return;
    final occurredAt = DateTime.now();
    final segments = (timer['segments'] as List)
        .map((item) => Map<String, dynamic>.from(item as Map))
        .toList();
    if (segments.isNotEmpty && segments.last['end'] == null)
      segments.last['end'] = occurredAt.toIso8601String();
    if (timer['remoteId'] != null) {
      await _syncRemoteAction(timer, 'stop', occurredAt);
      await preferences.remove(_localTimer);
      WidgetService.changed();
      return;
    }
    for (var i = 0; i < segments.length; i++) {
      final segment = segments[i];
      final op = {
        'subjectId': timer['subjectId'],
        'startAt': segment['start'],
        'endAt': segment['end'],
        'key': 'timer-${timer['startedAt']}-$i'
      };
      try {
        await _sendFocus(op);
      } catch (_) {
        await _append(_pendingFocus, op);
      }
    }
    await preferences.remove(_localTimer);
    WidgetService.changed();
  }

  Future<void> _syncRemoteAction(
      Map<String, dynamic> timer, String action, DateTime occurredAt) async {
    final remoteId = timer['remoteId']?.toString();
    if (remoteId == null) return;
    final op = <String, dynamic>{
      'kind': 'remote',
      'sessionId': remoteId,
      'action': action,
      'occurredAt': occurredAt.toUtc().toIso8601String(),
    };
    try {
      final body = await _sendFocusOperation(op);
      final session = body?['session'];
      if (session is Map) timer['remoteVersion'] = session['version'];
    } catch (_) {
      await _append(_pendingFocus, op);
    }
  }

  Future<void> addManual(String subjectId, DateTime start, DateTime end) =>
      _request('POST', '/api/v1/focus-sessions', body: {
        'action': 'manual',
        'subjectId': subjectId,
        'startAt': start.toUtc().toIso8601String(),
        'endAt': end.toUtc().toIso8601String(),
        'idempotencyKey': 'manual-${DateTime.now().microsecondsSinceEpoch}'
      }).then((_) {});
  Future<void> _sendFocus(Map<String, dynamic> op) async {
    await _sendFocusOperation(op);
  }

  Future<Map<String, dynamic>?> _sendFocusOperation(
      Map<String, dynamic> op) async {
    if (op['kind'] == 'remote') {
      return _request('PATCH', '/api/v1/focus-sessions/${op['sessionId']}',
          body: {
            'action': op['action'],
            'occurredAt': op['occurredAt'],
          });
    }
    return _request('POST', '/api/v1/focus-sessions', body: {
      'action': 'import',
      'subjectId': op['subjectId'],
      'startAt':
          DateTime.parse(op['startAt'] as String).toUtc().toIso8601String(),
      'endAt': DateTime.parse(op['endAt'] as String).toUtc().toIso8601String(),
      'idempotencyKey': op['key']
    });
  }

  Future<List<FocusGroup>> loadGroups() async {
    final body = await _request('GET', '/api/v1/focus-groups');
    return (body['groups'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => FocusGroup.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  Future<FocusGroup> createGroup(String name) async {
    final body =
        await _request('POST', '/api/v1/focus-groups', body: {'name': name});
    return FocusGroup.fromJson(Map<String, dynamic>.from(body['group'] as Map));
  }

  Future<List<RankingRow>> ranking(
      String groupId, DateTime start, DateTime end) async {
    final body = await _request('GET', '/api/v1/focus-groups/$groupId/ranking',
        query: {
          'start': start.toUtc().toIso8601String(),
          'end': end.toUtc().toIso8601String()
        });
    return (body['ranking'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => RankingRow.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  Future<String> inviteGoal(String goalId, String email) async {
    final body = await _request('POST', '/api/v1/goals/$goalId/invites',
        body: {'email': email});
    return (body['invite'] as Map)['token'].toString();
  }

  Future<void> acceptGoalInvite(String token) =>
      _request('POST', '/api/v1/goals/invites/accept', body: {'token': token})
          .then((_) {});

  Future<String> inviteGroup(String groupId, String email) async {
    final body = await _request('POST', '/api/v1/focus-groups/$groupId/invites',
        body: {'email': email});
    return (body['invite'] as Map)['token'].toString();
  }

  Future<void> acceptGroupInvite(String token) =>
      _request('POST', '/api/v1/focus-groups/invites/accept',
          body: {'token': token}).then((_) {});

  Future<void> leaveGroup(String groupId) =>
      _request('DELETE', '/api/v1/focus-groups/$groupId').then((_) {});

  Future<void> removeGroupMember(String groupId, String userId) =>
      _request('DELETE', '/api/v1/focus-groups/$groupId',
          query: {'memberId': userId}).then((_) {});

  Future<void> syncPending() async {
    await _flush(_pendingCheckins, _sendCheckin);
    await _flush(_pendingFocus, _sendFocus);
  }

  Future<void> _append(String key, Map<String, dynamic> value) async {
    final list = _read(key)..add(value);
    await preferences.setString(key, jsonEncode(list));
  }

  List<Map<String, dynamic>> _read(String key) {
    try {
      return (jsonDecode(preferences.getString(key) ?? '[]') as List)
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> _flush(
      String key, Future<void> Function(Map<String, dynamic>) send) async {
    final pending = _read(key);
    var done = 0;
    for (final item in pending) {
      try {
        await send(item);
        done++;
      } catch (_) {
        break;
      }
    }
    if (done > 0)
      await preferences.setString(key, jsonEncode(pending.skip(done).toList()));
  }
}
