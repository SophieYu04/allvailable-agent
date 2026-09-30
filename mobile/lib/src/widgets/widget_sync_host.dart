import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../services/api_client.dart';
import '../services/widget_service.dart';
import '../state/providers.dart';

final widgetServiceProvider = Provider<WidgetService>((ref) =>
    WidgetService(ref.read(apiClientProvider), ref.read(preferencesProvider)));

class WidgetSyncHost extends ConsumerStatefulWidget {
  const WidgetSyncHost({required this.child, super.key});
  final Widget child;
  @override
  ConsumerState<WidgetSyncHost> createState() => _WidgetSyncHostState();
}

class _WidgetSyncHostState extends ConsumerState<WidgetSyncHost>
    with WidgetsBindingObserver {
  StreamSubscription<void>? _api, _local;
  Timer? _debounce;
  Timer? _periodic;
  void schedule() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 700), () async {
      try {
        await ref.read(widgetServiceProvider).refresh();
      } catch (_) {/* Widgets are optional. */}
    });
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _api = ApiClient.mutations.stream.listen((_) => schedule());
    _local = WidgetService.changes.stream.listen((_) => schedule());
    ref.listenManual(accountIdProvider, (_, __) async {
      try {
        await ref.read(widgetServiceProvider).accountChanged();
      } catch (_) {/* Missing App Group on unsigned builds. */}
    }, fireImmediately: true);
    _periodic = Timer.periodic(const Duration(minutes: 5), (_) => schedule());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) schedule();
  }

  @override
  void dispose() {
    _api?.cancel();
    _local?.cancel();
    _debounce?.cancel();
    _periodic?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

class WidgetActionScreen extends ConsumerStatefulWidget {
  const WidgetActionScreen({required this.uri, super.key});
  final Uri uri;
  @override
  ConsumerState<WidgetActionScreen> createState() => _WidgetActionScreenState();
}

class _WidgetActionScreenState extends ConsumerState<WidgetActionScreen> {
  String? error;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => run());
  }

  Future<void> run() async {
    final action = widget.uri.queryParameters['action'] ?? 'open';
    if (ref.read(accountIdProvider) == null) {
      if (mounted) context.go('/login');
      return;
    }
    try {
      if (['checkin', 'start', 'pause', 'resume'].contains(action)) {
        await ref.read(widgetServiceProvider).perform(widget.uri);
        ref.invalidate(goalsProvider);
        ref.invalidate(focusBundleProvider);
        ref.invalidate(focusGroupsProvider);
        ref.invalidate(calendarItemsProvider);
      }
      if (!mounted) return;
      if (['goals', 'checkin'].contains(action)) {
        context.go('/productivity?tab=0');
      } else if (['focus', 'start', 'pause', 'resume'].contains(action)) {
        context.go('/productivity?tab=1');
      } else if (action == 'groups') {
        context.go('/productivity?tab=2');
      } else {
        context.go(action == 'month' ? '/?view=month' : '/');
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
          body: SafeArea(
              child: Center(
        child: error == null
            ? const CircularProgressIndicator.adaptive()
            : Padding(
                padding: const EdgeInsets.all(24),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Text(error!),
                  const SizedBox(height: 16),
                  TextButton(
                      onPressed: () => context.go('/productivity'),
                      child: const Text('開啟 App')),
                ])),
      )));
}
