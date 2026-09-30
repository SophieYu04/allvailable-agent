import '../widgets/google_connection_sheet.dart';
import '../widgets/day_roller.dart';
import 'dart:math' as math;
import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../models/calendar_event.dart';
import '../models/deadline.dart';
import '../models/productivity.dart';
import '../repositories/calendar_repository.dart';
import '../services/api_client.dart';
import '../state/providers.dart';
import '../widgets/glass.dart';
import '../widgets/async_save_form.dart';
import '../widgets/deadline_overview.dart';

enum CalendarView { week, month, year }

class CalendarScreen extends ConsumerStatefulWidget {
  const CalendarScreen(
      {super.key, this.preview = false, this.initialView = CalendarView.week});

  final CalendarView initialView;

  final bool preview;

  @override
  ConsumerState<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends ConsumerState<CalendarScreen>
    with WidgetsBindingObserver {
  DateTime _anchor = _day(DateTime.now());
  DateTime _pageOrigin = _day(DateTime.now());
  late CalendarView _view = widget.initialView;
  late List<CalendarEvent> _previewItems;
  late List<Deadline> _previewDeadlines;
  final ScrollController _timeRail =
      ScrollController(initialScrollOffset: 8 * 52.0);
  late final ScrollController _weekScroll =
      ScrollController(initialScrollOffset: 8 * 52.0);
  StreamSubscription<Uri>? _deepLinks;
  Timer? _googleSyncTimer;
  final Map<String, DateTime> _googleSyncedRanges = {};
  bool _deadlineBarsExpanded = false;
  int _sharedScreenshotCount = 0;
  CalendarItems? _lastCalendarItems;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final links = AppLinks();
    _deepLinks = links.uriLinkStream.listen(_handleDeepLink);
    Future<void>.microtask(() async {
      try {
        final initial = await links.getInitialLink();
        if (initial != null) _handleDeepLink(initial);
      } catch (_) {
        // An initial link is optional on normal launches.
      }
    });
    if (widget.preview) {
      _previewItems = [];
      _previewDeadlines = [];
      return;
    }
    Future<void>.microtask(() async {
      await _checkSharedScreenshots();
      await _retryDrafts();
      if (!mounted) return;
      try {
        await ref.read(notificationServiceProvider).register(
            platform:
                defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android',
            appVersion: '0.1.0',
            timeZone: DateTime.now().timeZoneName);
      } catch (_) {
        // Push setup is optional; in-app notifications remain available.
      }
    });
    _googleSyncTimer = Timer.periodic(const Duration(minutes: 1), (_) {
      if (WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
        unawaited(_retryDrafts());
        unawaited(_syncGoogleIfDue());
      }
    });
  }

  Future<void> _checkSharedScreenshots() async {
    if (widget.preview || defaultTargetPlatform != TargetPlatform.iOS) return;
    try {
      final images = await const MethodChannel('com.yuema.mobile/screenshot')
              .invokeListMethod<String>('sharedImages') ??
          [];
      if (mounted) setState(() => _sharedScreenshotCount = images.length);
    } catch (_) {/* Sharing is optional on older app binaries. */}
  }

  Future<void> _retryDrafts() async {
    if (widget.preview || !mounted) return;
    final repository = ref.read(calendarRepositoryProvider);
    try {
      await repository.syncDrafts();
      if (!mounted) return;
      await ref.read(coordinationRepositoryProvider).syncPendingDrafts();
    } on ApiException catch (error) {
      if (mounted && error.status == 401) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('登入已失效，請重新登入；待同步內容已保留')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('同步尚未完成，待同步內容已保留')));
      }
    } finally {
      if (mounted) {
        ref.invalidate(calendarItemsProvider(_rangeForView()));
        ref.invalidate(deadlineOverviewProvider);
      }
    }
  }

  Future<void> _refresh() async {
    if (widget.preview) return;
    await _retryDrafts();
    if (!mounted) return;
    await _syncGoogle(force: true);
    if (mounted) {
      ref.invalidate(sourcesProvider);
      ref.invalidate(calendarItemsProvider(_rangeForView()));
      ref.invalidate(deadlineOverviewProvider);
    }
  }

  void _handleDeepLink(Uri uri) {
    if (uri.scheme != 'com.yuema.mobile' || widget.preview) return;
    final segments = <String>[...uri.pathSegments];
    if (uri.host.isNotEmpty) segments.insert(0, uri.host);
    if (segments.length >= 2 && segments.first == 'join') {
      final token = segments[1];
      if (token.isNotEmpty && mounted) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) context.push('/join/$token');
        });
      }
      return;
    }
    _syncGoogle(force: true);
  }

  Future<void> _syncGoogleIfDue() => _syncGoogle();

  Future<void> _syncGoogle({bool force = false}) async {
    if (widget.preview) return;
    final rangeKey =
        '${ref.read(apiClientProvider).cacheScope}:${_anchor.toIso8601String()}';
    final last = _googleSyncedRanges[rangeKey];
    if (!force &&
        last != null &&
        DateTime.now().difference(last) < const Duration(minutes: 5)) return;
    try {
      final service = ref.read(calendarConnectionServiceProvider);
      if (await service.googleConnection() == null) return;
      await service.syncGoogle(
          start: _anchor.subtract(const Duration(days: 7)),
          end: _anchor.add(const Duration(days: 42)));
      _googleSyncedRanges[rangeKey] = DateTime.now();
      if (mounted) {
        ref.invalidate(sourcesProvider);
        ref.invalidate(calendarItemsProvider(_rangeForView()));
        ref.invalidate(deadlineOverviewProvider);
      }
    } catch (_) {
      // Keep the previous cache when a background sync fails.
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timeRail.dispose();
    _weekScroll.dispose();
    _deepLinks?.cancel();
    _googleSyncTimer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed || widget.preview) return;
    unawaited(_retryDrafts());
    unawaited(_syncGoogleIfDue());
    unawaited(_checkSharedScreenshots());
  }

  @override
  Widget build(BuildContext context) {
    final range = _rangeForView();
    final AsyncValue<CalendarItems> loaded = widget.preview
        ? AsyncData(
            CalendarItems(events: _previewItems, deadlines: _previewDeadlines))
        : ref.watch(calendarItemsProvider(range));
    if (loaded.asData != null) _lastCalendarItems = loaded.asData!.value;
    final items = loaded.isLoading && _lastCalendarItems != null
        ? AsyncData<CalendarItems>(_lastCalendarItems!)
        : loaded;
    final goals = widget.preview
        ? const <Goal>[]
        : ref.watch(goalsProvider(range)).valueOrNull ?? const <Goal>[];
    final focus = widget.preview
        ? const FocusBundle(subjects: [], sessions: [])
        : ref.watch(focusBundleProvider(range)).valueOrNull ??
            const FocusBundle(subjects: [], sessions: []);
    return Scaffold(
      body: Stack(
        children: [
          const Positioned.fill(child: CalendarBackdrop()),
          SafeArea(
            child: Column(children: [
              _buildHeader(context),
              if (_sharedScreenshotCount > 0)
                TextButton.icon(
                    onPressed: () async {
                      await context.push('/calendar-import');
                      await _checkSharedScreenshots();
                    },
                    icon: const Icon(Icons.photo_library_outlined),
                    label: Text('有 $_sharedScreenshotCount 張分享截圖，繼續匯入')),
              DeadlineOverview(
                previewItems: widget.preview ? _previewDeadlines : null,
                onOpen: (deadline) =>
                    _openDeadline(deadline.dueOn, deadline: deadline),
              ),
              SizedBox(
                  height: 2,
                  child: loaded.isLoading
                      ? const LinearProgressIndicator()
                      : null),
              Expanded(
                  child: items.when(
                loading: () =>
                    const Center(child: CircularProgressIndicator.adaptive()),
                error: (error, _) => _ErrorState(
                    message: error is ApiException && error.status == 401
                        ? '登入已失效，請重新登入'
                        : null,
                    onLogin: error is ApiException && error.status == 401
                        ? () => context.go('/login')
                        : null,
                    onRetry: () =>
                        ref.invalidate(calendarItemsProvider(_rangeForView()))),
                data: (items) => Column(children: [
                  if (!widget.preview &&
                      (items.fromCache ||
                          items.syncFailed ||
                          items.pendingSyncCount > 0))
                    _SyncBanner(items: items),
                  Expanded(
                    child: switch (_view) {
                      CalendarView.week => Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 10),
                          child: GlassPanel(
                            padding: EdgeInsets.zero,
                            borderRadius: 26,
                            child: _buildWeek(
                                [...items.events, ..._focusEvents(focus)],
                                items.deadlines),
                          ),
                        ),
                      CalendarView.month => _buildMonth(
                          [...items.events, ..._focusEvents(focus)],
                          items.deadlines,
                          goals),
                      CalendarView.year =>
                        _buildYear([...items.events, ..._focusEvents(focus)]),
                    },
                  ),
                ]),
              )),
            ]),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 0,
        destinations: const [
          NavigationDestination(
              icon: Icon(Icons.calendar_month_rounded), label: '日曆'),
          NavigationDestination(
              icon: Icon(Icons.track_changes_rounded), label: '成長'),
          NavigationDestination(
              icon: Icon(Icons.people_alt_rounded), label: '邀約'),
          NavigationDestination(
              icon: Icon(Icons.settings_rounded), label: '設定'),
        ],
        onDestinationSelected: (index) {
          if (widget.preview && index != 0) {
            _showPreviewMessage('請設定測試後端並登入以使用邀約與帳號設定');
            return;
          }
          if (index == 1) context.push('/productivity');
          if (index == 2) context.push('/coordinate');
          if (index == 3) context.push('/settings');
        },
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    final contextLabel = DateFormat('yyyy 年 M 月', 'zh_TW').format(_anchor);
    final title = switch (_view) {
      CalendarView.week => _weekLabel(),
      CalendarView.month => DateFormat('MMMM', 'zh_TW').format(_anchor),
      CalendarView.year => '${_anchor.year}',
    };
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
      child: Column(
        children: [
          Row(
            children: [
              _glassIconButton(
                label: _view == CalendarView.week ? '切換月計劃' : '返回週計劃',
                icon: _view == CalendarView.week
                    ? Icons.calendar_month_rounded
                    : Icons.view_week_rounded,
                onPressed: () => setState(() => _view =
                    _view == CalendarView.week
                        ? CalendarView.month
                        : CalendarView.week),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      contextLabel,
                      maxLines: 1,
                      style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.54),
                          fontSize: 11,
                          fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.fade,
                      softWrap: false,
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 22,
                          fontWeight: FontWeight.w700,
                          letterSpacing: -0.5),
                    ),
                  ],
                ),
              ),
              if (_view != CalendarView.week) ...[
                _glassIconButton(
                  label: _view == CalendarView.month ? '切換年曆' : '切換月計劃',
                  icon: _view == CalendarView.month
                      ? Icons.grid_view_rounded
                      : Icons.calendar_month_rounded,
                  onPressed: () => setState(() => _view =
                      _view == CalendarView.month
                          ? CalendarView.year
                          : CalendarView.month),
                ),
                const SizedBox(width: 8),
              ],
              _glassIconButton(
                label: '重新整理',
                icon: Icons.refresh_rounded,
                onPressed: _refresh,
              ),
              const SizedBox(width: 8),
              FilledButton.icon(
                onPressed: () => _chooseCreate(_anchor),
                icon: const Icon(Icons.add_rounded, size: 18),
                label: const Text('新增'),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Container(
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.07),
                  borderRadius: BorderRadius.circular(14),
                  border:
                      Border.all(color: Colors.white.withValues(alpha: 0.1)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _plainIconButton(
                        label: '上一頁',
                        icon: Icons.chevron_left_rounded,
                        onPressed: () => _move(-1)),
                    TextButton(onPressed: _goToToday, child: const Text('今天')),
                    _plainIconButton(
                        label: '下一頁',
                        icon: Icons.chevron_right_rounded,
                        onPressed: () => _move(1)),
                  ],
                ),
              ),
              const Spacer(),
              _glassIconButton(
                  label: '匯入 TimeTree 截圖',
                  icon: Icons.add_photo_alternate_outlined,
                  onPressed: widget.preview
                      ? () => _showPreviewMessage('登入後即可匯入截圖')
                      : () => context.push('/calendar-import')),
              const SizedBox(width: 8),
              _glassIconButton(
                  label: '管理共享日曆',
                  icon: Icons.calendar_view_month_rounded,
                  onPressed: _showSharedCalendars),
              const SizedBox(width: 8),
              _glassIconButton(
                  label: '連接 Google 日曆',
                  icon: Icons.link_rounded,
                  onPressed: _showConnections),
              const SizedBox(width: 8),
              _glassIconButton(
                  label: '協調時間',
                  icon: Icons.auto_awesome_rounded,
                  onPressed: widget.preview
                      ? () => _showPreviewMessage('登入後即可用 AI 協調時間')
                      : () => context.push('/coordinate')),
            ],
          ),
        ],
      ),
    );
  }

  Widget _glassIconButton(
      {required String label,
      required IconData icon,
      required VoidCallback onPressed,
      bool emphasized = false}) {
    return Semantics(
      button: true,
      label: label,
      child: Material(
          color: emphasized
              ? const Color(0xFFA8E6B7).withValues(alpha: 0.24)
              : Colors.white.withValues(alpha: 0.07),
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
              onTap: onPressed,
              borderRadius: BorderRadius.circular(14),
              child: SizedBox(
                  width: 42,
                  height: 42,
                  child: Tooltip(
                      message: label,
                      child: Icon(icon,
                          color: emphasized
                              ? const Color(0xFFD6F8DE)
                              : Colors.white.withValues(alpha: 0.82)))))),
    );
  }

  Widget _plainIconButton(
      {required String label,
      required IconData icon,
      required VoidCallback onPressed}) {
    return Semantics(
        button: true,
        label: label,
        child: Material(
            color: Colors.transparent,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
                onTap: onPressed,
                borderRadius: BorderRadius.circular(12),
                child: SizedBox(
                    width: 40,
                    height: 38,
                    child: Tooltip(
                        message: label, child: Icon(icon, size: 19))))));
  }

  void _goToToday() {
    setState(() {
      _pageOrigin = _day(DateTime.now());
      _anchor = _pageOrigin;
    });
  }

  List<CalendarEvent> _focusEvents(FocusBundle bundle) {
    final events = <CalendarEvent>[];
    for (final session in bundle.sessions) {
      final subject = bundle.subject(session.subjectId);
      for (final segment in session.segments) {
        final end = segment.end ?? DateTime.now();
        if (!end.isAfter(segment.start)) continue;
        events.add(CalendarEvent(
          id: 'focus-${segment.id}',
          sourceId: 'focus',
          title:
              '${subject?.name ?? '專注'} · ${end.difference(segment.start).inMinutes} 分',
          color: _eventColor(subject?.color ?? 'blue'),
          allDay: false,
          startAt: segment.start.toUtc(),
          endAt: end.toUtc(),
          timeZone: DateTime.now().timeZoneName,
          version: session.version,
          isFocus: true,
          isManualFocus: session.source == 'manual',
        ));
      }
    }
    if (!widget.preview) {
      final local = ref.read(productivityRepositoryProvider).activeLocalTimer();
      if (local != null) {
        for (final raw
            in (local['segments'] as List? ?? const []).whereType<Map>()) {
          final segment = Map<String, dynamic>.from(raw);
          final start = DateTime.tryParse(segment['start']?.toString() ?? '');
          final end = DateTime.tryParse(segment['end']?.toString() ?? '') ??
              DateTime.now();
          if (start == null || !end.isAfter(start)) continue;
          events.add(CalendarEvent(
              id: 'local-focus-${start.microsecondsSinceEpoch}',
              sourceId: 'focus',
              title:
                  '${local['subjectName']} · ${end.difference(start).inMinutes} 分',
              color: _eventColor(local['color']?.toString() ?? 'blue'),
              allDay: false,
              startAt: start.toUtc(),
              endAt: end.toUtc(),
              timeZone: DateTime.now().timeZoneName,
              version: 'local',
              isFocus: true));
        }
      }
    }
    return events;
  }

  Widget _buildWeek(List<CalendarEvent> events, List<Deadline> deadlines) {
    final pinned = deadlines.where((item) => item.pinned).length;
    final deadlineHeight = pinned == 0
        ? 28.0
        : 25 + (_deadlineBarsExpanded ? pinned : math.min(pinned, 3)) * 38.0;
    return Row(children: [
      SizedBox(
          width: 48,
          child: Column(children: [
            SizedBox(height: 64 + 1 + deadlineHeight + 1 + 36),
            Expanded(
                child: IgnorePointer(
                    child: SingleChildScrollView(
                        controller: _timeRail,
                        child: Column(
                            children: List.generate(
                                24,
                                (hour) => SizedBox(
                                    height: 52,
                                    child: Align(
                                        alignment: Alignment.topCenter,
                                        child: Text(
                                            '${hour.toString().padLeft(2, '0')}:00',
                                            style: TextStyle(
                                                fontSize: 9,
                                                color: Colors.white.withValues(
                                                    alpha: .4)))))))))),
          ])),
      Expanded(
          child: DayRoller(
              leadingWidth: 48,
              date: _anchor,
              onChanged: (day) => setState(() => _anchor = day),
              builder: (days) => NotificationListener<ScrollNotification>(
                  onNotification: (notification) {
                    if (notification.metrics.axis == Axis.vertical &&
                        notification.depth == 0 &&
                        _timeRail.hasClients)
                      _timeRail.jumpTo(notification.metrics.pixels
                          .clamp(0.0, _timeRail.position.maxScrollExtent));
                    return false;
                  },
                  child: _weekPage(days, events, deadlines)))),
    ]);
  }

  Widget _weekPage(List<DateTime> days, List<CalendarEvent> events,
      List<Deadline> deadlines) {
    return LayoutBuilder(builder: (context, constraints) {
      const hourHeight = 52.0;
      const timeRailWidth = 48.0;
      final gridHeight = hourHeight * 24;
      return Column(children: [
        SizedBox(
            height: 64,
            child: Row(children: [
              const SizedBox(width: timeRailWidth),
              ...days.map((day) => Expanded(
                  child: Semantics(
                      button: true,
                      label: '新增 ${DateFormat('yyyy-MM-dd').format(day)} 事件',
                      child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: () => _openCreate(day),
                          child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(DateFormat('E', 'zh_TW').format(day),
                                    style: TextStyle(
                                        color:
                                            Colors.white.withValues(alpha: 0.5),
                                        fontSize: 10,
                                        fontWeight: FontWeight.w600)),
                                const SizedBox(height: 3),
                                Container(
                                  width: 28,
                                  height: 28,
                                  alignment: Alignment.center,
                                  decoration: BoxDecoration(
                                    color: _isToday(day)
                                        ? const Color(0xFFA8E6B7)
                                            .withValues(alpha: 0.22)
                                        : Colors.transparent,
                                    borderRadius: BorderRadius.circular(10),
                                    border: _isToday(day)
                                        ? Border.all(
                                            color: const Color(0xFFA8E6B7)
                                                .withValues(alpha: 0.5))
                                        : null,
                                  ),
                                  child: Text(
                                    DateFormat('d').format(day),
                                    style: TextStyle(
                                      color: _isToday(day)
                                          ? const Color(0xFFD5F9DD)
                                          : Colors.white.withValues(alpha: 0.9),
                                      fontSize: 15,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Container(
                                    width: 3,
                                    height: 3,
                                    decoration: BoxDecoration(
                                        color:
                                            Colors.white.withValues(alpha: .35),
                                        shape: BoxShape.circle)),
                              ]))))),
            ])),
        Divider(
            height: 1,
            thickness: 1,
            color: Colors.white.withValues(alpha: 0.08)),
        _buildDeadlineArea(days, deadlines, timeRailWidth),
        Divider(
            height: 1,
            thickness: 1,
            color: Colors.white.withValues(alpha: 0.08)),
        SizedBox(
          height: 36,
          child: Row(
            children: [
              SizedBox(
                width: timeRailWidth,
                child: Center(
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.wb_sunny_outlined,
                      size: 14, color: Colors.white.withValues(alpha: 0.48)),
                  const SizedBox(width: 3),
                  Text('全天',
                      style: TextStyle(
                          fontSize: 9,
                          color: Colors.white.withValues(alpha: 0.42))),
                ])),
              ),
              ...days.map((day) {
                final allDayEvents = events
                    .where((item) => item.allDay && _occursOn(item, day))
                    .toList();
                final first = allDayEvents.isEmpty ? null : allDayEvents.first;
                return Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 2),
                    child: Column(children: [
                      if (first != null)
                        GestureDetector(
                          onTap: first.isExternal
                              ? null
                              : () => _openCreate(day, event: first),
                          child: Container(
                            width: double.infinity,
                            padding: const EdgeInsets.symmetric(
                                horizontal: 5, vertical: 4),
                            decoration: BoxDecoration(
                              gradient: LinearGradient(colors: [
                                const Color(0xFFE7B18D).withValues(alpha: 0.52),
                                const Color(0xFFE7B18D).withValues(alpha: 0.22),
                              ]),
                              borderRadius: BorderRadius.circular(9),
                              border: Border.all(
                                  color: const Color(0xFFE7B18D)
                                      .withValues(alpha: 0.4)),
                            ),
                            child: Text(first.title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontSize: 10, fontWeight: FontWeight.w600)),
                          ),
                        ),
                      if (allDayEvents.length > 1)
                        Align(
                          alignment: Alignment.centerLeft,
                          child: InkWell(
                            onTap: () => _showAllDayEvents(day, allDayEvents),
                            child: Padding(
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 2),
                              child: Text(
                                '+${allDayEvents.length - 1}',
                                style: TextStyle(
                                  fontSize: 9,
                                  color: Colors.white.withValues(alpha: .6),
                                ),
                              ),
                            ),
                          ),
                        ),
                    ]),
                  ),
                );
              }),
            ],
          ),
        ),
        Expanded(
            flex: 3,
            child: SingleChildScrollView(
                controller: _weekScroll,
                child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                          width: timeRailWidth,
                          child: Column(
                              children: List.generate(
                                  24,
                                  (index) => SizedBox(
                                      height: hourHeight,
                                      child: Align(
                                          alignment: Alignment.topCenter,
                                          child: Padding(
                                              padding:
                                                  const EdgeInsets.only(top: 5),
                                              child: Text(
                                                  '${index.toString().padLeft(2, '0')}:00',
                                                  style: TextStyle(
                                                      color: Colors.white
                                                          .withValues(
                                                              alpha: 0.38),
                                                      fontSize: 9,
                                                      fontWeight: FontWeight
                                                          .w500)))))))),
                      ...days.map((day) => Expanded(
                          child: SizedBox(
                              height: gridHeight,
                              child: _dayColumn(day, events,
                                  hourHeight: hourHeight)))),
                    ]))),
      ]);
    });
  }

  Widget _buildDeadlineArea(
      List<DateTime> days, List<Deadline> deadlines, double timeRailWidth) {
    final pinned = deadlines.where((item) => item.pinned).toList()
      ..sort((a, b) {
        final order = a.pinOrder.compareTo(b.pinOrder);
        return order != 0 ? order : a.dueOn.compareTo(b.dueOn);
      });
    final visible = _deadlineBarsExpanded ? pinned : pinned.take(3).toList();
    return SizedBox(
      height: pinned.isEmpty ? 28 : 25 + visible.length * 38.0,
      child: Column(children: [
        SizedBox(
          height: 24,
          child: Row(children: [
            SizedBox(
                width: timeRailWidth,
                child: const Center(
                    child: Icon(Icons.flag_outlined,
                        size: 14, color: Color(0xFFFFA0B1)))),
            Expanded(
                child: Text(pinned.isEmpty ? '沒有釘選倒數' : 'Deadline 倒數',
                    style: TextStyle(
                        fontSize: 9,
                        color: Colors.white.withValues(alpha: .48)))),
            if (pinned.length > 3)
              TextButton(
                style: TextButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    padding: const EdgeInsets.symmetric(horizontal: 8)),
                onPressed: () => setState(
                    () => _deadlineBarsExpanded = !_deadlineBarsExpanded),
                child: Text(
                    _deadlineBarsExpanded ? '收合' : '+${pinned.length - 3}',
                    style: const TextStyle(fontSize: 9)),
              ),
          ]),
        ),
        for (final deadline in visible)
          Opacity(
            opacity: deadline.completed ? .5 : 1,
            child: SizedBox(
              height: 38,
              child: Row(children: [
                Tooltip(
                  message: deadline.title,
                  child: SizedBox(
                    width: timeRailWidth,
                    child: InkWell(
                      onTap: () =>
                          _openDeadline(deadline.dueOn, deadline: deadline),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 3),
                        child: Text(deadline.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                                fontSize: 8, fontWeight: FontWeight.w700)),
                      ),
                    ),
                  ),
                ),
                ...days.map((day) {
                  final count = deadlineDays(deadline, _day(day));
                  final caption = count < 0
                      ? ''
                      : count == 0
                          ? '今天'
                          : '剩 $count 天';
                  return Expanded(
                    child: InkWell(
                      onTap: () =>
                          _openDeadline(deadline.dueOn, deadline: deadline),
                      child: Container(
                        height: 28,
                        alignment: Alignment.center,
                        margin: const EdgeInsets.symmetric(vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFF8098)
                              .withValues(alpha: caption.isEmpty ? .05 : .22),
                          border: Border(
                              left: BorderSide(
                                  color: Colors.white.withValues(alpha: .08)),
                              bottom: BorderSide(
                                  color: const Color(0xFFFF8098)
                                      .withValues(alpha: .55),
                                  width: 2)),
                        ),
                        child: Text(caption,
                            style: TextStyle(
                                fontSize: 8,
                                fontWeight: FontWeight.w800,
                                color: caption.isEmpty
                                    ? Colors.transparent
                                    : Colors.white)),
                      ),
                    ),
                  );
                }),
              ]),
            ),
          ),
      ]),
    );
  }

  Widget _dayColumn(DateTime day, List<CalendarEvent> events,
      {required double hourHeight}) {
    final dayEvents = events
        .where((event) => !event.allDay && _occursOn(event, day))
        .where((event) =>
            _eventMinutes(event, day, start: false) > 0 &&
            _eventMinutes(event, day, start: true) < 24 * 60)
        .toList()
      ..sort((a, b) {
        final start = _eventMinutes(a, day, start: true)
            .compareTo(_eventMinutes(b, day, start: true));
        return start != 0
            ? start
            : _eventMinutes(a, day, start: false)
                .compareTo(_eventMinutes(b, day, start: false));
      });
    final columns = <int>[];
    final columnEnds = <int>[];
    for (final event in dayEvents) {
      final start = _eventMinutes(event, day, start: true);
      var column = 0;
      while (column < columnEnds.length && columnEnds[column] > start) {
        column++;
      }
      if (column == columnEnds.length) columnEnds.add(0);
      columnEnds[column] = _eventMinutes(event, day, start: false);
      columns.add(column);
    }
    final totalColumns = math.max(1, columnEnds.length);
    return LayoutBuilder(builder: (context, constraints) {
      final columnWidth = constraints.maxWidth / totalColumns;
      return Stack(children: [
        if (_isToday(day))
          Positioned.fill(
              child: ColoredBox(
                  color: const Color(0xFFA8E6B7).withValues(alpha: 0.025))),
        ...List.generate(24, (hour) {
          return Positioned(
              top: hour * hourHeight,
              left: 0,
              right: 0,
              height: hourHeight,
              child: GestureDetector(
                  key: ValueKey(
                      'calendar-slot-${DateFormat('yyyy-MM-dd').format(day)}-$hour'),
                  onTap: () => _openCreate(day, hour: hour),
                  child: Container(
                      decoration: BoxDecoration(
                          border: Border(
                              top: BorderSide(
                                  color: Colors.white.withValues(alpha: 0.08)),
                              left: BorderSide(
                                  color: Colors.white
                                      .withValues(alpha: 0.08)))))));
        }),
        ...List.generate(dayEvents.length, (index) {
          final event = dayEvents[index];
          final start = _eventMinutes(event, day, start: true);
          final end = _eventMinutes(event, day, start: false);
          final top = (math.max(start, 0) / 60) * hourHeight;
          final height = math.max(
              32.0,
              ((math.min(end, 24 * 60) - math.max(start, 0)) / 60) *
                      hourHeight -
                  6);
          final column = columns[index];
          return Positioned(
              top: top,
              left: column * columnWidth + 2,
              width: columnWidth - 4,
              height: height,
              child: GlassEventCard(
                  event: _toEventView(event, day),
                  height: height,
                  onTap: event.isExternal || event.isFocus
                      ? null
                      : () => _openCreate(day, event: event)));
        }),
      ]);
    });
  }

  Future<void> _showAllDayEvents(
      DateTime day, List<CalendarEvent> events) async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => GlassPanel(
        borderRadius: 28,
        child: SafeArea(
          top: false,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(DateFormat('M 月 d 日', 'zh_TW').format(day),
                style:
                    const TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
            for (final event in events)
              ListTile(
                leading: Icon(event.isExternal
                    ? Icons.cloud_outlined
                    : Icons.event_rounded),
                title: Text(event.title),
                subtitle: const Text('全天'),
                onTap: event.isExternal
                    ? null
                    : () {
                        Navigator.pop(context);
                        _openCreate(day, event: event);
                      },
              ),
          ]),
        ),
      ),
    );
  }

  Widget _buildMonth(
      List<CalendarEvent> events, List<Deadline> deadlines, List<Goal> goals) {
    final first = DateTime(_anchor.year, _anchor.month, 1);
    final offset = (first.weekday + 6) % 7;
    final gridStart = first.subtract(Duration(days: offset));
    const weekdayLabels = ['一', '二', '三', '四', '五', '六', '日'];
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      child: GlassPanel(
        padding: const EdgeInsets.all(8),
        borderRadius: 20,
        child: Column(
          children: [
            SizedBox(
              height: 34,
              child: Row(
                children: weekdayLabels
                    .asMap()
                    .entries
                    .map((entry) => Expanded(
                          child: Center(
                            child: Text(
                              entry.value,
                              style: TextStyle(
                                color: entry.key >= 5
                                    ? Colors.white.withValues(alpha: 0.5)
                                    : Colors.white.withValues(alpha: 0.38),
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ))
                    .toList(),
              ),
            ),
            Divider(height: 1, color: Colors.white.withValues(alpha: 0.08)),
            Expanded(
              child: GridView.builder(
                padding: const EdgeInsets.only(top: 4),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 7,
                  childAspectRatio: 0.55,
                ),
                itemCount: 42,
                itemBuilder: (context, index) {
                  final day = gridStart.add(Duration(days: index));
                  final inMonth = day.month == _anchor.month;
                  final entries = _monthItems(day, events, deadlines);
                  final userId = ref.read(apiClientProvider).userId ?? '';
                  final stamps = goals
                      .where((goal) =>
                          goal.archivedAt == null &&
                          goal.checkedOn(day, userId))
                      .toList();
                  return Semantics(
                      button: true,
                      label: '開啟 ${DateFormat('M 月 d 日', 'zh_TW').format(day)}',
                      child: Material(
                          color: Colors.transparent,
                          borderRadius: BorderRadius.circular(12),
                          child: InkWell(
                              onTap: () => _showDayGoals(day, goals),
                              borderRadius: BorderRadius.circular(12),
                              child: Padding(
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 3),
                                  child: Ink(
                                      padding:
                                          const EdgeInsets.fromLTRB(2, 5, 2, 5),
                                      decoration: BoxDecoration(
                                        color: _isToday(day) && inMonth
                                            ? const Color(0xFFA8E6B7)
                                                .withValues(alpha: 0.14)
                                            : Colors.transparent,
                                        borderRadius: BorderRadius.circular(12),
                                        border: _isToday(day) && inMonth
                                            ? Border.all(
                                                color: const Color(0xFFA8E6B7)
                                                    .withValues(alpha: 0.52))
                                            : null,
                                      ),
                                      child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Padding(
                                                padding: const EdgeInsets.only(
                                                    left: 2),
                                                child: Text('${day.day}',
                                                    style: TextStyle(
                                                      color: inMonth
                                                          ? Colors.white
                                                          : Colors.white
                                                              .withValues(
                                                                  alpha: 0.28),
                                                      fontSize: 12,
                                                      fontWeight: _isToday(day)
                                                          ? FontWeight.w800
                                                          : FontWeight.w600,
                                                    ))),
                                            const SizedBox(height: 4),
                                            if (stamps.isNotEmpty)
                                              Padding(
                                                padding:
                                                    const EdgeInsets.symmetric(
                                                        horizontal: 2),
                                                child: Row(children: [
                                                  ...stamps
                                                      .take(3)
                                                      .map((goal) => Padding(
                                                            padding:
                                                                const EdgeInsets
                                                                    .only(
                                                                    right: 2),
                                                            child: Tooltip(
                                                                message:
                                                                    goal.title,
                                                                child: Container(
                                                                    width: 9,
                                                                    height: 9,
                                                                    decoration: BoxDecoration(
                                                                        shape: BoxShape
                                                                            .circle,
                                                                        color: _goalColor(goal
                                                                            .color)),
                                                                    child: Icon(
                                                                        _goalIcon(goal
                                                                            .icon),
                                                                        size: 6,
                                                                        color: Colors
                                                                            .white))),
                                                          )),
                                                  if (stamps.length > 3)
                                                    Text(
                                                        '+${stamps.length - 3}',
                                                        style: const TextStyle(
                                                            fontSize: 7,
                                                            fontWeight:
                                                                FontWeight
                                                                    .w800)),
                                                ]),
                                              ),
                                            if (stamps.isNotEmpty)
                                              const SizedBox(height: 3),
                                            ...entries.take(3).map((entry) =>
                                                Padding(
                                                    padding:
                                                        const EdgeInsets.only(
                                                            bottom: 2),
                                                    child: _monthItemCard(
                                                        entry, day))),
                                            if (entries.length > 3)
                                              Container(
                                                  margin: const EdgeInsets.only(
                                                      left: 2, top: 1),
                                                  padding:
                                                      const EdgeInsets.symmetric(
                                                          horizontal: 4,
                                                          vertical: 1),
                                                  decoration: BoxDecoration(
                                                      color: Colors.white
                                                          .withValues(
                                                              alpha: 0.09),
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                              6)),
                                                  child: Text(
                                                      '+${entries.length - 3}',
                                                      style: TextStyle(
                                                          color: Colors.white
                                                              .withValues(
                                                                  alpha: 0.76),
                                                          fontSize: 9,
                                                          fontWeight:
                                                              FontWeight.w700))),
                                          ]))))));
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<_MonthItem> _monthItems(
      DateTime day, List<CalendarEvent> events, List<Deadline> deadlines) {
    final deadlineItems = deadlines
        .where((deadline) => _isSameDay(deadline.dueOn, day))
        .map(_MonthItem.deadline)
        .toList()
      ..sort((a, b) => a.deadline!.completed == b.deadline!.completed
          ? a.title.compareTo(b.title)
          : (a.deadline!.completed ? 1 : -1));
    final eventItems = events
        .where((event) => _occursOn(event, day))
        .map(_MonthItem.event)
        .toList()
      ..sort((a, b) => a.title.compareTo(b.title));
    return [...deadlineItems, ...eventItems];
  }

  Widget _monthItemCard(_MonthItem item, DateTime day) {
    final deadline = item.deadline;
    final event = item.event;
    final color =
        deadline != null ? const Color(0xFFFF8098) : _colorFor(event!.color);
    final startsHere = event == null ||
        !_occursOn(event, day.subtract(const Duration(days: 1)));
    final endsHere =
        event == null || !_occursOn(event, day.add(const Duration(days: 1)));
    return Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.horizontal(
          left: startsHere ? const Radius.circular(6) : Radius.zero,
          right: endsHere ? const Radius.circular(6) : Radius.zero,
        ),
        child: InkWell(
            onTap: () {
              if (deadline != null) {
                _openDeadline(day, deadline: deadline);
              } else if (!event!.isExternal && !event.isFocus) {
                _openCreate(day, event: event);
              }
            },
            borderRadius: BorderRadius.horizontal(
              left: startsHere ? const Radius.circular(6) : Radius.zero,
              right: endsHere ? const Radius.circular(6) : Radius.zero,
            ),
            child: Ink(
                width: double.infinity,
                height: 16,
                padding: const EdgeInsets.symmetric(horizontal: 3),
                decoration: BoxDecoration(
                  color: color.withValues(
                      alpha: deadline?.completed == true
                          ? 0.16
                          : (event?.isExternal == true ? 0.25 : 0.5)),
                  borderRadius: BorderRadius.horizontal(
                    left: startsHere ? const Radius.circular(6) : Radius.zero,
                    right: endsHere ? const Radius.circular(6) : Radius.zero,
                  ),
                  border: deadline == null
                      ? null
                      : Border(left: BorderSide(color: color, width: 2)),
                ),
                child: Row(children: [
                  if (deadline?.completed == true)
                    Icon(Icons.check_rounded,
                        size: 9, color: Colors.white.withValues(alpha: 0.65)),
                  Expanded(
                      child: Text(item.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 8,
                              height: 1.25,
                              fontWeight: FontWeight.w700,
                              color: Colors.white.withValues(
                                  alpha: deadline?.completed == true
                                      ? 0.55
                                      : 0.96)))),
                ]))));
  }

  void _openWeekFor(DateTime day) {
    setState(() {
      _pageOrigin = _day(day);
      _anchor = _pageOrigin;
      _view = CalendarView.week;
    });
  }

  Future<void> _showDayGoals(DateTime day, List<Goal> goals) async {
    final userId = ref.read(apiClientProvider).userId ?? '';
    await showModalBottomSheet<void>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: StatefulBuilder(
              builder: (context, setSheet) => Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(children: [
                        Expanded(
                            child: Text(
                                DateFormat('M 月 d 日', 'zh_TW').format(day),
                                style: const TextStyle(
                                    fontSize: 20,
                                    fontWeight: FontWeight.w800))),
                        TextButton(
                            onPressed: () {
                              Navigator.pop(sheetContext);
                              _openWeekFor(day);
                            },
                            child: const Text('查看週曆')),
                      ]),
                      if (goals
                          .where((goal) => goal.archivedAt == null)
                          .isEmpty)
                        const Padding(
                            padding: EdgeInsets.all(18),
                            child: Text('這一天沒有可打卡的 Goal')),
                      ...goals
                          .where((goal) => goal.archivedAt == null)
                          .map((goal) {
                        final checked = goal.checkedOn(day, userId);
                        final future = _day(day).isAfter(_day(DateTime.now()));
                        return CheckboxListTile(
                          secondary: Container(
                              width: 30,
                              height: 30,
                              decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: _goalColor(goal.color)
                                      .withValues(alpha: checked ? .8 : .16)),
                              child: Icon(_goalIcon(goal.icon), size: 16)),
                          title: Text(goal.title),
                          subtitle: _day(day).isBefore(_day(DateTime.now()))
                              ? const Text('補卡會在朋友頁標示')
                              : null,
                          value: checked,
                          onChanged: future || goal.role == 'viewer'
                              ? null
                              : (value) async {
                                  await ref
                                      .read(productivityRepositoryProvider)
                                      .setCheckin(goal.id, day, value == true);
                                  ref.invalidate(
                                      goalsProvider(_rangeForView()));
                                  if (sheetContext.mounted)
                                    Navigator.pop(sheetContext);
                                },
                        );
                      }),
                    ],
                  )),
        ),
      ),
    );
  }

  Widget _buildYear(List<CalendarEvent> events) {
    return GridView.builder(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        childAspectRatio: 0.83,
        crossAxisSpacing: 7,
        mainAxisSpacing: 7,
      ),
      itemCount: 12,
      itemBuilder: (context, index) {
        final month = DateTime(_anchor.year, index + 1, 1);
        return _MiniMonth(
          month: month,
          events: events,
          onTap: () {
            setState(() {
              _anchor = month;
              _view = CalendarView.month;
            });
          },
        );
      },
    );
  }

  Future<void> _openCreate(DateTime day,
      {int hour = 9, CalendarEvent? event}) async {
    final sources = widget.preview
        ? const [
            CalendarSource(
              id: 'preview',
              provider: 'manual',
              displayName: '預覽',
              includeInDisplay: true,
              includeInCoordination: true,
              canWrite: true,
              syncStatus: 'ready',
            ),
          ]
        : await _loadWritableSources();
    final calendars = widget.preview
        ? const [
            SharedCalendar(
                id: 'preview-calendar',
                name: '預覽',
                color: 'sage',
                kind: 'personal',
                role: 'owner',
                version: '1')
          ]
        : await ref.read(calendarRepositoryProvider).loadSharedCalendars();
    if (sources.isEmpty && event == null) {
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('請先登入或建立日曆來源')));
      return;
    }
    if (!mounted) return;
    final repository =
        widget.preview ? null : ref.read(calendarRepositoryProvider);
    var currentEvent = event;
    final result = await showModalBottomSheet<_EventDraft>(
      context: context,
      isScrollControlled: true,
      isDismissible: false,
      enableDrag: false,
      backgroundColor: Colors.transparent,
      builder: (context) => _EventForm(
        day: day,
        hour: hour,
        event: event,
        calendars: calendars,
        onComments: event == null || widget.preview
            ? null
            : () => _showEventComments(event.id),
        onReload: event == null
            ? null
            : () async {
                currentEvent = await repository!.reloadEvent(event.id);
              },
        onSave: widget.preview
            ? null
            : (draft) async {
                final activeRepository = repository!;
                if (draft.deleted && currentEvent != null) {
                  await activeRepository.deleteEvent(currentEvent!);
                } else if (currentEvent != null) {
                  await activeRepository.updateEvent(
                      event: currentEvent!,
                      title: draft.title,
                      start: draft.start!,
                      end: draft.end!,
                      color: draft.color,
                      allDay: draft.allDay);
                } else {
                  await activeRepository.createEvent(
                      source: sources.first,
                      title: draft.title,
                      start: draft.start!,
                      end: draft.end!,
                      color: draft.color,
                      allDay: draft.allDay,
                      calendarId: draft.calendarId);
                }
                if (mounted)
                  ref.invalidate(calendarItemsProvider(_rangeForView()));
                ref.invalidate(deadlineOverviewProvider);
              },
      ),
    );
    if (result == null || !mounted) return;
    if (widget.preview) {
      setState(() {
        if (result.deleted && event != null) {
          _previewItems.removeWhere((item) => item.id == event.id);
          return;
        }
        final previewEvent = CalendarEvent(
          id: event?.id ?? 'preview-${DateTime.now().microsecondsSinceEpoch}',
          sourceId: 'preview',
          calendarId: result.calendarId ?? 'preview-calendar',
          title: result.title,
          color: result.color,
          allDay: result.allDay,
          startAt: result.allDay ? null : result.start,
          endAt: result.allDay ? null : result.end,
          startDate: result.allDay ? result.start : null,
          endDateExclusive: result.allDay ? result.end : null,
          version: 'preview',
        );
        final index = event == null
            ? -1
            : _previewItems.indexWhere((item) => item.id == event.id);
        if (index == -1) {
          _previewItems.add(previewEvent);
        } else {
          _previewItems[index] = previewEvent;
        }
      });
      _showPreviewMessage(result.deleted ? '已從預覽移除' : '已加入本機預覽');
      return;
    }
  }

  Future<List<CalendarSource>> _loadWritableSources() async {
    try {
      final sources = await ref.read(sourcesProvider.future);
      return sources.where((source) => source.canWrite).toList();
    } catch (_) {
      return const [];
    }
  }

  Future<void> _chooseCreate(DateTime day) async {
    final choice = await showModalBottomSheet<String>(
        context: context,
        backgroundColor: Colors.transparent,
        builder: (context) => GlassPanel(
              borderRadius: 28,
              child: SafeArea(
                top: false,
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Text('新增',
                      style:
                          TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                  ListTile(
                      leading: const Icon(Icons.schedule_rounded),
                      title: const Text('行程'),
                      onTap: () => Navigator.pop(context, 'event')),
                  ListTile(
                      leading: const Icon(Icons.add_photo_alternate_outlined),
                      title: const Text('匯入 TimeTree 截圖'),
                      onTap: () => Navigator.pop(context, 'import')),
                  ListTile(
                      leading: const Icon(Icons.flag_outlined),
                      title: const Text('截止事項'),
                      onTap: () => Navigator.pop(context, 'deadline')),
                ]),
              ),
            ));
    if (!mounted) return;
    if (choice == 'import') {
      if (widget.preview) {
        _showPreviewMessage('登入後即可匯入截圖');
      } else {
        context.push('/calendar-import');
      }
    }
    if (choice == 'event') await _openCreate(day);
    if (choice == 'deadline') await _openDeadline(day);
  }

  Future<void> _openDeadline(DateTime day, {Deadline? deadline}) async {
    final repository =
        widget.preview ? null : ref.read(calendarRepositoryProvider);
    var currentDeadline = deadline;
    final result = await showModalBottomSheet<_DeadlineDraft>(
      context: context,
      isScrollControlled: true,
      isDismissible: false,
      enableDrag: false,
      backgroundColor: Colors.transparent,
      builder: (context) => _DeadlineForm(
          day: day,
          deadline: deadline,
          onReload: deadline == null
              ? null
              : () async {
                  currentDeadline =
                      await repository!.reloadDeadline(deadline.id);
                },
          onSave: widget.preview
              ? null
              : (draft) async {
                  final activeRepository = repository!;
                  if (draft.deleted && currentDeadline != null) {
                    await activeRepository.deleteDeadline(currentDeadline!);
                  } else if (currentDeadline != null) {
                    await activeRepository.updateDeadline(
                        deadline: currentDeadline!,
                        title: draft.title,
                        dueOn: draft.dueOn,
                        completed: draft.completed,
                        pinned: draft.pinned,
                        pinOrder: currentDeadline!.pinOrder);
                  } else {
                    await activeRepository.createDeadline(
                        title: draft.title,
                        dueOn: draft.dueOn,
                        completed: draft.completed,
                        pinned: draft.pinned);
                  }
                  if (mounted)
                    ref.invalidate(calendarItemsProvider(_rangeForView()));
                  ref.invalidate(deadlineOverviewProvider);
                }),
    );
    if (result == null || !mounted) return;
    if (widget.preview) {
      setState(() {
        if (result.deleted && deadline != null) {
          _previewDeadlines.removeWhere((item) => item.id == deadline.id);
          return;
        }
        final updated = Deadline(
          id: deadline?.id ??
              'preview-deadline-${DateTime.now().microsecondsSinceEpoch}',
          title: result.title,
          dueOn: result.dueOn,
          completed: result.completed,
          pinned: result.pinned,
          version: 'preview',
        );
        final index = deadline == null
            ? -1
            : _previewDeadlines.indexWhere((item) => item.id == deadline.id);
        if (index == -1) {
          _previewDeadlines.add(updated);
        } else {
          _previewDeadlines[index] = updated;
        }
      });
      _showPreviewMessage(result.deleted ? '已從預覽移除' : '已保存');
      return;
    }
  }

  Future<void> _showConnections() async {
    if (widget.preview) {
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('預覽模式未連接外部日曆')));
      return;
    }
    await showGoogleConnectionSheet(context, ref, anchor: _anchor);
  }

  Future<void> _showSharedCalendars() async {
    if (widget.preview) {
      _showPreviewMessage('登入後可以建立與邀請共享日曆');
      return;
    }
    final repository = ref.read(calendarRepositoryProvider);
    var calendars = await repository.loadSharedCalendars();
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => StatefulBuilder(
          builder: (context, setSheet) => SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Row(children: [
                      const Expanded(
                          child: Text('我的日曆',
                              style: TextStyle(
                                  fontSize: 20, fontWeight: FontWeight.w800))),
                      FilledButton.icon(
                          onPressed: () async {
                            final name = await _promptText('建立共享日曆', '日曆名稱');
                            if (name == null) return;
                            await repository.createSharedCalendar(
                                name, EventColor.sage);
                            calendars = await repository.loadSharedCalendars();
                            ref.invalidate(sharedCalendarsProvider);
                            if (sheetContext.mounted) setSheet(() {});
                          },
                          icon: const Icon(Icons.add_rounded),
                          label: const Text('建立')),
                      IconButton(
                        tooltip: '輸入邀請碼',
                        icon: const Icon(Icons.vpn_key_rounded),
                        onPressed: () async {
                          final token = await _promptText('加入共享日曆', '邀請碼');
                          if (token == null) return;
                          await repository.acceptCalendarInvite(token);
                          calendars = await repository.loadSharedCalendars();
                          ref.invalidate(sharedCalendarsProvider);
                          if (sheetContext.mounted) setSheet(() {});
                        },
                      ),
                    ]),
                    const SizedBox(height: 8),
                    Flexible(
                        child: ListView(
                            shrinkWrap: true,
                            children: calendars
                                .map((calendar) => ListTile(
                                      leading: CircleAvatar(
                                          backgroundColor:
                                              _goalColor(calendar.color),
                                          child: const Icon(
                                              Icons.calendar_month_rounded,
                                              size: 18)),
                                      title: Text(calendar.name),
                                      subtitle: Text(calendar.kind == 'personal'
                                          ? '私人日曆'
                                          : '${calendar.role} · ${calendar.members.length} 位成員'),
                                      onTap: calendar.role == 'owner' &&
                                              calendar.kind == 'shared'
                                          ? () async {
                                              await _manageCalendarMembers(
                                                  repository, calendar);
                                              calendars = await repository
                                                  .loadSharedCalendars();
                                              ref.invalidate(
                                                  sharedCalendarsProvider);
                                              if (sheetContext.mounted) {
                                                setSheet(() {});
                                              }
                                            }
                                          : null,
                                      trailing: calendar.role == 'owner' &&
                                              calendar.kind == 'shared'
                                          ? IconButton(
                                              tooltip: '邀請成員',
                                              icon: const Icon(
                                                  Icons.person_add_alt_rounded),
                                              onPressed: () async {
                                                final email = await _promptText(
                                                    '邀請加入 ${calendar.name}',
                                                    '朋友的 Email');
                                                if (email == null) return;
                                                final token = await repository
                                                    .inviteToCalendar(
                                                        calendar.id, email);
                                                if (mounted)
                                                  _showPreviewMessage(
                                                      '邀請碼：$token');
                                              })
                                          : calendar.kind == 'shared'
                                              ? IconButton(
                                                  tooltip: '退出日曆',
                                                  icon: const Icon(
                                                      Icons.logout_rounded),
                                                  onPressed: () async {
                                                    await repository
                                                        .leaveCalendar(
                                                            calendar.id);
                                                    calendars = await repository
                                                        .loadSharedCalendars();
                                                    ref.invalidate(
                                                        sharedCalendarsProvider);
                                                    if (sheetContext.mounted) {
                                                      setSheet(() {});
                                                    }
                                                  })
                                              : null,
                                    ))
                                .toList())),
                  ]),
                ),
              )),
    );
  }

  Future<void> _showEventComments(String eventId) async {
    final repository = ref.read(calendarRepositoryProvider);
    var comments = await repository.loadEventComments(eventId);
    if (!mounted) return;
    final controller = TextEditingController();
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialog) => AlertDialog(
          title: const Text('事件留言'),
          content: SizedBox(
            width: 420,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Flexible(
                child: ListView(
                  shrinkWrap: true,
                  children: comments
                      .map((comment) => ListTile(
                            title: Text(
                                comment['displayName']?.toString() ?? '成員'),
                            subtitle: Text(comment['body']?.toString() ?? ''),
                          ))
                      .toList(),
                ),
              ),
              TextField(
                controller: controller,
                maxLength: 1000,
                decoration: const InputDecoration(labelText: '新增留言'),
              ),
            ]),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('關閉')),
            FilledButton(
              onPressed: () async {
                final text = controller.text.trim();
                if (text.isEmpty) return;
                await repository.addEventComment(eventId, text);
                controller.clear();
                comments = await repository.loadEventComments(eventId);
                if (dialogContext.mounted) setDialog(() {});
              },
              child: const Text('送出'),
            ),
          ],
        ),
      ),
    );
    controller.dispose();
  }

  Future<void> _manageCalendarMembers(
      CalendarRepository repository, SharedCalendar calendar) async {
    await showModalBottomSheet<void>(
      context: context,
      builder: (memberContext) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.all(16),
          children: [
            Text('${calendar.name} · 成員',
                style:
                    const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            ...calendar.members.map((member) => ListTile(
                  title: Text(member.displayName),
                  subtitle: Text(member.role),
                  trailing: member.role == 'owner'
                      ? null
                      : PopupMenuButton<String>(
                          onSelected: (action) async {
                            if (action == 'remove') {
                              await repository.removeCalendarMember(
                                  calendar.id, member.userId);
                            } else {
                              await repository.updateCalendarMember(
                                  calendar.id, member.userId, action);
                            }
                            if (memberContext.mounted) {
                              Navigator.pop(memberContext);
                            }
                          },
                          itemBuilder: (_) => const [
                            PopupMenuItem(
                                value: 'editor', child: Text('設為編輯者')),
                            PopupMenuItem(
                                value: 'viewer', child: Text('設為檢視者')),
                            PopupMenuItem(value: 'remove', child: Text('移除成員')),
                          ],
                        ),
                )),
          ],
        ),
      ),
    );
  }

  Future<String?> _promptText(String title, String label) async {
    final controller = TextEditingController();
    return showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
                title: Text(title),
                content: TextField(
                    controller: controller,
                    autofocus: false,
                    decoration: InputDecoration(labelText: label)),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('取消')),
                  FilledButton(
                      onPressed: () {
                        final value = controller.text.trim();
                        if (value.isNotEmpty) Navigator.pop(context, value);
                      },
                      child: const Text('確定'))
                ]));
  }

  void _showPreviewMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  void _move(int amount) {
    setState(() {
      _anchor = _view == CalendarView.week
          ? DateTime(_anchor.year, _anchor.month, _anchor.day + amount)
          : _view == CalendarView.month
              ? DateTime(_anchor.year, _anchor.month + amount, 1)
              : DateTime(_anchor.year + amount, 1);
    });
  }

  CalendarRange _rangeForView() {
    switch (_view) {
      case CalendarView.week:
        final start = _day(_anchor);
        return CalendarRange(DateTime(start.year, start.month, start.day - 10),
            DateTime(start.year, start.month, start.day + 15));
      case CalendarView.month:
        final first = DateTime(_anchor.year, _anchor.month, 1);
        final start = first.subtract(Duration(days: (first.weekday + 6) % 7));
        return CalendarRange(start, start.add(const Duration(days: 42)));
      case CalendarView.year:
        final start = DateTime(_anchor.year);
        return CalendarRange(start, DateTime(_anchor.year + 1));
    }
  }

  String _weekLabel() =>
      '${DateFormat('M/d').format(_anchor)} - ${DateFormat('M/d').format(_anchor.add(const Duration(days: 4)))}';
}

EventColor _eventColor(String value) => switch (value) {
      'peach' || 'amber' => EventColor.peach,
      'lilac' || 'rose' => EventColor.lilac,
      'sage' => EventColor.sage,
      _ => EventColor.blue,
    };

Color _goalColor(String value) => switch (value) {
      'sage' => const Color(0xFF75C897),
      'peach' => const Color(0xFFE7A06F),
      'lilac' => const Color(0xFFAF8FE3),
      'rose' => const Color(0xFFE37E9A),
      'amber' => const Color(0xFFE3B45D),
      _ => const Color(0xFF6FADE7),
    };

IconData _goalIcon(String value) => switch (value) {
      'book' => Icons.menu_book_rounded,
      'fitness' => Icons.fitness_center_rounded,
      'water' => Icons.water_drop_rounded,
      _ => Icons.star_rounded,
    };

String? _firstEditableCalendar(List<SharedCalendar> calendars) {
  for (final calendar in calendars) {
    if (calendar.canEdit) return calendar.id;
  }
  return null;
}

class _EventForm extends StatefulWidget {
  const _EventForm(
      {required this.day,
      required this.hour,
      required this.calendars,
      this.event,
      this.onSave,
      this.onReload,
      this.onComments});
  final DateTime day;
  final int hour;
  final List<SharedCalendar> calendars;
  final CalendarEvent? event;
  final Future<void> Function(_EventDraft)? onSave;
  final Future<void> Function()? onReload;
  final Future<void> Function()? onComments;

  @override
  State<_EventForm> createState() => _EventFormState();
}

class _EventFormState extends State<_EventForm>
    with AsyncSaveForm<_EventForm, _EventDraft> {
  @override
  Future<void> Function(_EventDraft)? get save => widget.onSave;
  @override
  Future<void> Function()? get reload => widget.onReload;
  late final TextEditingController _title =
      TextEditingController(text: widget.event?.title ?? '');
  late TimeOfDay _start = widget.event?.startAt == null
      ? TimeOfDay(hour: widget.hour, minute: 0)
      : TimeOfDay.fromDateTime(widget.event!.startAt!.toLocal());
  late TimeOfDay _end = widget.event?.endAt == null
      ? TimeOfDay(hour: (widget.hour + 1).clamp(0, 23), minute: 0)
      : TimeOfDay.fromDateTime(widget.event!.endAt!.toLocal());
  late EventColor _color = widget.event?.color ?? EventColor.sage;
  late bool _allDay = widget.event?.allDay ?? false;
  late String? _calendarId = widget.event?.calendarId.isNotEmpty == true
      ? widget.event!.calendarId
      : _firstEditableCalendar(widget.calendars);
  late DateTime _startDate = _day(widget.event?.startDate ??
      widget.event?.startAt?.toLocal() ??
      widget.day);
  late DateTime _endDate = _day(
      widget.event?.endDateExclusive?.subtract(const Duration(days: 1)) ??
          widget.event?.endAt?.toLocal() ??
          widget.day);

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
        padding: EdgeInsets.only(bottom: bottom),
        child: GlassPanel(
            borderRadius: 28,
            child: SafeArea(
                top: false,
                child: ConstrainedBox(
                    constraints: BoxConstraints(
                        maxHeight: MediaQuery.sizeOf(context).height * .85),
                    child: SingleChildScrollView(
                        child: guardSaveForm(
                            Column(mainAxisSize: MainAxisSize.min, children: [
                      TextField(
                          controller: _title,
                          autofocus: false,
                          maxLength: 200,
                          decoration: const InputDecoration(
                              labelText: '事件名稱',
                              border: InputBorder.none,
                              counterText: '')),
                      DropdownButtonFormField<String>(
                        initialValue: _calendarId,
                        decoration: const InputDecoration(labelText: '日曆'),
                        items: widget.calendars
                            .where((item) =>
                                item.canEdit || item.id == _calendarId)
                            .map((item) => DropdownMenuItem(
                                value: item.id,
                                child: Text(
                                    '${item.name}${item.canEdit ? '' : '（唯讀）'}')))
                            .toList(),
                        onChanged: widget.event == null
                            ? (value) => setState(() => _calendarId = value)
                            : null,
                      ),
                      Row(children: [
                        Expanded(
                            child: _FormDateButton(
                                label: '日期',
                                value: _startDate,
                                onTap: () => _pickDate(true))),
                        const Padding(
                            padding: EdgeInsets.symmetric(horizontal: 8),
                            child: Text('至')),
                        Expanded(
                            child: _FormDateButton(
                                label: '日期',
                                value: _endDate,
                                onTap: () => _pickDate(false))),
                      ]),
                      SwitchListTile.adaptive(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('全天'),
                        value: _allDay,
                        onChanged: (value) => setState(() => _allDay = value),
                      ),
                      if (!_allDay)
                        Row(children: [
                          Expanded(
                              child: _TimeButton(
                                  label: '開始',
                                  value: _start,
                                  onTap: () => _pickTime(true))),
                          const Padding(
                              padding: EdgeInsets.symmetric(horizontal: 8),
                              child: Text('至')),
                          Expanded(
                              child: _TimeButton(
                                  label: '結束',
                                  value: _end,
                                  onTap: () => _pickTime(false)))
                        ]),
                      const SizedBox(height: 12),
                      Row(children: [
                        for (final color in EventColor.values)
                          Expanded(
                              child: IconButton(
                                  tooltip: color.name,
                                  onPressed: () =>
                                      setState(() => _color = color),
                                  icon: Icon(
                                      _color == color
                                          ? Icons.check_circle_rounded
                                          : Icons.circle,
                                      color: _colorFor(color))))
                      ]),
                      const SizedBox(height: 8),
                      if (widget.onComments != null)
                        Align(
                          alignment: Alignment.centerLeft,
                          child: TextButton.icon(
                            onPressed: widget.onComments,
                            icon: const Icon(Icons.chat_bubble_outline_rounded),
                            label: const Text('事件留言'),
                          ),
                        ),
                      if (widget.event != null)
                        Align(
                            alignment: Alignment.centerLeft,
                            child: IconButton(
                                tooltip: '刪除事件',
                                onPressed: () async {
                                  final confirmed = await showDialog<bool>(
                                      context: context,
                                      builder: (_) => AlertDialog(
                                            title: const Text('刪除這個行程？'),
                                            content:
                                                const Text('刪除後無法在 App 內復原。'),
                                            actions: [
                                              TextButton(
                                                  onPressed: () =>
                                                      Navigator.pop(
                                                          context, false),
                                                  child: const Text('取消')),
                                              FilledButton(
                                                  onPressed: () =>
                                                      Navigator.pop(
                                                          context, true),
                                                  child: const Text('刪除')),
                                            ],
                                          ));
                                  if (confirmed == true && context.mounted) {
                                    submitForm(const _EventDraft(
                                        title: '',
                                        start: null,
                                        end: null,
                                        color: EventColor.sage,
                                        deleted: true));
                                  }
                                },
                                icon: const Icon(Icons.delete_outline_rounded,
                                    color: Color(0xFFFFB4AB)))),
                      SizedBox(
                          width: double.infinity,
                          child: FilledButton(
                              onPressed: () {
                                final start = DateTime(
                                    _startDate.year,
                                    _startDate.month,
                                    _startDate.day,
                                    _start.hour,
                                    _start.minute);
                                final end = DateTime(
                                    _endDate.year,
                                    _endDate.month,
                                    _endDate.day,
                                    _end.hour,
                                    _end.minute);
                                final valueStart =
                                    _allDay ? _day(_startDate) : start;
                                final valueEnd = _allDay
                                    ? _day(_endDate)
                                        .add(const Duration(days: 1))
                                    : end;
                                if (_title.text.trim().isEmpty ||
                                    !valueEnd.isAfter(valueStart)) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(
                                          content: Text('請確認名稱與時間')));
                                  return;
                                }
                                submitForm(_EventDraft(
                                    title: _title.text.trim(),
                                    start: valueStart,
                                    end: valueEnd,
                                    color: _color,
                                    calendarId: _calendarId,
                                    allDay: _allDay));
                              },
                              child: const Text('儲存'))),
                    ])))))));
  }

  Future<void> _pickTime(bool start) async {
    final picked = await showTimePicker(
        context: context, initialTime: start ? _start : _end);
    if (picked != null)
      setState(() {
        if (start)
          _start = picked;
        else
          _end = picked;
      });
  }

  Future<void> _pickDate(bool start) async {
    final picked = await showDatePicker(
        context: context,
        initialDate: start ? _startDate : _endDate,
        firstDate: DateTime(1900),
        lastDate: DateTime(2100));
    if (picked != null)
      setState(() {
        if (start)
          _startDate = _day(picked);
        else
          _endDate = _day(picked);
      });
  }
}

class _FormDateButton extends StatelessWidget {
  const _FormDateButton(
      {required this.label, required this.value, required this.onTap});
  final String label;
  final DateTime value;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
          decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: .08),
              borderRadius: BorderRadius.circular(12)),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label,
                style: TextStyle(
                    color: Colors.white.withValues(alpha: .55), fontSize: 10)),
            Text(DateFormat('yyyy/MM/dd').format(value),
                style: const TextStyle(fontWeight: FontWeight.w700))
          ])));
}

class _TimeButton extends StatelessWidget {
  const _TimeButton(
      {required this.label, required this.value, required this.onTap});
  final String label;
  final TimeOfDay value;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
          decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(14)),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label,
                style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.55), fontSize: 11)),
            Text(value.format(context),
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w700))
          ])));
}

class _EventDraft {
  const _EventDraft(
      {required this.title,
      required this.start,
      required this.end,
      required this.color,
      this.calendarId,
      this.allDay = false,
      this.deleted = false});
  final String title;
  final DateTime? start;
  final DateTime? end;
  final EventColor color;
  final String? calendarId;
  final bool allDay;
  final bool deleted;
}

class _DeadlineForm extends StatefulWidget {
  const _DeadlineForm(
      {required this.day, this.deadline, this.onSave, this.onReload});

  final DateTime day;
  final Deadline? deadline;
  final Future<void> Function(_DeadlineDraft)? onSave;
  final Future<void> Function()? onReload;

  @override
  State<_DeadlineForm> createState() => _DeadlineFormState();
}

class _DeadlineFormState extends State<_DeadlineForm>
    with AsyncSaveForm<_DeadlineForm, _DeadlineDraft> {
  @override
  Future<void> Function(_DeadlineDraft)? get save => widget.onSave;
  @override
  Future<void> Function()? get reload => widget.onReload;
  late final TextEditingController _title =
      TextEditingController(text: widget.deadline?.title ?? '');
  late DateTime _dueOn = widget.deadline?.dueOn ?? _day(widget.day);
  late bool _completed = widget.deadline?.completed ?? false;
  late bool _pinned = widget.deadline?.pinned ?? false;

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: bottom),
      child: GlassPanel(
        borderRadius: 28,
        child: SafeArea(
          top: false,
          child: ConstrainedBox(
            constraints: BoxConstraints(
                maxHeight: MediaQuery.sizeOf(context).height * .85),
            child: SingleChildScrollView(
              child: guardSaveForm(
                  Column(mainAxisSize: MainAxisSize.min, children: [
                TextField(
                  controller: _title,
                  autofocus: false,
                  maxLength: 200,
                  decoration: const InputDecoration(
                      labelText: '名稱',
                      border: InputBorder.none,
                      counterText: ''),
                ),
                const SizedBox(height: 8),
                InkWell(
                  onTap: _pickDate,
                  borderRadius: BorderRadius.circular(14),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 11),
                    decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(14)),
                    child: Row(children: [
                      const Icon(Icons.event_rounded, size: 18),
                      const Spacer(),
                      Text(DateFormat('yyyy/MM/dd', 'zh_TW').format(_dueOn),
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                    ]),
                  ),
                ),
                if (widget.deadline != null)
                  SwitchListTile.adaptive(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('已完成'),
                    value: _completed,
                    onChanged: (value) => setState(() => _completed = value),
                  ),
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('釘選在週曆倒數橫條'),
                  subtitle: const Text('每一天會顯示距離截止還有幾天'),
                  value: _pinned,
                  onChanged: (value) => setState(() => _pinned = value),
                ),
                const SizedBox(height: 8),
                Row(children: [
                  if (widget.deadline != null)
                    IconButton(
                      tooltip: '刪除 Deadline',
                      onPressed: () async {
                        final confirmed = await showDialog<bool>(
                            context: context,
                            builder: (_) => AlertDialog(
                                  title: const Text('刪除截止事項？'),
                                  content: const Text('刪除後無法在 App 內復原。'),
                                  actions: [
                                    TextButton(
                                        onPressed: () =>
                                            Navigator.pop(context, false),
                                        child: const Text('取消')),
                                    FilledButton(
                                        onPressed: () =>
                                            Navigator.pop(context, true),
                                        child: const Text('刪除')),
                                  ],
                                ));
                        if (confirmed == true && context.mounted) {
                          submitForm(_DeadlineDraft(
                              title: '',
                              dueOn: _dueOn,
                              completed: false,
                              pinned: _pinned,
                              deleted: true));
                        }
                      },
                      icon: const Icon(Icons.delete_outline_rounded,
                          color: Color(0xFFFFB4AB)),
                    ),
                  const Spacer(),
                  FilledButton(
                    onPressed: () {
                      if (_title.text.trim().isEmpty) {
                        ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('請輸入截止事項名稱')));
                        return;
                      }
                      submitForm(_DeadlineDraft(
                          title: _title.text.trim(),
                          dueOn: _dueOn,
                          completed: _completed,
                          pinned: _pinned));
                    },
                    child: const Text('儲存'),
                  ),
                ]),
              ])),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _dueOn,
      firstDate: DateTime(1900),
      lastDate: DateTime(2100),
    );
    if (picked != null) setState(() => _dueOn = _day(picked));
  }
}

class _DeadlineDraft {
  const _DeadlineDraft(
      {required this.title,
      required this.dueOn,
      required this.completed,
      required this.pinned,
      this.deleted = false});

  final String title;
  final DateTime dueOn;
  final bool completed;
  final bool pinned;
  final bool deleted;
}

class _MonthItem {
  const _MonthItem.deadline(this.deadline) : event = null;
  const _MonthItem.event(this.event) : deadline = null;

  final Deadline? deadline;
  final CalendarEvent? event;
  String get title => deadline?.title ?? event!.title;
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.onRetry, this.message, this.onLogin});
  final VoidCallback onRetry;
  final String? message;
  final VoidCallback? onLogin;
  @override
  Widget build(BuildContext context) => Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.cloud_off_rounded, color: Colors.white70, size: 36),
        const SizedBox(height: 10),
        Text(message ?? '目前顯示離線快取',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.72))),
        const SizedBox(height: 10),
        if (onLogin != null)
          FilledButton(onPressed: onLogin, child: const Text('重新登入'))
        else
          IconButton(
              onPressed: onRetry,
              tooltip: '重新載入',
              icon: const Icon(Icons.refresh_rounded))
      ]));
}

class _SyncBanner extends StatelessWidget {
  const _SyncBanner({required this.items});
  final CalendarItems items;

  @override
  Widget build(BuildContext context) {
    final status = items.syncErrors.isNotEmpty
        ? '有 ${items.pendingSyncCount} 筆待同步：${items.syncErrors.first}'
        : items.pendingSyncCount > 0
            ? '有 ${items.pendingSyncCount} 筆待同步，連線後會自動重試'
            : items.fromCache
                ? '目前顯示快取資料；上次同步未完成'
                : '部分資料同步失敗，已保留上一份結果';
    final text = [
      status,
      if (items.failedSources.isNotEmpty)
        '${items.failedSources.join('、')}載入失敗',
      if (items.fromCache && items.cachedAt != null)
        '上次完整更新 ${DateFormat('M/d HH:mm').format(items.cachedAt!.toLocal())}',
    ].join('；');
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 0, 14, 8),
      child: Material(
        color: const Color(0xFFFFD38A).withValues(alpha: .13),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(children: [
            const Icon(Icons.sync_problem_rounded,
                size: 16, color: Color(0xFFFFD38A)),
            const SizedBox(width: 8),
            Expanded(child: Text(text, style: const TextStyle(fontSize: 12))),
          ]),
        ),
      ),
    );
  }
}

class _MiniMonth extends StatelessWidget {
  const _MiniMonth({
    required this.month,
    required this.events,
    required this.onTap,
  });

  final DateTime month;
  final List<CalendarEvent> events;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    final sundayFirstOffset = DateTime(month.year, month.month, 1).weekday % 7;
    final now = DateTime.now();
    final isCurrentMonth = now.year == month.year && now.month == month.month;

    return Semantics(
      button: true,
      label: '開啟 ${month.year} 年 ${month.month} 月',
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(7, 6, 7, 6),
          decoration: BoxDecoration(
            color: isCurrentMonth
                ? const Color(0xFFA8E6B7).withValues(alpha: 0.075)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(16),
            border: isCurrentMonth
                ? Border.all(
                    color: const Color(0xFFA8E6B7).withValues(alpha: 0.2))
                : null,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                DateFormat('MMM', 'zh_TW').format(month),
                style: TextStyle(
                  color: isCurrentMonth
                      ? const Color(0xFFD5F9DD)
                      : Colors.white.withValues(alpha: 0.92),
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                  letterSpacing: -0.2,
                ),
              ),
              const SizedBox(height: 4),
              ...List.generate(6, (row) {
                return Expanded(
                  child: Row(
                    children: List.generate(7, (column) {
                      final dayNumber =
                          row * 7 + column - sundayFirstOffset + 1;
                      final isValidDay =
                          dayNumber > 0 && dayNumber <= daysInMonth;
                      if (!isValidDay) return const Expanded(child: SizedBox());

                      final day = DateTime(month.year, month.month, dayNumber);
                      final isToday = _isToday(day);
                      final hasEvent =
                          events.any((event) => _occursOn(event, day));
                      return Expanded(
                        child: Center(
                          child: Container(
                            width: 14,
                            height: 14,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: isToday
                                  ? const Color(0xFFA8E6B7)
                                      .withValues(alpha: 0.3)
                                  : Colors.transparent,
                              shape: BoxShape.circle,
                            ),
                            child: Text(
                              '$dayNumber',
                              style: TextStyle(
                                color: isToday || hasEvent
                                    ? const Color(0xFFC9F5D3)
                                    : Colors.white.withValues(alpha: 0.66),
                                fontSize: 8,
                                height: 1,
                                fontWeight: isToday || hasEvent
                                    ? FontWeight.w700
                                    : FontWeight.w500,
                              ),
                            ),
                          ),
                        ),
                      );
                    }),
                  ),
                );
              }),
            ],
          ),
        ),
      ),
    );
  }
}

DateTime _day(DateTime value) => DateTime(value.year, value.month, value.day);
bool _isToday(DateTime value) {
  final now = DateTime.now();
  return value.year == now.year &&
      value.month == now.month &&
      value.day == now.day;
}

bool _isSameDay(DateTime left, DateTime right) =>
    left.year == right.year &&
    left.month == right.month &&
    left.day == right.day;

bool _occursOn(CalendarEvent event, DateTime day) {
  final date = _day(day);
  if (event.allDay)
    return event.startDate != null &&
        event.endDateExclusive != null &&
        !date.isBefore(_day(event.startDate!)) &&
        date.isBefore(_day(event.endDateExclusive!));
  if (event.startAt == null || event.endAt == null) return false;
  final start = event.startAt!.toLocal();
  final end = event.endAt!.toLocal();
  return start.isBefore(date.add(const Duration(days: 1))) && end.isAfter(date);
}

int _eventMinutes(CalendarEvent event, DateTime day, {required bool start}) {
  if (event.allDay) return start ? 8 * 60 : 24 * 60;
  final instant = (start ? event.startAt : event.endAt)!.toLocal();
  if (instant.year != day.year ||
      instant.month != day.month ||
      instant.day != day.day) return start ? 8 * 60 : 24 * 60;
  return instant.hour * 60 + instant.minute;
}

CalendarEventView _toEventView(CalendarEvent event, DateTime day) {
  final start = _eventMinutes(event, day, start: true);
  final end = _eventMinutes(event, day, start: false);
  final color = switch (event.color) {
    EventColor.blue => EventColorView.blue,
    EventColor.peach => EventColorView.peach,
    EventColor.lilac => EventColorView.lilac,
    _ => EventColorView.sage
  };
  return CalendarEventView(
      title: event.title,
      timeLabel: event.allDay
          ? '全天'
          : '${_formatMinutes(start)} - ${_formatMinutes(end)}',
      color: color,
      isExternal: event.isExternal);
}

String _formatMinutes(int value) =>
    '${(value ~/ 60).toString().padLeft(2, '0')}:${(value % 60).toString().padLeft(2, '0')}';
Color _colorFor(EventColor color) => switch (color) {
      EventColor.blue => const Color(0xFF9CB9D9),
      EventColor.peach => const Color(0xFFE7B18D),
      EventColor.lilac => const Color(0xFFC5B1D8),
      _ => const Color(0xFF9CC7A5)
    };
