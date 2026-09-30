import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:yuema_mobile/src/services/api_client.dart';
import 'package:yuema_mobile/src/services/widget_service.dart';

class WidgetApi extends ApiClient {
  WidgetApi() : super(SupabaseClient('https://example.supabase.co', 'test'));
  final calls = <String>[];
  @override
  String? get userId => 'account-a';
  @override
  String get cacheScope => 'account-a';
  @override
  Future<Map<String, dynamic>> request(String method, String path,
      {Map<String, dynamic>? body, Map<String, String>? query}) async {
    calls.add('$method $path');
    if (path == '/api/v1/goals')
      return {
        'goals': [
          {
            'id': 'goal-a',
            'ownerId': 'account-a',
            'title': 'Read',
            'role': 'owner',
            'checkins': []
          }
        ]
      };
    return {};
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
            WidgetService.channel,
            (call) async => call.method == 'read'
                ? {
                    'account': 'account-a',
                    'nonce': 'nonce-a',
                    'updatedAt': DateTime.now().millisecondsSinceEpoch / 1000
                  }
                : null);
  });
  test('Taipei date rolls at UTC 16:00, including year rollover', () {
    expect(WidgetService.taipeiDay(DateTime.parse('2026-12-31T15:59:59Z')),
        DateTime.utc(2026, 12, 31));
    expect(WidgetService.taipeiDay(DateTime.parse('2026-12-31T16:00:00Z')),
        DateTime.utc(2027, 1, 1));
    expect(WidgetService.instantForDay(DateTime.utc(2027, 1, 1)),
        DateTime.parse('2026-12-31T16:00:00Z'));
  });
  Uri action(
      {String account = 'account-a', String nonce = 'nonce-a', String? date}) {
    final today = WidgetService.taipeiDay(DateTime.now())
        .toIso8601String()
        .substring(0, 10);
    return Uri(scheme: 'com.yuema.mobile', host: 'widget', queryParameters: {
      'account': account,
      'nonce': nonce,
      'action': 'checkin',
      'id': 'goal-a',
      'value': 'true',
      'day': date ?? today,
    });
  }

  test('other accounts, stale snapshots and old dates cannot mutate', () async {
    final api = WidgetApi();
    final service = WidgetService(api, await SharedPreferences.getInstance());
    for (final uri in [
      action(account: 'account-b'),
      action(nonce: 'old'),
      action(date: '2020-01-01')
    ]) {
      await expectLater(service.perform(uri), throwsStateError);
    }
    expect(api.calls, isEmpty);
  });
  test('replayed goal action executes once with explicit completion', () async {
    final api = WidgetApi();
    final service = WidgetService(api, await SharedPreferences.getInstance());
    final uri = action();
    await Future.wait([service.perform(uri), service.perform(uri)]);
    expect(
        api.calls
            .where((c) => c == 'POST /api/v1/goals/goal-a/checkins')
            .length,
        1);
  });
}
