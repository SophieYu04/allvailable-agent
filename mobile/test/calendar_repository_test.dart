import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/data/latest.dart' as tzdata;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:yuema_mobile/src/models/calendar_event.dart';
import 'package:yuema_mobile/src/repositories/calendar_repository.dart';
import 'package:yuema_mobile/src/services/api_client.dart';

class FakeApi implements ApiClient {
  @override
  String cacheScope = 'account-a';
  @override
  Future<Map<String, dynamic>> upload(String path,
          {required String requestKey,
          Map<String, String> fields = const {},
          required List<({String field, String path, String mime})>
              files}) async =>
      throw UnimplementedError();
  @override
  String? get userId => cacheScope;
  bool offline = false;
  bool externalFails = false;
  bool loseCreateReply = false;
  bool losePatchReply = false;
  bool loseDeleteReply = false;
  int? status;
  Completer<void>? hold;
  Completer<void>? entered;
  final rows = <String, Map<String, dynamic>>{};
  final requests = <String>[];
  List<Map<String, dynamic>> external = [];

  @override
  Future<Map<String, dynamic>> request(String method, String path,
      {Map<String, dynamic>? body, Map<String, String>? query}) async {
    requests.add('$method $path');
    if (offline) throw TimeoutException('offline');
    if (status != null)
      throw ApiException(status!, 'ERROR', 'test error', retryable: true);
    final gate = hold;
    hold = null;
    if (gate != null) {
      entered?.complete();
      await gate.future;
    }
    if (path == '/api/calendar-events') {
      if (externalFails) throw TimeoutException('external');
      return {'events': external};
    }
    if (path.endsWith('calendar-sources')) return {'sources': []};
    final type = path.contains('/deadlines') ? 'deadline' : 'event';
    if (method == 'GET') {
      final id = path.split('/').last;
      if (id != 'events' && id != 'deadlines') {
        final record = rows.values
            .where((row) => row['id'] == id || row['idempotencyKey'] == id)
            .firstOrNull;
        if (record == null || record['deleted'] == true)
          throw const ApiException(404, 'NOT_FOUND', '不存在');
        return {type: Map<String, dynamic>.from(record)};
      }
      return {
        '${type}s': rows.values
            .where((row) => row['type'] == type && row['deleted'] != true)
            .toList()
      };
    }
    if (method == 'POST') {
      final key = '$type:${body!['idempotencyKey']}';
      final row = rows.putIfAbsent(
          key,
          () => {
                ...body,
                'id': 'server-${rows.length}',
                'version': '1',
                'type': type,
              });
      if (loseCreateReply) {
        loseCreateReply = false;
        throw TimeoutException('server committed but reply lost');
      }
      return {
        type: Map<String, dynamic>.from(row),
        'deleted': row['deleted'] == true
      };
    }
    final row =
        rows.values.singleWhere((row) => path.endsWith('/${row['id']}'));
    if (method == 'DELETE') {
      row['deleted'] = true;
      if (loseDeleteReply) {
        loseDeleteReply = false;
        throw TimeoutException('delete reply lost');
      }
      return {'deleted': true};
    }
    if (method == 'PATCH') {
      if (body!['expectedVersion'] != row['version']) {
        throw const ApiException(409, 'VERSION_CONFLICT', '資料已更新');
      }
      row.addAll(body);
      row['version'] = '${int.parse(row['version'] as String) + 1}';
      if (losePatchReply) {
        losePatchReply = false;
        throw TimeoutException('patch reply lost');
      }
      return {type: Map<String, dynamic>.from(row)};
    }
    throw StateError('Unexpected request: $method $path');
  }
}

const source = CalendarSource(
    id: 'own',
    provider: 'manual',
    displayName: '自己的日曆',
    includeInDisplay: true,
    includeInCoordination: true,
    canWrite: true,
    syncStatus: 'ready');
final start = DateTime.utc(2026, 10, 1, 9);
final end = start.add(const Duration(hours: 1));
final rangeStart = DateTime.utc(2026, 10, 1);
final rangeEnd = DateTime.utc(2026, 10, 2);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  tzdata.initializeTimeZones();
  late FakeApi api;
  late SharedPreferences prefs;
  late CalendarRepository repo;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
    api = FakeApi();
    repo = CalendarRepository(api, prefs);
  });

  Future<CalendarEvent> create([String title = '行程']) =>
      repo.createEvent(source: source, title: title, start: start, end: end);

  test(
      'offline event and deadline survive repository restart and successful GET',
      () async {
    api.offline = true;
    await create();
    await repo.createDeadline(title: '截止事項', dueOn: rangeStart);
    repo = CalendarRepository(api, prefs);
    var items = await repo.loadCalendar(rangeStart, rangeEnd);
    expect(items.events.single.title, '行程');
    expect(items.deadlines.single.isPendingSync, true);
    expect(items.pendingSyncCount, 2);
    api.offline = false;
    items = await repo.loadCalendar(rangeStart, rangeEnd);
    expect(items.events.single.version, '0');
    expect(items.deadlines.single.version, '0');
    expect(items.fromCache, false);
    expect(await repo.syncDrafts(), 2);
    items = await repo.loadCalendar(rangeStart, rangeEnd);
    expect(items.events.length, 1);
    expect(items.deadlines.length, 1);
    expect(items.pendingSyncCount, 0);
  });

  test(
      'lost create reply and repeated concurrent retries create only one event',
      () async {
    api.loseCreateReply = true;
    await create();
    final before = await repo.loadCalendar(rangeStart, rangeEnd);
    expect(before.events.length, 1,
        reason: 'remote copy must not duplicate pending copy');
    await Future.wait(
        [repo.syncDrafts(), repo.syncDrafts(), repo.syncDrafts()]);
    expect(api.rows.length, 1);
    expect((await repo.loadCalendar(rangeStart, rangeEnd)).pendingSyncCount, 0);
  });

  test('editing an ambiguous create applies latest content without duplicate',
      () async {
    api.loseCreateReply = true;
    final draft = await create('原始');
    api.offline = true;
    await repo.updateEvent(event: draft, title: '已修改', start: start, end: end);
    api.offline = false;
    api.losePatchReply = true;
    expect(await repo.syncDrafts(), 0);
    expect(await repo.syncDrafts(), 1);
    expect(api.rows.length, 1);
    expect(api.rows.values.single['title'], '已修改');
    expect(api.rows.values.single['version'], '2');
  });

  test('cancelling ambiguous create survives lost delete reply and restart',
      () async {
    api.loseCreateReply = true;
    final draft = await create();
    await repo.deleteEvent(draft);
    expect((await repo.loadCalendar(rangeStart, rangeEnd)).events, isEmpty);
    api.loseDeleteReply = true;
    expect(await repo.syncDrafts(), 0);
    repo = CalendarRepository(api, prefs);
    expect(await repo.syncDrafts(), 1);
    expect(api.rows.values.single['deleted'], true);
    expect((await repo.loadCalendar(rangeStart, rangeEnd)).pendingSyncCount, 0);
  });

  test('new draft during a retry cannot be overwritten by old queue snapshot',
      () async {
    api.offline = true;
    await create('第一筆');
    api.offline = false;
    final gate = Completer<void>();
    api.hold = gate;
    api.entered = Completer<void>();
    final sync = repo.syncDrafts();
    await api.entered!.future;
    final second = create('第二筆');
    gate.complete();
    await sync;
    await second;
    expect(api.rows.values.map((row) => row['title']),
        containsAll(['第一筆', '第二筆']));
  });

  test('Google source failure retains previous external cache', () async {
    api.external = [
      {
        'provider': 'google',
        'externalId': 'private',
        'title': '本人名稱',
        'startAt': start.toIso8601String(),
        'endAt': end.toIso8601String()
      }
    ];
    await repo.loadCalendar(rangeStart, rangeEnd);
    api.externalFails = true;
    final items = await repo.loadCalendar(rangeStart, rangeEnd);
    expect(items.events.single.title, '本人名稱');
    expect(items.syncFailed, true);
    expect(items.fromCache, true);
  });

  test('logout clears external cache but retains account-isolated drafts',
      () async {
    api.offline = true;
    await create();
    await repo.clearLocalCache();
    api.cacheScope = 'account-b';
    final other = CalendarRepository(api, prefs);
    expect((await other.loadCalendar(rangeStart, rangeEnd)).events, isEmpty);
    await expectLater(repo.syncDrafts(),
        throwsA(isA<ApiException>().having((e) => e.status, 'status', 401)));
    api.cacheScope = 'account-a';
    expect(
        (await CalendarRepository(api, prefs)
                .loadCalendar(rangeStart, rangeEnd))
            .events
            .length,
        1);
  });

  test('account switch during request cannot write response into another cache',
      () async {
    final gate = Completer<void>();
    api.hold = gate;
    api.entered = Completer<void>();
    final saving = create();
    final assertion = expectLater(saving,
        throwsA(isA<ApiException>().having((e) => e.status, 'status', 401)));
    await api.entered!.future;
    api.cacheScope = 'account-b';
    gate.complete();
    await assertion;
    expect(prefs.getKeys().any((key) => key.contains('account-b')), false);
    api.cacheScope = 'account-a';
    expect(await CalendarRepository(api, prefs).syncDrafts(), 1);
    expect(api.rows.length, 1);
  });

  test('401 is surfaced without removing pending drafts', () async {
    api.offline = true;
    await create();
    api.offline = false;
    api.status = 401;
    await expectLater(repo.syncDrafts(), throwsA(isA<ApiException>()));
    api.status = null;
    expect((await repo.loadCalendar(rangeStart, rangeEnd)).pendingSyncCount, 1);
  });

  test(
      '409 preserves pending input and exposes conflict instead of overwriting',
      () async {
    api.loseCreateReply = true;
    final draft = await create();
    await repo.updateEvent(event: draft, title: '我的修改', start: start, end: end);
    api.rows.values.single.addAll({'title': '另一台裝置', 'version': '2'});
    expect(await repo.syncDrafts(), 0);
    final items = await repo.loadCalendar(rangeStart, rangeEnd);
    expect(items.events.single.title, '我的修改');
    expect(items.syncErrors, isNotEmpty);
    expect(api.rows.values.single['title'], '另一台裝置');
  });

  test('offline deadline edits and cancellation are durable', () async {
    api.offline = true;
    final draft = await repo.createDeadline(title: '原始', dueOn: rangeStart);
    await repo.updateDeadline(
        deadline: draft, title: '修改', dueOn: rangeStart, completed: true);
    repo = CalendarRepository(api, prefs);
    var items = await repo.loadCalendar(rangeStart, rangeEnd);
    expect(items.deadlines.single.title, '修改');
    expect(items.deadlines.single.completed, true);
    await repo.deleteDeadline(items.deadlines.single);
    items = await repo.loadCalendar(rangeStart, rangeEnd);
    expect(items.deadlines, isEmpty);
    api.offline = false;
    expect(await repo.syncDrafts(), 1);
    expect(api.rows.values.single['deleted'], true);
  });

  test(
      'fresh remote load cannot later be shadowed by stale local acknowledged copy',
      () async {
    await create('舊名稱');
    api.rows.values.single['title'] = '新名稱';
    await repo.loadCalendar(rangeStart, rangeEnd);
    api.offline = true;
    expect((await repo.loadCalendar(rangeStart, rangeEnd)).events.single.title,
        '新名稱');
  });
  test('explicit reload and save resolve conflict without leaving stale draft',
      () async {
    api.loseCreateReply = true;
    final draft = await create();
    await repo.updateEvent(event: draft, title: '我的修改', start: start, end: end);
    api.rows.values.single.addAll({'title': '另一台裝置', 'version': '2'});
    await repo.syncDrafts();
    await expectLater(
        repo.updateEvent(event: draft, title: '我的修改', start: start, end: end),
        throwsA(isA<ApiException>()));
    final current = await repo.reloadEvent(draft.id);
    await repo.updateEvent(
        event: current, title: '確認覆寫', start: start, end: end);
    final items = await repo.loadCalendar(rangeStart, rangeEnd);
    expect(items.pendingSyncCount, 0);
    expect(items.events.single.title, '確認覆寫');
    expect(api.rows.length, 1);
  });

  test('draft synced while editor was open requires reload before delete',
      () async {
    api.offline = true;
    final draft = await create();
    api.offline = false;
    await repo.syncDrafts();
    await expectLater(repo.deleteEvent(draft), throwsA(isA<ApiException>()));
    await repo.deleteEvent(await repo.reloadEvent(draft.id));
    expect(api.rows.values.single['deleted'], true);
  });

  test('draft whose remote record was deleted can still be cancelled',
      () async {
    api.loseCreateReply = true;
    final draft = await create();
    api.rows.values.single['deleted'] = true;
    await repo.syncDrafts();
    expect(
        (await repo.loadCalendar(rangeStart, rangeEnd)).syncErrors, isNotEmpty);
    await repo.deleteEvent(draft);
    expect(await repo.syncDrafts(), 1);
    expect((await repo.loadCalendar(rangeStart, rangeEnd)).pendingSyncCount, 0);
  });
  test('cached timestamp stays at last complete load when one source fails',
      () async {
    final loaded = await repo.loadCalendar(rangeStart, rangeEnd);
    expect(loaded.cachedAt, isNotNull);
    api.externalFails = true;
    final failed = await repo.loadCalendar(rangeStart, rangeEnd);
    expect(failed.cachedAt, loaded.cachedAt);
    expect(failed.failedSources, ['Google 日曆']);
    api.offline = true;
    final offline =
        await CalendarRepository(api, prefs).loadCalendar(rangeStart, rangeEnd);
    expect(offline.cachedAt, loaded.cachedAt);
    expect(offline.failedSources, containsAll(['App 行程', '截止事項']));
  });
}
