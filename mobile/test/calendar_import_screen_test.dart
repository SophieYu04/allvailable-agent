import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/data/latest.dart' as zones;
import 'package:yuema_mobile/src/screens/calendar_import_screen.dart';
import 'package:yuema_mobile/src/services/api_client.dart';
import 'package:yuema_mobile/src/services/device_calendar.dart';
import 'package:yuema_mobile/src/state/providers.dart';

final event = <String, dynamic>{
  'id': 'event',
  'sourceIds': ['image'],
  'label': '鋼琴課',
  'startDate': '2026-09-04',
  'endDate': '2026-09-04',
  'startTime': '15:00',
  'endTime': '17:00',
  'sourceTimezone': 'Asia/Taipei',
  'allDay': false,
  'unresolved': []
};

class ImportApi implements ApiClient {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
  @override
  String get cacheScope => 'owner';
  final draft = <String, dynamic>{
    'id': 'import',
    'version': '1',
    'status': 'ready',
    'extraction': {
      'events': [event],
      'screenshotValidation': {'category': 'calendar', 'confidence': .98}
    }
  };
  @override
  Future<Map<String, dynamic>> request(String method, String path,
      {Map<String, dynamic>? body, Map<String, String>? query}) async {
    if (method == 'DELETE') return {'deleted': true};
    if (method == 'POST' && body?['action'] == 'apple_preview')
      return {
        'events': [event],
        'version': '1'
      };
    if (method == 'POST')
      throw const ApiException(503, 'OFFLINE', '儲存失敗，輸入已保留');
    return path.endsWith('/imports')
        ? {
            'imports': [draft]
          }
        : draft;
  }
}

class CalendarSpy extends DeviceCalendarService {
  int permissionCalls = 0;
  int writes = 0;
  bool granted = true;
  @override
  Future<List<String>> importedDraftIds(List<String> ids) async => [];
  @override
  Future<bool> requestAccess() async {
    permissionCalls++;
    return granted;
  }

  @override
  Future<List<Map<String, dynamic>>> calendars() async => [
        {'id': 'apple', 'title': '個人', 'isDefault': true}
      ];
  @override
  Future<String?> writeEvent(
      {required String title,
      required DateTime start,
      required DateTime end,
      required String calendarId,
      String? draftId,
      bool allDay = false,
      String timeZone = 'Asia/Taipei'}) async {
    expect(draftId, 'owner:import:event');
    expect(start.toUtc().hour, 7);
    expect(end.toUtc().hour, 9);
    writes++;
    return 'saved';
  }
}

Future<void> pumpUi(WidgetTester tester) async {
  for (var i = 0; i < 5; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> openDraft(WidgetTester tester, CalendarSpy calendar) async {
  await tester.pumpWidget(ProviderScope(overrides: [
    apiClientProvider.overrideWithValue(ImportApi()),
    deviceCalendarServiceProvider.overrideWithValue(calendar),
    accountIdProvider.overrideWithValue('owner')
  ], child: const MaterialApp(home: CalendarImportScreen())));
  await pumpUi(tester);
  await tester.tap(find.text('1 個辨識事件'));
  await pumpUi(tester);
}

void main() {
  setUpAll(zones.initializeTimeZones);
  testWidgets(
      'reading and cancelling a draft never asks calendar permission or writes',
      (tester) async {
    final calendar = CalendarSpy();
    await openDraft(tester, calendar);
    expect(calendar.permissionCalls, 0);
    expect(calendar.writes, 0);
    await tester.ensureVisible(find.text('確認加入 Apple Calendar'));
    await tester.tap(find.text('確認加入 Apple Calendar'));
    await pumpUi(tester);
    await tester.tap(find.text('返回修改'));
    await pumpUi(tester);
    expect(calendar.permissionCalls, 0);
    expect(calendar.writes, 0);
  });
  testWidgets(
      'write happens only after preview and explicit target confirmation',
      (tester) async {
    final calendar = CalendarSpy();
    await openDraft(tester, calendar);
    await tester.ensureVisible(find.text('確認加入 Apple Calendar'));
    await tester.tap(find.text('確認加入 Apple Calendar'));
    await pumpUi(tester);
    await tester.tap(find.text('繼續'));
    await pumpUi(tester);
    expect(calendar.permissionCalls, 1);
    expect(calendar.writes, 0);
    await tester.tap(find.text('確認加入「個人」（預設）'));
    await pumpUi(tester);
    expect(calendar.writes, 1);
    expect(find.text('已加入 Apple Calendar。'), findsOneWidget);
  });
  testWidgets('permission denial leaves the draft and performs no write',
      (tester) async {
    final calendar = CalendarSpy()..granted = false;
    await openDraft(tester, calendar);
    await tester.ensureVisible(find.text('確認加入 Apple Calendar'));
    await tester.tap(find.text('確認加入 Apple Calendar'));
    await pumpUi(tester);
    await tester.tap(find.text('繼續'));
    await pumpUi(tester);
    expect(calendar.writes, 0);
    expect(find.textContaining('未取得日曆權限'), findsOneWidget);
    expect(find.text('鋼琴課 · Draft'), findsOneWidget);
  });
  testWidgets('failed manual save retains edited input in its form',
      (tester) async {
    final calendar = CalendarSpy();
    await openDraft(tester, calendar);
    await tester.tap(find.text('編輯／確認'));
    await pumpUi(tester);
    await tester.enterText(find.byType(TextField).first, '小提琴課');
    await tester.tap(find.text('儲存草稿'));
    await pumpUi(tester);
    expect(find.text('小提琴課'), findsOneWidget);
    expect(find.text('儲存失敗，輸入已保留'), findsOneWidget);
    expect(calendar.writes, 0);
  });
}
