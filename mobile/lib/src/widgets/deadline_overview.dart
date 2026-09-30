import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/deadline.dart';
import '../repositories/calendar_repository.dart';
import '../state/providers.dart';

DateTime taipeiDate(DateTime instant) {
  final local = instant.toUtc().add(const Duration(hours: 8));
  return DateTime(local.year, local.month, local.day);
}

int deadlineDays(Deadline item, DateTime today) =>
    DateTime.utc(item.dueOn.year, item.dueOn.month, item.dueOn.day)
        .difference(DateTime.utc(today.year, today.month, today.day))
        .inDays;

String deadlineCaption(Deadline item, DateTime today) {
  final days = deadlineDays(item, today);
  if (item.completed || days < 0)
    return '${item.dueOn.year}/${item.dueOn.month}/${item.dueOn.day}';
  return days == 0 ? '今天' : '剩 $days 天';
}

List<Deadline> upcomingDeadlines(List<Deadline> items, DateTime today) => items
    .where((item) =>
        !item.completed &&
        deadlineDays(item, today) >= 0 &&
        deadlineDays(item, today) < 7)
    .toList()
  ..sort((a, b) {
    final date = a.dueOn.compareTo(b.dueOn);
    return date != 0 ? date : a.id.compareTo(b.id);
  });

final deadlineOverviewProvider = FutureProvider.autoDispose
    .family<CalendarItems, ({DateTime today, bool all})>((ref, range) => ref
        .watch(calendarRepositoryProvider)
        .loadDeadlineOverview(today: range.today, all: range.all));

class DeadlineOverview extends ConsumerStatefulWidget {
  const DeadlineOverview({super.key, required this.onOpen, this.previewItems});
  final Future<void> Function(Deadline) onOpen;
  final List<Deadline>? previewItems;

  @override
  ConsumerState<DeadlineOverview> createState() => _DeadlineOverviewState();
}

class _DeadlineOverviewState extends ConsumerState<DeadlineOverview>
    with WidgetsBindingObserver {
  DateTime _today = taipeiDate(DateTime.now());
  Timer? _midnight;
  bool _expanded = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _schedule();
  }

  void _schedule() {
    _midnight?.cancel();
    final now = DateTime.now().toUtc();
    final today = taipeiDate(now);
    final next = DateTime.utc(today.year, today.month, today.day + 1)
        .subtract(const Duration(hours: 8));
    _midnight = Timer(next.difference(now), () {
      if (mounted) setState(() => _today = taipeiDate(DateTime.now()));
      _schedule();
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      setState(() => _today = taipeiDate(DateTime.now()));
      ref.invalidate(deadlineOverviewProvider);
      _schedule();
    }
  }

  @override
  void dispose() {
    _midnight?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> _open(Deadline item) async {
    await widget.onOpen(item);
    if (mounted) ref.invalidate(deadlineOverviewProvider);
  }

  Widget _row(Deadline item) => Opacity(
      opacity: item.completed ? 0.55 : 1,
      child: ListTile(
          dense: true,
          visualDensity: VisualDensity.compact,
          leading: Icon(
              item.completed ? Icons.check_circle_outline : Icons.event_note,
              size: 20),
          title: Text(item.title, maxLines: 2, overflow: TextOverflow.ellipsis),
          subtitle: Text(
              '${deadlineCaption(item, _today)}${item.isPendingSync ? ' · 待同步' : ''}'),
          onTap: () => _open(item)));

  Future<void> _showAll() => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => FractionallySizedBox(
          heightFactor: 0.85,
          child: Consumer(builder: (context, ref, _) {
            final data = widget.previewItems == null
                ? ref
                    .watch(deadlineOverviewProvider((today: _today, all: true)))
                : AsyncData(CalendarItems(
                    events: const [], deadlines: widget.previewItems!));
            return Column(children: [
              const ListTile(title: Text('全部 Deadline')),
              Expanded(
                  child: data.when(
                      loading: () =>
                          const Center(child: CircularProgressIndicator()),
                      error: (_, __) => Center(
                          child: TextButton(
                              onPressed: () =>
                                  ref.invalidate(deadlineOverviewProvider),
                              child: const Text('無法載入，重試'))),
                      data: (result) => Column(children: [
                            if (result.fromCache) const Text('離線快取 · 可能不是完整清單'),
                            Expanded(
                                child: result.deadlines.isEmpty
                                    ? const Center(child: Text('尚無截止事項'))
                                    : ListView(
                                        children: (result.deadlines.toList()
                                              ..sort((a, b) =>
                                                  a.dueOn.compareTo(b.dueOn)))
                                            .map(_row)
                                            .toList())),
                          ]))),
            ]);
          })));

  @override
  Widget build(BuildContext context) {
    final data = widget.previewItems == null
        ? ref.watch(deadlineOverviewProvider((today: _today, all: false)))
        : AsyncData(
            CalendarItems(events: const [], deadlines: widget.previewItems!));
    return ConstrainedBox(
        constraints:
            BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.3),
        child: SingleChildScrollView(
            child: Column(children: [
          Row(children: [
            const SizedBox(width: 16),
            const Expanded(child: Text('近期 Deadline')),
            TextButton(onPressed: _showAll, child: const Text('查看全部'))
          ]),
          data.when(
              loading: () => const LinearProgressIndicator(),
              error: (_, __) => TextButton(
                  onPressed: () => ref.invalidate(deadlineOverviewProvider),
                  child: const Text('截止事項載入失敗，重試')),
              data: (result) {
                final items = upcomingDeadlines(result.deadlines, _today);
                return Column(children: [
                  if (result.fromCache) const Text('目前顯示快取，重新整理後更新'),
                  if (items.isEmpty)
                    const Padding(
                        padding: EdgeInsets.only(bottom: 8),
                        child: Text('未來七天沒有截止事項')),
                  ...(_expanded ? items : items.take(3)).map(_row),
                  if (items.length > 3)
                    TextButton(
                        onPressed: () => setState(() => _expanded = !_expanded),
                        child: Text(
                            _expanded ? '收合' : '展開其餘 ${items.length - 3} 筆')),
                ]);
              }),
        ])));
  }
}
