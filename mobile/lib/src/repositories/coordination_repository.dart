import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/coordination.dart';
import '../services/api_client.dart';

class CoordinationRepository {
  CoordinationRepository(this.api, this.preferences) : _scope = api.cacheScope;
  final String _scope;
  Future<Map<String, dynamic>> _request(String method, String path,
      {Map<String, dynamic>? body}) async {
    if (_scope != api.cacheScope || _scope == 'signed-out')
      throw const ApiException(401, 'ACCOUNT_CHANGED', '請重新登入');
    final result = await api.request(method, path, body: body);
    if (_scope != api.cacheScope)
      throw const ApiException(401, 'ACCOUNT_CHANGED', '請重新登入');
    return result;
  }

  final ApiClient api;
  final SharedPreferences preferences;

  Future<List<GatheringSummary>> list() async {
    final body = await _request('GET', '/api/v1/coordination');
    final userId = api.userId;
    return (body['gatherings'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => GatheringSummary.fromJson(
            Map<String, dynamic>.from(item),
            currentUserId: userId))
        .toList();
  }

  Future<GatheringDetails> get(String id) async {
    try {
      final body = await _request('GET', '/api/v1/coordination/$id');
      final result = GatheringDetails.fromJson(
          Map<String, dynamic>.from(body['gathering'] as Map),
          currentUserId: api.userId);
      await preferences.setString(
          _detailsKey(id), jsonEncode(body['gathering']));
      return _withPendingDraft(id, result);
    } catch (error) {
      if (error is ApiException && error.status == 401) rethrow;
      final raw = preferences.getString(_detailsKey(id));
      if (raw == null) rethrow;
      return _withPendingDraft(
          id,
          GatheringDetails.fromJson(
              Map<String, dynamic>.from(jsonDecode(raw) as Map),
              currentUserId: api.userId));
    }
  }

  Future<GatheringSummary> create(
      {required String name,
      required DateTime dateStart,
      required DateTime dateEnd,
      String dailyStart = '08:00',
      String dailyEnd = '23:00',
      required int duration,
      required DateTime deadline,
      String? idempotencyKey}) async {
    final body = await _request('POST', '/api/v1/coordination', body: {
      if (idempotencyKey != null) 'idempotencyKey': idempotencyKey,
      'name': name,
      'dateStart': _date(dateStart),
      'dateEnd': _date(dateEnd),
      'dailyStart': dailyStart,
      'dailyEnd': dailyEnd,
      'duration': duration,
      'deadline': deadline.toUtc().toIso8601String(),
      'recommendationCount': 3
    });
    return GatheringSummary.fromJson(
        Map<String, dynamic>.from(body['gathering'] as Map),
        currentUserId: api.userId);
  }

  Future<Map<String, dynamic>> previewJoin(String token) =>
      _request('GET', '/api/v1/join/${Uri.encodeComponent(token)}');

  Future<Map<String, dynamic>> join(String token) =>
      _request('POST', '/api/v1/join/${Uri.encodeComponent(token)}');

  Future<AvailabilityDraft> saveDraft(
      String id, String version, Map<String, String> cells) async {
    await preferences.setString(
        _draftKey(id),
        jsonEncode(
            {'cells': cells, 'version': version, 'isPendingSync': true}));
    try {
      final body = await _request('PATCH', '/api/v1/coordination/$id/draft',
          body: {'expectedVersion': version, 'cells': cells});
      await preferences.remove(_draftKey(id));
      return AvailabilityDraft.fromJson(body);
    } catch (error) {
      if (error is ApiException &&
          (error.status == 401 || error.status == 409 || !error.retryable))
        rethrow;
      await preferences.setString(
          _draftKey(id),
          jsonEncode(
              {'cells': cells, 'version': version, 'isPendingSync': true}));
      return AvailabilityDraft(
          cells: {...cells}, version: version, isPendingSync: true);
    }
  }

  Future<AvailabilityDraft> reloadDraft(String id) async {
    final body = await _request('GET', '/api/v1/coordination/$id/draft');
    final draft = AvailabilityDraft.fromJson(body);
    await preferences.remove(_draftKey(id));
    return draft;
  }

  Future<int> syncPendingDrafts() async {
    var synced = 0;
    for (final key
        in preferences.getKeys().where((key) => key.startsWith(_draftPrefix))) {
      final id = key.substring(_draftPrefix.length);
      try {
        final raw = preferences.getString(key);
        if (raw == null) continue;
        final value = Map<String, dynamic>.from(jsonDecode(raw) as Map);
        await _request('PATCH', '/api/v1/coordination/$id/draft', body: {
          'expectedVersion': value['version'],
          'cells': value['cells']
        });
        await preferences.remove(key);
        synced++;
      } catch (_) {
        // Keep the draft for the next foreground retry.
      }
    }
    return synced;
  }

  Future<void> clearLocalCache() async {
    final scope = 'coordination.details.${_scope}.';
    for (final key
        in preferences.getKeys().where((key) => key.startsWith(scope))) {
      await preferences.remove(key);
    }
  }

  Future<Map<String, dynamic>> personalCalendarPreview(String id) =>
      _request('GET', '/api/v1/coordination/$id/personal-calendar');

  Future<AvailabilityDraft> applyPersonalCalendar(
      String id, String version, List<String> selectedKeys) async {
    final body = await _request(
        'POST', '/api/v1/coordination/$id/personal-calendar',
        body: {'expectedDraftVersion': version, 'selectedKeys': selectedKeys});
    return AvailabilityDraft.fromJson(body);
  }

  Future<void> submit(String id, String version, Map<String, String> cells) =>
      _request('POST', '/api/v1/coordination/$id/submit', body: {
        'expectedDraftVersion': version,
        'cells': cells,
        'changes': cells.entries
            .map((entry) => {
                  'date': entry.key.substring(0, 10),
                  'minute': int.parse(entry.key.substring(11, 13)) * 60 +
                      int.parse(entry.key.substring(14)),
                  'status': entry.value
                })
            .toList()
      });

  Future<GatheringDetails> recalculate(String id) async {
    await _request('POST', '/api/v1/coordination/$id/recalculate');
    return get(id);
  }

  Future<void> cancel(String id) =>
      _request('POST', '/api/v1/coordination/$id/cancel');

  Future<GatheringDetails> finalize(String id,
      {required String snapshotId,
      required String candidateId,
      required String revision}) async {
    await _request('POST', '/api/v1/coordination/$id/finalize', body: {
      'snapshotId': snapshotId,
      'candidateId': candidateId,
      'expectedRevision': revision
    });
    return get(id);
  }

  Future<Map<String, dynamic>> addFinalizedEvent(String id,
          {required String candidateId, required String snapshotId}) =>
      _request('POST', '/api/v1/coordination/$id/calendar-event', body: {
        'candidateId': candidateId,
        'snapshotId': snapshotId,
      });

  String get _draftPrefix => 'coordination.draft.${_scope}.';
  String _draftKey(String id) => '$_draftPrefix$id';
  String _detailsKey(String id) => 'coordination.details.${_scope}.$id';

  GatheringDetails _withPendingDraft(String id, GatheringDetails details) {
    final raw = preferences.getString(_draftKey(id));
    if (raw == null) return details;
    try {
      return details.copyWithDraft(AvailabilityDraft.fromJson(
          Map<String, dynamic>.from(jsonDecode(raw) as Map)));
    } catch (_) {
      return details;
    }
  }

  String _date(DateTime date) =>
      '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
}
