import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yuema_mobile/src/models/deadline.dart';
import 'package:yuema_mobile/src/widgets/deadline_overview.dart';

Deadline item(String id, DateTime due, {bool completed = false}) =>
    Deadline(id: id, title: id, dueOn: due, completed: completed, version: '1');

void main() {
  testWidgets('small display and large text retain all-deadline access',
      (tester) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final today = taipeiDate(DateTime.now());
    await tester.pumpWidget(ProviderScope(
        child: MaterialApp(
            builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context)
                    .copyWith(textScaler: const TextScaler.linear(2)),
                child: child!),
            home: Scaffold(
                body: DeadlineOverview(onOpen: (_) async {}, previewItems: [
              for (var i = 0; i < 5; i++) item('Deadline $i', today),
              item('completed', today, completed: true)
            ])))));
    await tester.pump();
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('查看全部'));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView), const Offset(0, -600));
    await tester.pumpAndSettle();
    expect(find.text('completed'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  test('Taipei date changes at 16:00 UTC, including year boundary', () {
    expect(taipeiDate(DateTime.parse('2026-12-31T15:59:59Z')),
        DateTime(2026, 12, 31));
    expect(taipeiDate(DateTime.parse('2026-12-31T16:00:00Z')),
        DateTime(2027, 1, 1));
  });
  test('upcoming includes today through day six, excludes completed and past',
      () {
    final today = DateTime(2026, 12, 30);
    final result = upcomingDeadlines([
      item('day7', DateTime(2027, 1, 6)),
      item('day6', DateTime(2027, 1, 5)),
      item('past', DateTime(2026, 12, 29)),
      item('today', today),
      item('done', today, completed: true),
    ], today);
    expect(result.map((e) => e.id), ['today', 'day6']);
    expect(deadlineCaption(result.first, today), '今天');
    expect(deadlineCaption(result.last, today), '剩 6 天');
    expect(deadlineCaption(item('past', DateTime(2026, 12, 29)), today),
        '2026/12/29');
  });
}
