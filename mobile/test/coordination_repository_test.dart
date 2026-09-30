import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:yuema_mobile/src/repositories/coordination_repository.dart';
import 'package:yuema_mobile/src/services/api_client.dart';
import 'calendar_repository_test.dart' show FakeApi;

class DraftApi extends FakeApi {
  Object? failure;
  @override
  Future<Map<String, dynamic>> request(String method, String path,
      {Map<String, dynamic>? body, Map<String, String>? query}) async {
    if (failure != null) throw failure!;
    return {
      'version': '4',
      'cells': {'2030-01-05-18:00': 'yellow'}
    };
  }
}

void main() {
  late SharedPreferences preferences;
  late DraftApi api;
  late CoordinationRepository repository;
  const key = 'coordination.draft.account-a.g';
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    preferences = await SharedPreferences.getInstance();
    api = DraftApi();
    repository = CoordinationRepository(api, preferences);
  });
  test('409 keeps local input but is not reported as offline success',
      () async {
    api.failure = const ApiException(409, 'VERSION_CONFLICT', 'conflict',
        retryable: true);
    await expectLater(
        repository.saveDraft('g', '2', {'2030-01-05-18:00': 'green'}),
        throwsA(isA<ApiException>()));
    expect(preferences.getString(key), contains('green'));
    await expectLater(
        repository.reloadDraft('g'), throwsA(isA<ApiException>()));
    expect(preferences.containsKey(key), isTrue);
    api.failure = null;
    final fresh = await repository.reloadDraft('g');
    expect(fresh.version, '4');
    expect(preferences.containsKey(key), isFalse);
  });
  test('offline draft persists and retry removes only after success', () async {
    api.failure = TimeoutException('offline');
    final saved =
        await repository.saveDraft('g', '2', {'2030-01-05-18:00': 'green'});
    expect(saved.isPendingSync, isTrue);
    expect(await repository.syncPendingDrafts(), 0);
    expect(preferences.containsKey(key), isTrue);
    api.failure = null;
    expect(
        await CoordinationRepository(api, preferences).syncPendingDrafts(), 1);
    expect(preferences.containsKey(key), isFalse);
  });
  test('old repository cannot send drafts after account changes', () async {
    api.cacheScope = 'account-b';
    await expectLater(
        repository.reloadDraft('g'), throwsA(isA<ApiException>()));
  });
}
