import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yuema_mobile/src/widgets/day_roller.dart';

void main() {
  testWidgets(
      'rolls individual days, snaps to whole columns and emits selection haptics',
      (tester) async {
    final haptics = <MethodCall>[];
    tester.binding.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
      haptics.add(call);
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, null));
    var date = DateTime(2026, 12, 30);
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: StatefulBuilder(
                builder: (context, update) => SizedBox(
                    width: 500,
                    height: 400,
                    child: DayRoller(
                        date: date,
                        onChanged: (next) => update(() => date = next),
                        builder: (days) => Row(
                            children: days
                                .map((day) => Expanded(
                                    child: Text('${day.month}/${day.day}')))
                                .toList())))))));
    await tester.drag(
        find.byKey(const ValueKey('day-roller')), const Offset(-100, 0));
    await tester.pumpAndSettle();
    expect(date, DateTime(2026, 12, 31));
    expect(
        haptics.where((c) => c.method == 'HapticFeedback.vibrate'), isNotEmpty);
    final scroll = tester.state<ScrollableState>(find.byType(Scrollable));
    expect(scroll.position.pixels % 100, closeTo(0, .01));
    await tester.drag(
        find.byKey(const ValueKey('day-roller')), const Offset(-100, 0));
    await tester.pumpAndSettle();
    expect(date, DateTime(2027, 1, 1));
    expect(scroll.position.pixels % 100, closeTo(0, .01));
  });
  test('released partial date springs to the nearest complete date', () {
    const physics = DaySnapPhysics(dayExtent: 70, origin: 48);
    final simulation = physics.createBallisticSimulation(
        FixedScrollMetrics(
            minScrollExtent: 0,
            maxScrollExtent: 2000,
            pixels: 48 + 70 * 3.75,
            viewportDimension: 350,
            axisDirection: AxisDirection.right,
            devicePixelRatio: 1),
        0)!;
    expect(simulation.x(10), closeTo(48 + 70 * 4, .01));
  });
}
