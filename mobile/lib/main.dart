import 'package:app_links/app_links.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:timezone/data/latest.dart' as timezone_data;
import 'package:timezone/timezone.dart' as timezone;

import 'src/screens/calendar_screen.dart';
import 'src/screens/calendar_import_screen.dart';
import 'src/screens/coordination_screen.dart';
import 'src/screens/login_screen.dart';
import 'src/screens/settings_screen.dart';
import 'src/screens/productivity_screen.dart';
import 'src/state/providers.dart';
import 'src/widgets/widget_sync_host.dart';

String? _pendingInviteToken;
Uri? _pendingWidgetUri;
GoRouter? _activeRouter;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final links = AppLinks();
  links.uriLinkStream.listen((uri) {
    if (uri.scheme == 'com.yuema.mobile' && uri.host == 'widget') {
      _pendingWidgetUri = uri;
      _activeRouter?.go('/widget?${uri.query}');
      return;
    }
    final token = _inviteToken(uri);
    if (token != null) _pendingInviteToken = token;
  });
  try {
    final initial = await links.getInitialLink();
    if (initial != null) {
      _pendingInviteToken = _inviteToken(initial);
      if (initial.scheme == 'com.yuema.mobile' && initial.host == 'widget')
        _pendingWidgetUri = initial;
    }
  } catch (_) {
    // A launch without a deep link is the normal path.
  }
  timezone_data.initializeTimeZones();
  await initializeDateFormatting('zh_TW');
  await _configureDeviceTimezone();

  const previewMode = bool.fromEnvironment('PREVIEW_MODE', defaultValue: false);
  if (previewMode) {
    runApp(const ProviderScope(child: YuemaApp(preview: true)));
    return;
  }

  const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  const supabaseKey = String.fromEnvironment('SUPABASE_ANON_KEY');
  if (supabaseUrl.isEmpty || supabaseKey.isEmpty) {
    runApp(const _ConfigurationApp());
    return;
  }

  await Supabase.initialize(url: supabaseUrl, publishableKey: supabaseKey);
  try {
    await Firebase.initializeApp();
  } catch (_) {
    // Push remains optional until the deployed target includes Firebase config.
  }
  final preferences = await SharedPreferences.getInstance();
  runApp(ProviderScope(
      overrides: [preferencesProvider.overrideWithValue(preferences)],
      child: const YuemaApp()));
}

Future<void> _configureDeviceTimezone() async {
  try {
    final info = await FlutterTimezone.getLocalTimezone();
    timezone.setLocalLocation(timezone.getLocation(info));
  } catch (_) {
    timezone.setLocalLocation(timezone.getLocation('UTC'));
  }
}

class YuemaApp extends StatelessWidget {
  const YuemaApp({super.key, this.preview = false});

  final bool preview;

  @override
  Widget build(BuildContext context) {
    final app = MaterialApp.router(
      title: '約嗎',
      debugShowCheckedModeBanner: false,
      locale: const Locale('zh', 'TW'),
      supportedLocales: const [Locale('zh', 'TW'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: Colors.transparent,
        colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFFA8E6B7), brightness: Brightness.dark),
        iconTheme: IconThemeData(
            color: Colors.white.withValues(alpha: 0.86), size: 21),
        textTheme: ThemeData.dark()
            .textTheme
            .apply(bodyColor: Colors.white, displayColor: Colors.white),
        useMaterial3: true,
      ),
      routerConfig: _activeRouter ??= GoRouter(
          initialLocation: _pendingWidgetUri == null
              ? '/'
              : '/widget?${_pendingWidgetUri!.query}',
          overridePlatformDefaultLocation: true,
          routes: [
            GoRoute(
                path: '/widget',
                builder: (_, state) => WidgetActionScreen(uri: state.uri)),
            GoRoute(
                path: '/',
                builder: (_, state) => _AuthGate(
                    preview: preview,
                    month: state.uri.queryParameters['view'] == 'month')),
            GoRoute(
                path: '/calendar-import',
                builder: (_, __) => const CalendarImportScreen()),
            GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
            GoRoute(
                path: '/coordinate',
                builder: (_, __) => const CoordinationScreen()),
            GoRoute(
                path: '/coordinate/:id',
                builder: (_, state) =>
                    GatheringDetailScreen(id: state.pathParameters['id']!)),
            GoRoute(
                path: '/join/:token',
                builder: (_, state) =>
                    JoinScreen(token: state.pathParameters['token']!)),
            GoRoute(
                path: '/settings', builder: (_, __) => const SettingsScreen()),
            GoRoute(
                path: '/productivity',
                builder: (_, state) => ProductivityScreen(
                    initialTab:
                        int.tryParse(state.uri.queryParameters['tab'] ?? '0') ??
                            0)),
          ]),
    );
    return preview ? app : WidgetSyncHost(child: app);
  }
}

class _AuthGate extends ConsumerWidget {
  const _AuthGate({this.preview = false, this.month = false});

  final bool month;

  final bool preview;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (preview) return const CalendarScreen(preview: true);
    final current = ref.watch(supabaseProvider).auth.currentSession;
    final auth = ref.watch(authStateProvider);
    if (current != null || auth.value?.session != null) {
      final invite = _pendingInviteToken;
      if (invite != null) {
        _pendingInviteToken = null;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (context.mounted) context.push('/join/$invite');
        });
      }
      return CalendarScreen(
          key: ValueKey('${current?.user.id}:$month'),
          initialView: month ? CalendarView.month : CalendarView.week);
    }
    if (auth.isLoading) return const _LoadingScreen();
    return const LoginScreen();
  }
}

String? _inviteToken(Uri uri) {
  if (uri.scheme != 'com.yuema.mobile') return null;
  final segments = <String>[...uri.pathSegments];
  if (uri.host.isNotEmpty) segments.insert(0, uri.host);
  if (segments.length < 2 || segments.first != 'join') return null;
  final token = segments[1].trim();
  return token.isEmpty ? null : token;
}

class _LoadingScreen extends StatelessWidget {
  const _LoadingScreen();
  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: CircularProgressIndicator.adaptive()));
}

class _ConfigurationApp extends StatelessWidget {
  const _ConfigurationApp();
  @override
  Widget build(BuildContext context) => MaterialApp(
      theme: ThemeData.dark(useMaterial3: true),
      home: const Scaffold(
          body: Center(
              child: Padding(
                  padding: EdgeInsets.all(28),
                  child: Text(
                      '請以 SUPABASE_URL、SUPABASE_ANON_KEY 和 API_BASE_URL 啟動 App')))));
}
