import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';

import '../models/coordination.dart';
import '../state/providers.dart';
import '../services/api_client.dart';
import '../widgets/glass.dart';
import 'ai_coordination_screen.dart';
import '../widgets/ai_media.dart';

class CoordinationScreen extends ConsumerWidget {
  const CoordinationScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final gatherings = ref.watch(gatheringsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('邀約'),
        actions: [
          IconButton(
              tooltip: 'AI 建立邀約',
              icon: const Icon(Icons.auto_awesome),
              onPressed: () async {
                final id = await Navigator.of(context).push<String>(
                    MaterialPageRoute(
                        builder: (_) => const AiCoordinationScreen()));
                if (id != null && context.mounted)
                  Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => GatheringDetailScreen(id: id)));
              }),
          IconButton(
            tooltip: '貼上邀請連結',
            icon: const Icon(Icons.link_rounded),
            onPressed: () => _joinFromClipboard(context),
          ),
        ],
      ),
      body: gatherings.when(
        loading: () =>
            const Center(child: CircularProgressIndicator.adaptive()),
        error: (_, __) => _Retry(
            message: '目前無法載入邀約',
            onRetry: () => ref.invalidate(gatheringsProvider)),
        data: (items) {
          final active = items
              .where((item) => ![
                    GatheringStatus.finalized,
                    GatheringStatus.cancelled
                  ].contains(item.status))
              .toList();
          final ended = items
              .where((item) => [
                    GatheringStatus.finalized,
                    GatheringStatus.cancelled
                  ].contains(item.status))
              .toList();
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(gatheringsProvider),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
              children: [
                if (active.isNotEmpty) ...[
                  const _SectionTitle(title: '進行中'),
                  ...active.map((item) => _GatheringCard(item: item)),
                ],
                if (ended.isNotEmpty) ...[
                  const _SectionTitle(title: '已結束'),
                  ...ended.map((item) => _GatheringCard(item: item)),
                ],
                if (active.isEmpty && ended.isEmpty) const _EmptyGatherings(),
              ],
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _createGathering(context, ref),
        icon: const Icon(Icons.add_rounded),
        label: const Text('建立邀約'),
      ),
    );
  }

  Future<void> _createGathering(BuildContext context, WidgetRef ref) async {
    final key = aiRequestKey();
    final id = await showModalBottomSheet<String>(
        context: context,
        isScrollControlled: true,
        isDismissible: false,
        enableDrag: false,
        backgroundColor: Colors.transparent,
        builder: (_) => _CreateGatheringSheet(onSave: (input) async {
              final item = await ref
                  .read(coordinationRepositoryProvider)
                  .create(
                      name: input.name,
                      dateStart: input.dateStart,
                      dateEnd: input.dateEnd,
                      dailyStart: input.dailyStart,
                      dailyEnd: input.dailyEnd,
                      duration: input.duration,
                      deadline: input.deadline,
                      idempotencyKey: key);
              ref.invalidate(gatheringsProvider);
              return item.id;
            }));
    if (id != null && context.mounted)
      Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => GatheringDetailScreen(id: id)));
  }

  Future<void> _joinFromClipboard(BuildContext context) async {
    final value =
        (await Clipboard.getData(Clipboard.kTextPlain))?.text?.trim() ?? '';
    final match =
        RegExp(r'(?:invite=|/join/)([A-Za-z0-9_-]+)').firstMatch(value);
    if (match == null) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('請先複製有效的邀請連結')));
      }
      return;
    }
    if (context.mounted)
      Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => JoinScreen(token: match.group(1)!)));
  }
}

class GatheringDetailScreen extends ConsumerStatefulWidget {
  const GatheringDetailScreen({super.key, required this.id});
  final String id;

  @override
  ConsumerState<GatheringDetailScreen> createState() =>
      _GatheringDetailScreenState();
}

class _GatheringDetailScreenState extends ConsumerState<GatheringDetailScreen> {
  Map<String, String> _cells = {};
  String _draftVersion = '1';
  bool _saving = false;
  bool _editing = false;
  String? _message;

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(gatheringProvider(widget.id));
    return Scaffold(
      appBar: AppBar(
        title: const Text('邀約詳情'),
        actions: [
          IconButton(
              tooltip: '重新載入草稿',
              icon: const Icon(Icons.refresh),
              onPressed: _saving ? null : _reloadDraft),
          if (value.valueOrNull != null)
            IconButton(
                tooltip: '分享邀請',
                icon: const Icon(Icons.ios_share_rounded),
                onPressed: () => _share(value.valueOrNull!)),
        ],
      ),
      body: value.when(
        loading: () =>
            const Center(child: CircularProgressIndicator.adaptive()),
        error: (error, _) => _Retry(
            message: errorMessage(error, '無法載入邀約'),
            onRetry: () => ref.invalidate(gatheringProvider(widget.id))),
        data: (gathering) {
          if (_draftVersion == '1' && gathering.draft.version != '1') {
            _draftVersion = gathering.draft.version;
          }
          if (_cells.isEmpty && gathering.draft.cells.isNotEmpty) {
            _cells = {...gathering.draft.cells};
          }
          final userId = ref.read(apiClientProvider).userId;
          final isHost = gathering.hostId == userId ||
              gathering.members
                  .any((member) => member.isHost && member.id == userId);
          final canEdit = (gathering.status == GatheringStatus.open ||
                  gathering.status == GatheringStatus.draft ||
                  gathering.status == GatheringStatus.calculated) &&
              DateTime.now().isBefore(gathering.deadline);
          final showEditor = canEdit && (!gathering.submitted || _editing);
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(gatheringProvider(widget.id)),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
              children: [
                GlassPanel(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text(gathering.name,
                          style: const TextStyle(
                              fontSize: 24, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 8),
                      Text(
                          '${_date(gathering.dateStart)} – ${_date(gathering.dateEnd)} · ${gathering.durationMinutes} 分鐘'),
                      Text(
                          '每天 ${gathering.dailyStart}–${gathering.dailyEnd} · 截止 ${DateFormat('M/d HH:mm').format(gathering.deadline.toLocal())}',
                          style: TextStyle(
                              color: Colors.white.withValues(alpha: .65),
                              fontSize: 12)),
                      const SizedBox(height: 14),
                      _StatusPill(status: gathering.status),
                      const SizedBox(height: 14),
                      Row(children: [
                        const Icon(Icons.people_alt_outlined, size: 18),
                        const SizedBox(width: 6),
                        Text(
                            '${gathering.members.where((m) => m.status != 'left').length}/10 人'),
                        const Spacer(),
                        Text(
                            '${gathering.submittedCount}/${gathering.members.where((m) => m.status != 'left').length} 人已提交',
                            style: TextStyle(
                                color: Colors.white.withValues(alpha: .65),
                                fontSize: 12)),
                      ]),
                    ])),
                const SizedBox(height: 12),
                if (isHost && canEdit)
                  OutlinedButton.icon(
                      icon: const Icon(Icons.auto_awesome),
                      label: const Text('AI 調整邀約'),
                      onPressed: _saving
                          ? null
                          : () async {
                              final id = await Navigator.of(context)
                                  .push<String>(MaterialPageRoute(
                                      builder: (_) => AiCoordinationScreen(
                                          gatheringId: widget.id)));
                              if (id != null && mounted)
                                setState(() {
                                  _cells = {};
                                  _draftVersion = '1';
                                });
                            }),
                if (showEditor) ...[
                  OutlinedButton.icon(
                      icon: const Icon(Icons.auto_awesome),
                      label: const Text('截圖／語音帶入'),
                      onPressed: _saving
                          ? null
                          : () async {
                              setState(() => _saving = true);
                              try {
                                final saved = await ref
                                    .read(coordinationRepositoryProvider)
                                    .saveDraft(
                                        widget.id, _draftVersion, _cells);
                                _draftVersion = saved.version;
                                if (saved.isPendingSync)
                                  throw const ApiException(
                                      503, 'OFFLINE', '請連線並同步草稿後再使用 AI');
                                if (!context.mounted) return;
                                final applied = await Navigator.of(context)
                                    .push<bool>(MaterialPageRoute(
                                        builder: (_) => AiAvailabilityScreen(
                                            gatheringId: widget.id,
                                            version: saved.version,
                                            startDate:
                                                _date(gathering.dateStart),
                                            endDate:
                                                _date(gathering.dateEnd))));
                                if (applied == true && mounted)
                                  setState(() {
                                    _cells = {};
                                    _draftVersion = '1';
                                  });
                              } catch (e) {
                                if (mounted)
                                  setState(() => _message = e.toString());
                              } finally {
                                if (mounted) setState(() => _saving = false);
                              }
                            }),
                  _AvailabilityEditor(
                      start: gathering.dateStart,
                      end: gathering.dateEnd,
                      dailyStart: gathering.dailyStart,
                      dailyEnd: gathering.dailyEnd,
                      cells: _cells,
                      onImport: _importPersonalCalendar,
                      onChanged: (next) => setState(() => _cells = next)),
                  const SizedBox(height: 10),
                  Row(children: [
                    Expanded(
                        child: OutlinedButton(
                            onPressed:
                                _saving ? null : () => _saveDraft(gathering),
                            child: const Text('儲存草稿'))),
                    const SizedBox(width: 10),
                    Expanded(
                        child: FilledButton(
                            onPressed:
                                _saving ? null : () => _submit(gathering),
                            child: const Text('提交時間'))),
                  ]),
                ] else if (canEdit) ...[
                  const _InfoCard(
                      icon: Icons.check_circle_outline_rounded,
                      text: '你已提交時間；截止前仍可重新編輯。'),
                  const SizedBox(height: 8),
                  OutlinedButton(
                      onPressed: () => setState(() => _editing = true),
                      child: const Text('重新編輯')),
                ] else if (gathering.status == GatheringStatus.open ||
                    gathering.status == GatheringStatus.draft) ...[
                  const _InfoCard(
                      icon: Icons.lock_clock_rounded,
                      text: '回覆已截止，這場邀約正在計算推薦結果。'),
                ],
                if (isHost) ...[
                  const SizedBox(height: 12),
                  GlassPanel(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                        const Text('主揪操作',
                            style: TextStyle(
                                fontSize: 16, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 8),
                        if (gathering.status != GatheringStatus.finalized &&
                            gathering.status != GatheringStatus.cancelled)
                          FilledButton.tonalIcon(
                              onPressed: _saving
                                  ? null
                                  : () => _recalculate(gathering),
                              icon: const Icon(Icons.auto_awesome_rounded),
                              label: const Text('更新推薦結果')),
                        if (gathering.status != GatheringStatus.finalized &&
                            gathering.status != GatheringStatus.cancelled)
                          OutlinedButton.icon(
                            onPressed:
                                _saving ? null : () => _cancel(gathering),
                            icon: const Icon(Icons.cancel_outlined),
                            label: const Text('取消邀約'),
                          ),
                        if (gathering.candidates.isNotEmpty) ...[
                          const SizedBox(height: 10),
                          for (final candidate in gathering.candidates)
                            _CandidateTile(
                                candidate: candidate,
                                selected:
                                    gathering.finalCandidateId == candidate.id,
                                onTap: gathering.status ==
                                        GatheringStatus.finalized
                                    ? null
                                    : () => _finalize(gathering, candidate)),
                        ],
                      ])),
                ],
                if (gathering.finalCandidateId != null &&
                    gathering.candidates.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  _InfoCard(
                      icon: Icons.event_available_rounded,
                      text:
                          '時間已拍板：${DateFormat('M/d HH:mm').format(gathering.candidates.firstWhere((c) => c.id == gathering.finalCandidateId, orElse: () => gathering.candidates.first).startsAt.toLocal())}'),
                  const SizedBox(height: 8),
                  FilledButton.icon(
                      onPressed:
                          _saving ? null : () => _addToCalendar(gathering),
                      icon: const Icon(Icons.event_rounded),
                      label: const Text('加入我的日曆')),
                ],
                if (_message != null)
                  Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(_message!,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              color: Colors.white.withValues(alpha: .75)))),
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> _reloadDraft() async {
    final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
                title: const Text('重新載入草稿？'),
                content: const Text('成功載入後會取代本機尚未同步的填寫。'),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('保留填寫')),
                  FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('重新載入'))
                ]));
    if (confirmed != true || !mounted) return;
    setState(() => _saving = true);
    try {
      final draft =
          await ref.read(coordinationRepositoryProvider).reloadDraft(widget.id);
      if (!mounted) return;
      setState(() {
        _cells = {...draft.cells};
        _draftVersion = draft.version;
        _message = '已載入最新草稿';
      });
      ref.invalidate(gatheringProvider(widget.id));
    } catch (error) {
      if (mounted)
        setState(() => _message = errorMessage(error, '載入失敗，本機填寫仍保留'));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<bool> _saveDraft(GatheringDetails gathering) async {
    setState(() {
      _saving = true;
      _message = null;
    });
    try {
      final draft = await ref
          .read(coordinationRepositoryProvider)
          .saveDraft(widget.id, _draftVersion, _cells);
      if (!mounted) return false;
      setState(() {
        _draftVersion = draft.version;
        _cells = {...draft.cells};
        _message = draft.isPendingSync ? '離線草稿已保存，連線後會同步' : '草稿已儲存';
      });
      return !draft.isPendingSync;
    } catch (error) {
      if (mounted)
        setState(() => _message = errorMessage(error, '草稿儲存失敗，輸入已保留；請重新載入'));
      return false;
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String _statusLabel(String value) =>
      const {
        'green': '可以',
        'yellow': '待確認',
        'red': '不行',
        'unknown': '未填'
      }[value] ??
      '未填';

  Future<void> _importPersonalCalendar() async {
    if (_saving) return;
    setState(() {
      _saving = true;
      _message = null;
    });
    try {
      final saved = await ref
          .read(coordinationRepositoryProvider)
          .saveDraft(widget.id, _draftVersion, _cells);
      _draftVersion = saved.version;
      if (saved.isPendingSync)
        throw const ApiException(503, 'OFFLINE', '請先連線同步草稿');
      final preview = await ref
          .read(coordinationRepositoryProvider)
          .personalCalendarPreview(widget.id);
      final changes = (preview['changes'] as List? ?? const [])
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
      if (!mounted) return;
      if (changes.isEmpty) {
        setState(() => _message = '目前沒有可帶入的忙碌時段');
        return;
      }
      final keys = changes
          .where((item) => item['before'] == 'unknown')
          .map((item) => item['key'].toString())
          .toSet();
      final selected = await showDialog<List<String>>(
        context: context,
        builder: (_) => StatefulBuilder(
            builder: (context, update) => AlertDialog(
                  title: const Text('帶入我的行程'),
                  content: SizedBox(
                      width: 400,
                      child: SingleChildScrollView(
                          child:
                              Column(mainAxisSize: MainAxisSize.min, children: [
                        const Text('只勾選未填格；既有選擇需另外勾選才覆蓋。'),
                        ...changes.map((item) => CheckboxListTile(
                            value: keys.contains(item['key']),
                            onChanged: (value) => update(() {
                                  value == true
                                      ? keys.add(item['key'].toString())
                                      : keys.remove(item['key']);
                                }),
                            title: Text(item['key'].toString()),
                            subtitle: Text(
                                '${_statusLabel(item['before'].toString())} → ${_statusLabel(item['after'].toString())}'))),
                      ]))),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(context),
                        child: const Text('取消')),
                    FilledButton(
                        onPressed: keys.isEmpty
                            ? null
                            : () => Navigator.pop(context, keys.toList()),
                        child: const Text('確認套用'))
                  ],
                )),
      );
      if (selected == null || !mounted) return;
      final draft = await ref
          .read(coordinationRepositoryProvider)
          .applyPersonalCalendar(widget.id, _draftVersion, selected);
      setState(() {
        _draftVersion = draft.version;
        _cells = {...draft.cells};
        _message = '已帶入行程差異，請檢查後提交';
      });
    } catch (error) {
      if (mounted) setState(() => _message = errorMessage(error, '無法帶入個人行程'));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _submit(GatheringDetails gathering) async {
    if (!await _saveDraft(gathering) || !mounted) return;
    setState(() => _saving = true);
    try {
      await ref
          .read(coordinationRepositoryProvider)
          .submit(widget.id, _draftVersion, _cells);
      ref.invalidate(gatheringProvider(widget.id));
      setState(() {
        _editing = false;
        _message = '已提交，截止前可以修改';
      });
    } catch (error) {
      setState(() => _message = errorMessage(error, '提交失敗，請重試'));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _recalculate(GatheringDetails gathering) async {
    setState(() {
      _saving = true;
      _message = null;
    });
    try {
      await ref.read(coordinationRepositoryProvider).recalculate(widget.id);
      ref.invalidate(gatheringProvider(widget.id));
    } catch (error) {
      setState(() => _message = errorMessage(error, '目前無法更新推薦'));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _cancel(GatheringDetails gathering) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('取消這場邀約？'),
        content: const Text('取消後成員將不能再加入或提交時間。'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('保留')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('取消邀約')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() {
      _saving = true;
      _message = null;
    });
    try {
      await ref.read(coordinationRepositoryProvider).cancel(widget.id);
      ref.invalidate(gatheringProvider(widget.id));
      ref.invalidate(gatheringsProvider);
    } catch (error) {
      if (mounted) setState(() => _message = errorMessage(error, '取消失敗，請重新載入'));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _finalize(
      GatheringDetails gathering, Candidate candidate) async {
    if (gathering.snapshotId == null) return;
    final unanswered = candidate.participantScores
        .where((item) => item['submitted'] != true)
        .length;
    final conflicts = candidate.participantScores
        .where((item) => item['hasConflict'] == true)
        .length;
    final confirm = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
              title: const Text('拍板這個時間？'),
              content: Text([
                DateFormat('M/d HH:mm').format(candidate.startsAt.toLocal()),
                if (unanswered > 0) '未回覆 $unanswered 人',
                if (conflicts > 0) '不行 $conflicts 人',
                if (candidate.participantScores
                    .any((item) => item['hasUnknown'] == true))
                  '包含未填時段',
              ].join(' · ')),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('取消')),
                FilledButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: const Text('拍板')),
              ],
            ));
    if (confirm != true) return;
    setState(() => _saving = true);
    try {
      await ref.read(coordinationRepositoryProvider).finalize(widget.id,
          snapshotId: gathering.snapshotId!,
          candidateId: candidate.id,
          revision: gathering.revision);
      ref.invalidate(gatheringProvider(widget.id));
    } catch (error) {
      setState(() => _message = errorMessage(error, '拍板失敗，請重新計算'));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _addToCalendar(GatheringDetails gathering) async {
    final candidate = gathering.candidates.firstWhere(
        (c) => c.id == gathering.finalCandidateId,
        orElse: () => gathering.candidates.first);
    setState(() => _saving = true);
    try {
      await ref.read(coordinationRepositoryProvider).addFinalizedEvent(
          widget.id,
          candidateId: candidate.id,
          snapshotId: gathering.snapshotId ?? '');
      setState(() => _message = '已加入我的日曆');
    } catch (error) {
      setState(() => _message = errorMessage(error, '無法加入日曆'));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _share(GatheringDetails gathering) => Share.share(
      '一起約「${gathering.name}」\nhttps://yuema.app/join/${gathering.inviteToken}');
  String _date(DateTime date) =>
      DateFormat('M/d (E)', 'zh_TW').format(date.toLocal());
}

class JoinScreen extends ConsumerStatefulWidget {
  const JoinScreen({super.key, required this.token});
  final String token;
  @override
  ConsumerState<JoinScreen> createState() => _JoinScreenState();
}

class _JoinScreenState extends ConsumerState<JoinScreen> {
  bool _busy = true;
  bool _joining = false;
  Map<String, dynamic>? _invite;
  String? _error;
  @override
  void initState() {
    super.initState();
    Future.microtask(_loadInvite);
  }

  Future<void> _loadInvite() async {
    try {
      final body = await ref
          .read(coordinationRepositoryProvider)
          .previewJoin(widget.token);
      if (mounted) {
        setState(() {
          _busy = false;
          _invite = body['gathering'] is Map
              ? Map<String, dynamic>.from(body['gathering'] as Map)
              : null;
        });
      }
    } catch (error) {
      if (mounted)
        setState(() {
          _busy = false;
          _error = errorMessage(error, '無法載入邀約');
        });
    }
  }

  Future<void> _join() async {
    setState(() => _joining = true);
    try {
      final body =
          await ref.read(coordinationRepositoryProvider).join(widget.token);
      ref.invalidate(gatheringsProvider);
      final id = (body['gathering'] as Map?)?['id']?.toString();
      if (mounted && id != null)
        Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (_) => GatheringDetailScreen(id: id)));
    } catch (error) {
      if (mounted)
        setState(() {
          _joining = false;
          _error = errorMessage(error, '無法加入邀約');
        });
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
            child: Padding(
                padding: const EdgeInsets.all(24),
                child: GlassPanel(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Icon(_busy ? Icons.link_rounded : Icons.error_outline_rounded,
                      size: 42, color: const Color(0xFFA8E6B7)),
                  const SizedBox(height: 12),
                  Text(
                      _busy
                          ? '正在載入邀約…'
                          : _invite != null
                              ? '加入這場邀約？'
                              : '無法加入邀約',
                      style: const TextStyle(
                          fontSize: 20, fontWeight: FontWeight.w700)),
                  if (_invite != null) ...[
                    const SizedBox(height: 8),
                    Text(
                        '${_invite!['name'] ?? '邀約'}\n${_invite!['date_start'] ?? ''} – ${_invite!['date_end'] ?? ''}',
                        textAlign: TextAlign.center),
                    const SizedBox(height: 16),
                    FilledButton(
                        onPressed: _joining ? null : _join,
                        child: Text(_joining ? '加入中…' : '加入邀約')),
                  ],
                  if (_error != null)
                    Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(_error!, textAlign: TextAlign.center)),
                  if (!_busy && _invite == null)
                    Padding(
                        padding: const EdgeInsets.only(top: 16),
                        child: FilledButton(
                            onPressed: () => Navigator.pop(context),
                            child: const Text('回到邀約'))),
                ])))),
      );
}

class _AvailabilityEditor extends StatefulWidget {
  const _AvailabilityEditor(
      {required this.start,
      required this.end,
      required this.dailyStart,
      required this.dailyEnd,
      required this.cells,
      required this.onImport,
      required this.onChanged});
  final DateTime start, end;
  final String dailyStart, dailyEnd;
  final Map<String, String> cells;
  final VoidCallback onImport;
  final ValueChanged<Map<String, String>> onChanged;
  @override
  State<_AvailabilityEditor> createState() => _AvailabilityEditorState();
}

class _AvailabilityEditorState extends State<_AvailabilityEditor> {
  late DateTime _day =
      DateTime(widget.start.year, widget.start.month, widget.start.day);
  late Map<String, String> _cells = {...widget.cells};
  String _status = 'green';
  List<String> get _times {
    final start = _minutes(widget.dailyStart);
    final end = _minutes(widget.dailyEnd);
    return [for (var minute = start; minute < end; minute += 30) _time(minute)];
  }

  List<DateTime> get _days {
    final count = widget.end.difference(widget.start).inDays + 1;
    return [
      for (var i = 0; i < count; i++)
        DateTime(widget.start.year, widget.start.month, widget.start.day + i)
    ];
  }

  @override
  Widget build(BuildContext context) {
    return GlassPanel(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('你什麼時候有空？',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        OutlinedButton.icon(
            onPressed: widget.onImport,
            icon: const Icon(Icons.auto_awesome_rounded, size: 18),
            label: const Text('帶入我的行程')),
        const SizedBox(height: 8),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(children: [
            for (final day in _days)
              Padding(
                padding: const EdgeInsets.only(right: 6),
                child: ChoiceChip(
                  label: Text(DateFormat('M/d E', 'zh_TW').format(day)),
                  selected: _sameDay(day, _day),
                  onSelected: (_) => setState(() => _day = day),
                ),
              ),
          ]),
        ),
        const SizedBox(height: 8),
        Wrap(spacing: 6, children: [
          for (final item in const [
            ('green', '可以'),
            ('yellow', '待確認'),
            ('red', '不行'),
            ('unknown', '未填')
          ])
            ChoiceChip(
              label: Text(item.$2),
              selected: _status == item.$1,
              onSelected: (_) => setState(() => _status = item.$1),
            ),
        ]),
        const SizedBox(height: 8),
        SizedBox(
          height: 300,
          child: ListView.builder(
            itemCount: _times.length,
            itemBuilder: (_, index) {
              final time = _times[index];
              final key = '${_dateOnly(_day)}-$time';
              final value = _cells[key] ?? 'unknown';
              return ListTile(
                dense: true,
                title: Text(time),
                trailing: FilledButton.tonal(
                  onPressed: () {
                    final next = {..._cells};
                    if (_status == 'unknown') {
                      next.remove(key);
                    } else {
                      next[key] = _status;
                    }
                    setState(() => _cells = next);
                    widget.onChanged(next);
                  },
                  child: Text(_label(value)),
                ),
              );
            },
          ),
        ),
      ]),
    );
  }

  int _minutes(String value) {
    final p = value.split(':');
    return int.parse(p[0]) * 60 + int.parse(p[1]);
  }

  String _time(int minute) =>
      '${(minute ~/ 60).toString().padLeft(2, '0')}:${(minute % 60).toString().padLeft(2, '0')}';
  String _dateOnly(DateTime value) =>
      '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
  String _label(String value) =>
      const {
        'green': '可以',
        'yellow': '待確認',
        'red': '不行',
        'unknown': '未填'
      }[value] ??
      '未填';
  bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}

class _CreateGatheringSheet extends StatefulWidget {
  const _CreateGatheringSheet({required this.onSave});
  final Future<String> Function(_GatheringInput) onSave;
  @override
  State<_CreateGatheringSheet> createState() => _CreateGatheringSheetState();
}

class _CreateGatheringSheetState extends State<_CreateGatheringSheet> {
  bool _busy = false;
  String? _error;
  final _name = TextEditingController();
  DateTime _start = DateTime.now().add(const Duration(days: 1));
  DateTime _end = DateTime.now().add(const Duration(days: 7));
  late DateTime _deadline;
  int _duration = 60;
  TimeOfDay _dailyStart = const TimeOfDay(hour: 8, minute: 0);
  TimeOfDay _dailyEnd = const TimeOfDay(hour: 23, minute: 0);
  @override
  void initState() {
    super.initState();
    _deadline = DateTime(_start.year, _start.month, _start.day, 7);
  }

  @override
  void dispose() {
    _name.dispose();
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
          child: ListView(shrinkWrap: true, children: [
            const Text('建立邀約',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            TextField(
                controller: _name,
                autofocus: true,
                maxLength: 80,
                decoration: const InputDecoration(labelText: '這次要約什麼？')),
            _DateField(
                label: '日期開始', value: _start, onTap: () => _pickDate(true)),
            _DateField(
                label: '日期結束', value: _end, onTap: () => _pickDate(false)),
            Row(children: [
              Expanded(
                  child: _TimeField(
                      label: '每天開始',
                      value: _dailyStart,
                      onTap: () => _pickTime(true))),
              const SizedBox(width: 8),
              Expanded(
                  child: _TimeField(
                      label: '每天結束',
                      value: _dailyEnd,
                      onTap: () => _pickTime(false))),
            ]),
            const SizedBox(height: 8),
            const Text('活動長度'),
            Wrap(spacing: 6, children: [
              for (final value in [30, 60, 90, 120, 150, 180, 210, 240])
                ChoiceChip(
                    label: Text('$value 分'),
                    selected: _duration == value,
                    onSelected: (_) => setState(() => _duration = value)),
            ]),
            const SizedBox(height: 14),
            _DateTimeField(
                label: '回覆截止', value: _deadline, onTap: _pickDeadline),
            if (_error != null) Text(_error!),
            TextButton(
                onPressed: _busy ? null : () => Navigator.pop(context),
                child: const Text('取消')),
            FilledButton(
              onPressed: _busy
                  ? null
                  : () async {
                      final earliest = DateTime(_start.year, _start.month,
                          _start.day, _dailyStart.hour, _dailyStart.minute);
                      final rangeDays = _end.difference(_start).inDays;
                      final windowMinutes = _minutes(_fmtTime(_dailyEnd)) -
                          _minutes(_fmtTime(_dailyStart));
                      if (_name.text.trim().isEmpty ||
                          _end.isBefore(_start) ||
                          rangeDays > 13 ||
                          !_validTimes ||
                          windowMinutes < _duration ||
                          _deadline.isBefore(DateTime.now()) ||
                          !_deadline.isBefore(earliest)) {
                        ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                                content:
                                    Text('請確認名稱、14 天內日期、半小時時間、活動長度與截止時間')));
                        return;
                      }
                      final input = _GatheringInput(
                          name: _name.text.trim(),
                          dateStart: _start,
                          dateEnd: _end,
                          dailyStart: _fmtTime(_dailyStart),
                          dailyEnd: _fmtTime(_dailyEnd),
                          duration: _duration,
                          deadline: _deadline);
                      setState(() {
                        _busy = true;
                        _error = null;
                      });
                      try {
                        final id = await widget.onSave(input);
                        if (context.mounted) Navigator.pop(context, id);
                      } catch (e) {
                        if (mounted) setState(() => _error = e.toString());
                      } finally {
                        if (mounted) setState(() => _busy = false);
                      }
                    },
              child: Text(_busy ? '儲存中…' : '建立邀約'),
            ),
          ]),
        ),
      ),
    );
  }

  bool get _validTimes =>
      _dailyEnd.hour * 60 + _dailyEnd.minute >
          _dailyStart.hour * 60 + _dailyStart.minute &&
      _dailyStart.minute % 30 == 0 &&
      _dailyEnd.minute % 30 == 0;
  int _minutes(String value) {
    final parts = value.split(':');
    return int.parse(parts[0]) * 60 + int.parse(parts[1]);
  }

  Future<void> _pickDate(bool start) async {
    final picked = await showDatePicker(
        context: context,
        firstDate: DateTime.now(),
        lastDate: DateTime.now().add(const Duration(days: 366)),
        initialDate: start ? _start : _end);
    if (picked != null)
      setState(() {
        if (start) {
          _start = picked;
          if (_deadline.isAfter(DateTime(_start.year, _start.month, _start.day,
              _dailyStart.hour, _dailyStart.minute)))
            _deadline = DateTime(_start.year, _start.month, _start.day,
                    _dailyStart.hour, _dailyStart.minute)
                .subtract(const Duration(hours: 1));
        } else {
          _end = picked;
        }
      });
  }

  Future<void> _pickTime(bool start) async {
    final picked = await showTimePicker(
        context: context, initialTime: start ? _dailyStart : _dailyEnd);
    if (picked != null)
      setState(() {
        if (start)
          _dailyStart = picked;
        else
          _dailyEnd = picked;
      });
  }

  Future<void> _pickDeadline() async {
    final date = await showDatePicker(
        context: context,
        firstDate: DateTime.now(),
        lastDate: _start,
        initialDate:
            _deadline.isBefore(DateTime.now()) ? DateTime.now() : _deadline);
    if (date == null || !mounted) return;
    final time = await showTimePicker(
        context: context, initialTime: TimeOfDay.fromDateTime(_deadline));
    if (time != null)
      setState(() => _deadline =
          DateTime(date.year, date.month, date.day, time.hour, time.minute));
  }

  String _fmtTime(TimeOfDay value) =>
      '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';
}

class _GatheringInput {
  const _GatheringInput(
      {required this.name,
      required this.dateStart,
      required this.dateEnd,
      required this.dailyStart,
      required this.dailyEnd,
      required this.duration,
      required this.deadline});
  final String name, dailyStart, dailyEnd;
  final DateTime dateStart, dateEnd, deadline;
  final int duration;
}

class _DateField extends StatelessWidget {
  const _DateField(
      {required this.label, required this.value, required this.onTap});
  final String label;
  final DateTime value;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => ListTile(
      contentPadding: EdgeInsets.zero,
      leading: const Icon(Icons.event_rounded),
      title: Text(label,
          style: TextStyle(
              color: Colors.white.withValues(alpha: .6), fontSize: 12)),
      subtitle: Text(DateFormat('yyyy/MM/dd').format(value),
          style: const TextStyle(fontWeight: FontWeight.w700)),
      onTap: onTap);
}

class _DateTimeField extends StatelessWidget {
  const _DateTimeField(
      {required this.label, required this.value, required this.onTap});
  final String label;
  final DateTime value;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => ListTile(
      contentPadding: EdgeInsets.zero,
      leading: const Icon(Icons.schedule_rounded),
      title: Text(label,
          style: TextStyle(
              color: Colors.white.withValues(alpha: .6), fontSize: 12)),
      subtitle: Text(DateFormat('yyyy/MM/dd HH:mm').format(value),
          style: const TextStyle(fontWeight: FontWeight.w700)),
      onTap: onTap);
}

class _TimeField extends StatelessWidget {
  const _TimeField(
      {required this.label, required this.value, required this.onTap});
  final String label;
  final TimeOfDay value;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(label,
          style: TextStyle(
              color: Colors.white.withValues(alpha: .6), fontSize: 11)),
      subtitle: Text(value.format(context),
          style: const TextStyle(fontWeight: FontWeight.w700)),
      onTap: onTap);
}

class _GatheringCard extends StatelessWidget {
  const _GatheringCard({required this.item});
  final GatheringSummary item;
  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GlassPanel(
          child: InkWell(
              borderRadius: BorderRadius.circular(20),
              onTap: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => GatheringDetailScreen(id: item.id))),
              child: Row(children: [
                Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text(item.name,
                          style: const TextStyle(
                              fontSize: 17, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text(
                          '${DateFormat('M/d').format(item.dateStart)}–${DateFormat('M/d').format(item.dateEnd)} · ${item.durationMinutes} 分鐘',
                          style: TextStyle(
                              color: Colors.white.withValues(alpha: .65),
                              fontSize: 12)),
                      const SizedBox(height: 8),
                      _StatusPill(status: item.status)
                    ])),
                const Icon(Icons.chevron_right_rounded)
              ]))));
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title});
  final String title;
  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.fromLTRB(4, 10, 4, 8),
      child: Text(title,
          style: TextStyle(
              color: Colors.white.withValues(alpha: .7),
              fontWeight: FontWeight.w700)));
}

class _EmptyGatherings extends StatelessWidget {
  const _EmptyGatherings();
  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.only(top: 80),
      child: Column(children: [
        Icon(Icons.people_outline_rounded,
            size: 48, color: Colors.white.withValues(alpha: .35)),
        const SizedBox(height: 12),
        const Text('還沒有邀約'),
        const SizedBox(height: 4),
        Text('建立一場邀約，找出大家都有空的時間', style: TextStyle(color: Colors.white54))
      ]));
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.status});
  final GatheringStatus status;
  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (status) {
      GatheringStatus.draft => ('草稿', Colors.white54),
      GatheringStatus.open => ('填寫中', const Color(0xFFA8E6B7)),
      GatheringStatus.calculated => ('推薦已出爐', const Color(0xFFFFD38A)),
      GatheringStatus.finalized => ('已拍板', const Color(0xFFA8E6B7)),
      GatheringStatus.cancelled => ('已取消', const Color(0xFFFFB4AB))
    };
    return Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
        decoration: BoxDecoration(
            color: color.withValues(alpha: .14),
            borderRadius: BorderRadius.circular(8)),
        child: Text(label,
            style: TextStyle(
                color: color, fontSize: 11, fontWeight: FontWeight.w700)));
  }
}

class _CandidateTile extends StatelessWidget {
  const _CandidateTile(
      {required this.candidate, required this.selected, required this.onTap});
  final Candidate candidate;
  final bool selected;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final unanswered = candidate.participantScores
        .where((item) => item['submitted'] != true)
        .length;
    final conflicts = candidate.participantScores
        .where((item) => item['hasConflict'] == true)
        .length;
    final note = [
      '共識分數 ${candidate.totalScore / 2}',
      if (unanswered > 0) '未回覆 $unanswered 人',
      if (conflicts > 0) '不行 $conflicts 人',
      if (candidate.participantScores.any((item) => item['hasUnknown'] == true))
        '包含未填時段',
      if (candidate.participantScores.any((item) => item['status'] == 'yellow'))
        '包含待確認',
      if (candidate.participantScores
          .any((item) => item['submitted'] == true && item['status'] == null))
        '舊結果未記錄原因，請重算'
    ].join(' · ');
    return ListTile(
        onTap: onTap,
        leading: Icon(
            selected
                ? Icons.check_circle_rounded
                : Icons.radio_button_unchecked_rounded,
            color: selected ? const Color(0xFFA8E6B7) : Colors.white54),
        title: Text(DateFormat('M/d (E) HH:mm', 'zh_TW')
            .format(candidate.startsAt.toLocal())),
        subtitle: Text(note),
        trailing: const Icon(Icons.chevron_right_rounded, size: 18));
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.icon, required this.text});
  final IconData icon;
  final String text;
  @override
  Widget build(BuildContext context) => GlassPanel(
          child: Row(children: [
        Icon(icon, color: const Color(0xFFA8E6B7)),
        const SizedBox(width: 10),
        Expanded(child: Text(text))
      ]));
}

class _Retry extends StatelessWidget {
  const _Retry({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text(message),
        const SizedBox(height: 8),
        FilledButton.tonal(onPressed: onRetry, child: const Text('重新載入'))
      ]));
}

String errorMessage(Object error, String fallback) =>
    error is ApiException ? error.message : fallback;
