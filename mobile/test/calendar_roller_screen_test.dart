import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:yuema_mobile/src/screens/calendar_screen.dart';

void main() {
  testWidgets(
      'empty calendar has no seeded events and tapping a slot keeps keyboard hidden',
      (tester) async {
    await initializeDateFormatting('zh_TW');
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(const ProviderScope(
        child: MaterialApp(
            locale: Locale('zh', 'TW'),
            supportedLocales: [Locale('zh', 'TW')],
            localizationsDelegates: [
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate
            ],
            home: CalendarScreen(preview: true))));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('團隊同步'), findsNothing);
    expect(find.text('HW1'), findsNothing);
    final day = DateFormat('yyyy-MM-dd').format(DateTime.now());
    await tester.tap(find.byKey(ValueKey('calendar-slot-$day-9')));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextField, '事件名稱'), findsOneWidget);
    expect(tester.testTextInput.isVisible, isFalse);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
}
