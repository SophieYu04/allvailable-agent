import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yuema_mobile/src/services/api_client.dart';
import 'package:yuema_mobile/src/widgets/async_save_form.dart';

class TestForm extends StatefulWidget {
  const TestForm({super.key, required this.onSave, this.onReload});
  final Future<void> Function(String) onSave;
  final Future<void> Function()? onReload;
  @override
  State<TestForm> createState() => _TestFormState();
}

class _TestFormState extends State<TestForm>
    with AsyncSaveForm<TestForm, String> {
  final controller = TextEditingController();
  @override
  Future<void> Function(String) get save => widget.onSave;
  @override
  Future<void> Function()? get reload => widget.onReload;
  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Material(
          child: SingleChildScrollView(
        child: guardSaveForm(Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: controller),
          FilledButton(
              onPressed: () => submitForm(controller.text),
              child: const Text('儲存')),
        ])),
      ));
}

Future<void> openForm(WidgetTester tester, Future<void> Function(String) save,
    {Future<void> Function()? reload}) async {
  await tester.pumpWidget(MaterialApp(
      home: Scaffold(
          body: Builder(
              builder: (context) => TextButton(
                  onPressed: () => showModalBottomSheet<String>(
                      context: context,
                      isDismissible: false,
                      enableDrag: false,
                      builder: (_) => TestForm(onSave: save, onReload: reload)),
                  child: const Text('新增'))))));
  await tester.tap(find.text('新增'));
  await tester.pumpAndSettle();
  await tester.enterText(find.byType(TextField), '保留這個輸入');
}

void main() {
  testWidgets(
      'only dismisses after success and blocks repeated taps while saving',
      (tester) async {
    final gate = Completer<void>();
    var calls = 0;
    await openForm(tester, (_) {
      calls++;
      return gate.future;
    });
    await tester.tap(find.text('儲存'));
    await tester.pump();
    expect(find.text('儲存中…'), findsOneWidget);
    expect(find.byType(TestForm), findsOneWidget);
    await tester.tap(find.text('儲存'), warnIfMissed: false);
    await tester.pump();
    expect(calls, 1);
    gate.complete();
    await tester.pumpAndSettle();
    expect(find.byType(TestForm), findsNothing);
  });

  testWidgets('failure leaves form and input available for retry',
      (tester) async {
    var fail = true;
    await openForm(tester, (value) async {
      expect(value, '保留這個輸入');
      if (fail) throw Exception('save failed');
    });
    await tester.tap(find.text('儲存'));
    await tester.pumpAndSettle();
    expect(find.text('無法儲存，內容已保留，請重試'), findsOneWidget);
    expect(find.text('保留這個輸入'), findsOneWidget);
    fail = false;
    await tester.tap(find.text('儲存'));
    await tester.pumpAndSettle();
    expect(find.byType(TestForm), findsNothing);
  });

  testWidgets(
      '409 requires explicit reload before resubmission, preserving text',
      (tester) async {
    var calls = 0;
    var reloaded = false;
    await openForm(tester, (_) async {
      calls++;
      if (!reloaded)
        throw const ApiException(409, 'VERSION_CONFLICT', 'conflict');
    }, reload: () async {
      reloaded = true;
    });
    await tester.tap(find.text('儲存'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('儲存'));
    expect(calls, 1);
    await tester.tap(find.text('重新載入最新版本'));
    await tester.pumpAndSettle();
    expect(find.text('保留這個輸入'), findsOneWidget);
    await tester.tap(find.text('儲存'));
    await tester.pumpAndSettle();
    expect(calls, 2);
    expect(find.byType(TestForm), findsNothing);
  });

  testWidgets('401 displays sign-in guidance without dropping input',
      (tester) async {
    await openForm(tester, (_) async {
      throw const ApiException(401, 'UNAUTHENTICATED', '登入');
    });
    await tester.tap(find.text('儲存'));
    await tester.pumpAndSettle();
    expect(find.text('登入已失效，內容仍保留；請重新登入後再試'), findsOneWidget);
    expect(find.text('保留這個輸入'), findsOneWidget);
  });
}
