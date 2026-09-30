import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../models/productivity.dart';
import '../state/providers.dart';
import '../widgets/glass.dart';

class ProductivityScreen extends ConsumerStatefulWidget {
  const ProductivityScreen({super.key, this.initialTab = 0});
  final int initialTab;
  @override
  ConsumerState<ProductivityScreen> createState() => _ProductivityScreenState();
}

class _ProductivityScreenState extends ConsumerState<ProductivityScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(
      length: 3, vsync: this, initialIndex: widget.initialTab.clamp(0, 2));
  Timer? _ticker;
  DateTime _now = DateTime.now();
  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _now = DateTime.now());
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _tabs.dispose();
    super.dispose();
  }

  CalendarRange get _range => CalendarRange(
      DateTime(_now.year, _now.month - 2, 1),
      DateTime(_now.year, _now.month + 2, 1));
  void _refresh() {
    ref.invalidate(goalsProvider);
    ref.invalidate(focusBundleProvider);
    ref.invalidate(focusGroupsProvider);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Stack(children: [
          const Positioned.fill(child: CalendarBackdrop()),
          SafeArea(
              child: Column(children: [
            Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 10, 4),
                child: Row(children: [
                  const Expanded(
                      child: Text('每日成長',
                          style: TextStyle(
                              fontSize: 24, fontWeight: FontWeight.w800))),
                  IconButton(
                      onPressed: _refresh,
                      tooltip: '重新整理',
                      icon: const Icon(Icons.refresh_rounded)),
                ])),
            TabBar(controller: _tabs, tabs: const [
              Tab(text: '打卡', icon: Icon(Icons.verified_rounded)),
              Tab(text: '專注', icon: Icon(Icons.timer_rounded)),
              Tab(text: '群組', icon: Icon(Icons.leaderboard_rounded))
            ]),
            Expanded(
                child: TabBarView(
                    controller: _tabs,
                    children: [_goals(), _focus(), _groups()])),
          ])),
        ]),
        bottomNavigationBar: NavigationBar(
            selectedIndex: 1,
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
              if (index == 0) context.go('/');
              if (index == 2) context.push('/coordinate');
              if (index == 3) context.push('/settings');
            }),
      );

  Widget _goals() {
    final goals = ref.watch(goalsProvider(_range));
    return goals.when(
      loading: () => const Center(child: CircularProgressIndicator.adaptive()),
      error: (error, _) => _error(error),
      data: (items) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(goalsProvider(_range)),
          child: ListView(padding: const EdgeInsets.all(14), children: [
            Row(children: [
              const Expanded(
                  child: Text('今天要完成',
                      style: TextStyle(
                          fontSize: 18, fontWeight: FontWeight.w700))),
              IconButton(
                  onPressed: _acceptGoal,
                  tooltip: '輸入 Goal 邀請碼',
                  icon: const Icon(Icons.vpn_key_rounded)),
              FilledButton.icon(
                  onPressed: _createGoal,
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('Goal'))
            ]),
            const SizedBox(height: 12),
            if (items.where((item) => item.archivedAt == null).isEmpty)
              const GlassPanel(child: Text('還沒有 Goal。建立一個每天想持續的習慣。')),
            ...items.where((item) => item.archivedAt == null).map((goal) {
              final userId = ref.read(apiClientProvider).userId ?? '';
              final checked = goal.checkedOn(_now, userId);
              return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: GlassPanel(
                      child: Row(children: [
                    _stamp(goal, checked),
                    const SizedBox(width: 12),
                    Expanded(
                        child: InkWell(
                            onTap: () => _showGoal(goal),
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(goal.title,
                                      style: const TextStyle(
                                          fontSize: 17,
                                          fontWeight: FontWeight.w700)),
                                  Text(
                                      '${goal.mode == 'shared' ? '共同 Goal' : '個人分享'} · 連續 ${goal.streak(_now, userId)} 天',
                                      style: TextStyle(
                                          color: Colors.white
                                              .withValues(alpha: .58),
                                          fontSize: 12))
                                ]))),
                    if (goal.role != 'viewer')
                      Checkbox(
                          value: checked,
                          onChanged: (value) async {
                            await ref
                                .read(productivityRepositoryProvider)
                                .setCheckin(goal.id, _now, value == true);
                            ref.invalidate(goalsProvider(_range));
                          }),
                    PopupMenuButton<String>(
                        onSelected: (value) async {
                          if (value == 'invite') await _inviteGoal(goal);
                          if (value == 'reminder') {
                            final time =
                                await _simpleText('每日提醒', '24 小時制，例如 20:30');
                            if (time != null &&
                                RegExp(r'^([01]\d|2[0-3]):[0-5]\d$')
                                    .hasMatch(time)) {
                              await ref
                                  .read(productivityRepositoryProvider)
                                  .setGoalReminder(goal, time);
                              ref.invalidate(goalsProvider(_range));
                            }
                          }
                          if (value == 'disableReminder') {
                            await ref
                                .read(productivityRepositoryProvider)
                                .setGoalReminder(goal, null);
                            ref.invalidate(goalsProvider(_range));
                          }
                          if (value == 'archive') {
                            await ref
                                .read(productivityRepositoryProvider)
                                .archiveGoal(goal);
                            ref.invalidate(goalsProvider(_range));
                          }
                        },
                        itemBuilder: (_) => [
                              const PopupMenuItem(
                                  value: 'invite', child: Text('邀請朋友')),
                              if (goal.role == 'owner')
                                const PopupMenuItem(
                                    value: 'reminder', child: Text('設定每日提醒')),
                              if (goal.role == 'owner' &&
                                  goal.reminderTime != null)
                                const PopupMenuItem(
                                    value: 'disableReminder',
                                    child: Text('關閉每日提醒')),
                              if (goal.role == 'owner')
                                const PopupMenuItem(
                                    value: 'archive', child: Text('封存 Goal')),
                            ]),
                  ])));
            }),
          ])),
    );
  }

  Widget _focus() {
    final bundle = ref.watch(focusBundleProvider(_range));
    final local = ref.read(productivityRepositoryProvider).activeLocalTimer();
    return bundle.when(
        loading: () =>
            const Center(child: CircularProgressIndicator.adaptive()),
        error: (error, _) => _error(error),
        data: (data) {
          final activeSeconds = local == null
              ? 0
              : (local['segments'] as List).whereType<Map>().fold<int>(0,
                  (sum, raw) {
                  final item = Map<String, dynamic>.from(raw);
                  final start = DateTime.parse(item['start'] as String);
                  final end =
                      DateTime.tryParse(item['end']?.toString() ?? '') ?? _now;
                  return sum + end.difference(start).inSeconds;
                });
          return ListView(padding: const EdgeInsets.all(14), children: [
            GlassPanel(
                child: Column(children: [
              Text(local?['subjectName']?.toString() ?? '選一個科目開始',
                  style: const TextStyle(
                      fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Text(_duration(activeSeconds),
                  style: const TextStyle(
                      fontSize: 42,
                      fontWeight: FontWeight.w800,
                      fontFeatures: [FontFeature.tabularFigures()])),
              const SizedBox(height: 10),
              if (local != null)
                Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  OutlinedButton.icon(
                      onPressed: () async {
                        local['status'] == 'paused'
                            ? await ref
                                .read(productivityRepositoryProvider)
                                .resumeTimer()
                            : await ref
                                .read(productivityRepositoryProvider)
                                .pauseTimer();
                        setState(() {});
                      },
                      icon: Icon(local['status'] == 'paused'
                          ? Icons.play_arrow_rounded
                          : Icons.pause_rounded),
                      label: Text(local['status'] == 'paused' ? '繼續' : '暫停')),
                  const SizedBox(width: 12),
                  FilledButton.icon(
                      onPressed: () async {
                        await ref
                            .read(productivityRepositoryProvider)
                            .stopTimer();
                        ref.invalidate(focusBundleProvider(_range));
                        setState(() {});
                      },
                      icon: const Icon(Icons.stop_rounded),
                      label: const Text('停止')),
                ]),
            ])),
            const SizedBox(height: 14),
            Row(children: [
              const Expanded(
                  child: Text('科目',
                      style: TextStyle(
                          fontSize: 18, fontWeight: FontWeight.w700))),
              TextButton.icon(
                  onPressed: _createSubject,
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('新增')),
              TextButton(
                  onPressed: data.subjects.isEmpty
                      ? null
                      : () => _manual(data.subjects),
                  child: const Text('補登'))
            ]),
            Wrap(
                spacing: 8,
                runSpacing: 8,
                children: data.subjects
                    .where((item) => item.archivedAt == null)
                    .map((subject) => InputChip(
                        avatar: CircleAvatar(
                            backgroundColor: _color(subject.color), radius: 7),
                        label: Text(subject.name),
                        deleteIcon:
                            const Icon(Icons.more_horiz_rounded, size: 18),
                        onDeleted: () => _subjectActions(subject),
                        onPressed: local == null
                            ? () async {
                                await ref
                                    .read(productivityRepositoryProvider)
                                    .startTimer(subject);
                                setState(() {});
                              }
                            : null))
                    .toList()),
            const SizedBox(height: 18),
            const Text('最近紀錄',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            ...data.sessions
                .where((item) => item.status == 'completed')
                .take(20)
                .map((session) {
              final subject = data.subject(session.subjectId);
              final started = DateFormat('M/d HH:mm').format(session.startedAt);
              final source = session.source == 'manual' ? ' · 補登（不入榜）' : '';
              final conflict = session.conflicted ? ' · 重疊待確認' : '';
              return ListTile(
                leading: CircleAvatar(
                  backgroundColor: _color(subject?.color ?? 'blue'),
                  child: const Icon(Icons.timer_outlined, size: 18),
                ),
                title: Text(subject?.name ?? '已封存科目'),
                subtitle: Text('$started$source$conflict'),
                trailing: Text(_duration(session.seconds(_now))),
              );
            }),
          ]);
        });
  }

  Widget _groups() {
    final groups = ref.watch(focusGroupsProvider);
    return groups.when(
      loading: () => const Center(child: CircularProgressIndicator.adaptive()),
      error: (error, _) => _error(error),
      data: (items) => ListView(
        padding: const EdgeInsets.all(14),
        children: [
          Row(children: [
            const Expanded(
              child: Text('專注群組',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            ),
            FilledButton.icon(
              onPressed: _createGroup,
              icon: const Icon(Icons.add_rounded),
              label: const Text('建立'),
            ),
            IconButton(
              onPressed: _acceptGroup,
              tooltip: '輸入群組邀請碼',
              icon: const Icon(Icons.vpn_key_rounded),
            ),
          ]),
          const SizedBox(height: 12),
          if (items.isEmpty)
            const GlassPanel(
              child: Text('建立群組後，可以看日／週／月總時數排行和朋友的專注狀態。'),
            ),
          ...items.map(
            (group) => Card(
              child: ListTile(
                leading: const Icon(Icons.groups_rounded),
                title: Text(group.name),
                subtitle: const Text('查看本週排行榜'),
                onTap: () => _showRanking(group),
                trailing: PopupMenuButton<String>(
                  onSelected: (value) async {
                    if (value == 'invite') await _inviteGroup(group);
                    if (value == 'members') await _showGroupMembers(group);
                    if (value == 'leave') {
                      await ref
                          .read(productivityRepositoryProvider)
                          .leaveGroup(group.id);
                      ref.invalidate(focusGroupsProvider);
                    }
                  },
                  itemBuilder: (_) => [
                    if (group.canManage)
                      const PopupMenuItem(value: 'invite', child: Text('邀請朋友')),
                    if (group.canManage)
                      const PopupMenuItem(
                          value: 'members', child: Text('管理成員')),
                    if (!group.canManage)
                      const PopupMenuItem(value: 'leave', child: Text('退出群組')),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _error(Object error) => Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text(error.toString()),
        TextButton(onPressed: _refresh, child: const Text('重試'))
      ]));
  Widget _stamp(Goal goal, bool checked) => Container(
      width: 46,
      height: 46,
      decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: _color(goal.color).withValues(alpha: checked ? .8 : .12),
          border: Border.all(
              color: _color(goal.color).withValues(alpha: .75), width: 2)),
      child: Icon(_goalIcon(goal.icon),
          color: checked ? Colors.white : _color(goal.color)));

  Future<void> _createGoal() async {
    final result = await _textDialog('建立 Goal', hint: '例如：讀書', extra: true);
    if (result == null) return;
    await ref.read(productivityRepositoryProvider).createGoal(
        title: result.$1,
        color: result.$2,
        icon: 'star',
        mode: result.$3 ? 'shared' : 'personal');
    ref.invalidate(goalsProvider(_range));
  }

  Future<void> _createSubject() async {
    final result = await _textDialog('新增科目', hint: '例如：英文');
    if (result == null) return;
    await ref
        .read(productivityRepositoryProvider)
        .createSubject(result.$1, result.$2);
    ref.invalidate(focusBundleProvider(_range));
  }

  Future<void> _createGroup() async {
    final result = await _simpleText('建立專注群組', '群組名稱');
    if (result == null) return;
    await ref.read(productivityRepositoryProvider).createGroup(result);
    ref.invalidate(focusGroupsProvider);
  }

  Future<void> _subjectActions(Subject subject) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      builder: (_) => SafeArea(
        child: Wrap(children: [
          ListTile(
              leading: const Icon(Icons.edit_rounded),
              title: const Text('改名或改色'),
              onTap: () => Navigator.pop(context, 'edit')),
          ListTile(
              leading: const Icon(Icons.archive_rounded),
              title: const Text('封存科目'),
              onTap: () => Navigator.pop(context, 'archive')),
        ]),
      ),
    );
    if (action == null || !mounted) return;
    if (action == 'archive') {
      await ref.read(productivityRepositoryProvider).updateSubject(subject,
          name: subject.name, color: subject.color, archived: true);
    } else {
      final result = await _textDialog('修改科目', hint: subject.name);
      if (result == null) return;
      await ref
          .read(productivityRepositoryProvider)
          .updateSubject(subject, name: result.$1, color: result.$2);
    }
    ref.invalidate(focusBundleProvider(_range));
  }

  Future<void> _inviteGoal(Goal goal) async {
    final email = await _simpleText('邀請朋友一起打卡', '朋友的 Email');
    if (email == null) return;
    final token = await ref
        .read(productivityRepositoryProvider)
        .inviteGoal(goal.id, email);
    if (mounted) _message('邀請碼：$token');
  }

  Future<void> _inviteGroup(FocusGroup group) async {
    final email = await _simpleText('邀請朋友加入群組', '朋友的 Email');
    if (email == null) return;
    final token = await ref
        .read(productivityRepositoryProvider)
        .inviteGroup(group.id, email);
    if (mounted) _message('邀請碼：$token');
  }

  Future<void> _acceptGoal() async {
    final token = await _simpleText('加入 Goal', '邀請碼');
    if (token == null) return;
    await ref.read(productivityRepositoryProvider).acceptGoalInvite(token);
    ref.invalidate(goalsProvider(_range));
    if (mounted) _message('已加入 Goal');
  }

  Future<void> _acceptGroup() async {
    final token = await _simpleText('加入專注群組', '邀請碼');
    if (token == null) return;
    await ref.read(productivityRepositoryProvider).acceptGroupInvite(token);
    ref.invalidate(focusGroupsProvider);
    if (mounted) _message('已加入群組');
  }

  Future<void> _showGoal(Goal goal) async {
    final userId = ref.read(apiClientProvider).userId ?? '';
    final monthStart = DateTime(_now.year, _now.month, 1);
    final elapsed = _now.difference(monthStart).inDays + 1;
    final mine = goal.checkins
        .where(
            (item) => item.userId == userId && !item.date.isBefore(monthStart))
        .length;
    final rate = (mine / elapsed * 100).clamp(0, 100).round();
    await showModalBottomSheet<void>(
      context: context,
      builder: (_) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.all(18),
          children: [
            Text(goal.title,
                style:
                    const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            Text('本月完成率 $rate% · 連續 ${goal.streak(_now, userId)} 天'),
            const Divider(height: 28),
            const Text('成員紀錄',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            ...goal.members.map((member) {
              final count = goal.checkins
                  .where((item) => item.userId == member.userId)
                  .length;
              return ListTile(
                leading: const Icon(Icons.person_outline_rounded),
                title: Text(member.displayName),
                subtitle: Text(member.role),
                trailing: Text('$count 次'),
              );
            }),
          ],
        ),
      ),
    );
  }

  Future<void> _manual(List<Subject> subjects) async {
    final chosen = await showModalBottomSheet<Subject>(
        context: context,
        builder: (_) => SafeArea(
            child: ListView(
                shrinkWrap: true,
                children: subjects
                    .map((subject) => ListTile(
                        title: Text(subject.name),
                        onTap: () => Navigator.pop(context, subject)))
                    .toList())));
    if (chosen == null || !mounted) return;
    final minutes = await _simpleText('補登 ${chosen.name}', '分鐘，例如 45');
    final value = int.tryParse(minutes ?? '');
    if (value == null || value <= 0 || value > 1440) return;
    final end = DateTime.now();
    await ref
        .read(productivityRepositoryProvider)
        .addManual(chosen.id, end.subtract(Duration(minutes: value)), end);
    ref.invalidate(focusBundleProvider(_range));
  }

  Future<void> _showRanking(FocusGroup group) async {
    final now = DateTime.now();
    final start = DateTime(now.year, now.month, now.day)
        .subtract(Duration(days: now.weekday - 1));
    final rows = await ref
        .read(productivityRepositoryProvider)
        .ranking(group.id, start, start.add(const Duration(days: 7)));
    if (!mounted) return;
    await showModalBottomSheet<void>(
        context: context,
        builder: (_) => SafeArea(
                child: ListView(
                    shrinkWrap: true,
                    padding: const EdgeInsets.all(16),
                    children: [
                  Text('${group.name} · 本週',
                      style: const TextStyle(
                          fontSize: 20, fontWeight: FontWeight.w800)),
                  ...rows.map((row) => ListTile(
                      leading: CircleAvatar(child: Text('${row.rank}')),
                      title: Text(row.displayName),
                      subtitle: row.isFocusing
                          ? const Text('正在專注',
                              style: TextStyle(color: Color(0xFFA8E6B7)))
                          : null,
                      trailing: Text(_duration(row.seconds))))
                ])));
  }

  Future<void> _showGroupMembers(FocusGroup group) async {
    await showModalBottomSheet<void>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.all(16),
          children: [
            Text('${group.name} · 成員',
                style:
                    const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            ...group.members.map((member) => ListTile(
                  title: Text(member.displayName),
                  subtitle: Text(member.role),
                  trailing: member.role == 'owner'
                      ? null
                      : IconButton(
                          tooltip: '移除成員',
                          icon: const Icon(Icons.person_remove_rounded),
                          onPressed: () async {
                            await ref
                                .read(productivityRepositoryProvider)
                                .removeGroupMember(group.id, member.userId);
                            ref.invalidate(focusGroupsProvider);
                            if (sheetContext.mounted) {
                              Navigator.pop(sheetContext);
                            }
                          },
                        ),
                )),
          ],
        ),
      ),
    );
  }

  Future<(String, String, bool)?> _textDialog(String title,
      {required String hint, bool extra = false}) async {
    final controller = TextEditingController();
    var selected = 'blue';
    var shared = false;
    return showDialog<(String, String, bool)>(
        context: context,
        builder: (context) => StatefulBuilder(
            builder: (context, setDialog) => AlertDialog(
                    title: Text(title),
                    content: Column(mainAxisSize: MainAxisSize.min, children: [
                      TextField(
                          controller: controller,
                          autofocus: true,
                          decoration: InputDecoration(labelText: hint)),
                      const SizedBox(height: 12),
                      Wrap(
                          spacing: 8,
                          children: [
                            'blue',
                            'peach',
                            'lilac',
                            'sage',
                            'rose',
                            'amber'
                          ]
                              .map((item) => ChoiceChip(
                                  label: CircleAvatar(
                                      backgroundColor: _color(item), radius: 8),
                                  selected: selected == item,
                                  onSelected: (_) =>
                                      setDialog(() => selected = item)))
                              .toList()),
                      if (extra)
                        SwitchListTile(
                            title: const Text('共同 Goal'),
                            subtitle: const Text('每位成員各自打卡'),
                            value: shared,
                            onChanged: (value) =>
                                setDialog(() => shared = value))
                    ]),
                    actions: [
                      TextButton(
                          onPressed: () => Navigator.pop(context),
                          child: const Text('取消')),
                      FilledButton(
                          onPressed: () {
                            final value = controller.text.trim();
                            if (value.isNotEmpty)
                              Navigator.pop(context, (value, selected, shared));
                          },
                          child: const Text('建立'))
                    ])));
  }

  Future<String?> _simpleText(String title, String label) async {
    final controller = TextEditingController();
    return showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
                title: Text(title),
                content: TextField(
                    controller: controller,
                    autofocus: true,
                    decoration: InputDecoration(labelText: label)),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('取消')),
                  FilledButton(
                      onPressed: () {
                        if (controller.text.trim().isNotEmpty)
                          Navigator.pop(context, controller.text.trim());
                      },
                      child: const Text('確定'))
                ]));
  }

  void _message(String value) => ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text(value)));
}

String _duration(int seconds) {
  final hours = seconds ~/ 3600;
  final minutes = (seconds % 3600) ~/ 60;
  final rest = seconds % 60;
  return '${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}:${rest.toString().padLeft(2, '0')}';
}

Color _color(String value) => switch (value) {
      'sage' => const Color(0xFF75C897),
      'peach' => const Color(0xFFE7A06F),
      'lilac' => const Color(0xFFAF8FE3),
      'rose' => const Color(0xFFE37E9A),
      'amber' => const Color(0xFFE3B45D),
      _ => const Color(0xFF6FADE7)
    };
IconData _goalIcon(String value) => switch (value) {
      'book' => Icons.menu_book_rounded,
      'fitness' => Icons.fitness_center_rounded,
      'water' => Icons.water_drop_rounded,
      _ => Icons.star_rounded
    };
