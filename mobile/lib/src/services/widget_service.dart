import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/productivity.dart';
import '../repositories/calendar_repository.dart';
import '../repositories/productivity_repository.dart';
import 'api_client.dart';

/// Widget snapshots contain display data only. All writes run through the app's
/// existing repositories; credentials never leave the app's authentication store.
class WidgetService {
  WidgetService(this.api, this.preferences);
  final ApiClient api;
  final SharedPreferences preferences;
  static const channel = MethodChannel('com.yuema.mobile/widgets');
  static final changes = StreamController<void>.broadcast();
  static void changed() => changes.add(null);
  bool _refreshing = false;
  bool _again = false;
  int _generation = 0;
  String? _account;

  static DateTime taipeiDay(DateTime instant) {
    final value = instant.toUtc().add(const Duration(hours: 8));
    return DateTime.utc(value.year, value.month, value.day);
  }

  static DateTime instantForDay(DateTime day) =>
      DateTime.utc(day.year, day.month, day.day)
          .subtract(const Duration(hours: 8));

  Future<void> accountChanged() async {
    _generation++;
    _account = api.userId;
    if (Platform.isIOS) {
      final old = await channel.invokeMapMethod<String, dynamic>('read');
      if (_account == null || old?['account'] != _account) {
        await channel.invokeMethod<void>('clear');
      }
    }
    await refresh();
  }

  Future<void> refresh() async {
    if (!Platform.isIOS) return;
    if (_refreshing) {
      _again = true;
      return;
    }
    _refreshing = true;
    final generation = _generation;
    final account = api.userId;
    try {
      if (account == null) {
        await channel.invokeMethod<void>('clear');
        return;
      }
      if (_account != account) {
        _account = account;
        final old = await channel.invokeMapMethod<String, dynamic>('read');
        if (old?['account'] != account)
          await channel.invokeMethod<void>('clear');
      }
      final now = DateTime.now();
      final today = taipeiDay(now);
      final start = DateTime.utc(today.year, today.month, 1)
          .subtract(const Duration(days: 7));
      final end = DateTime.utc(today.year, today.month + 1, 1)
          .add(const Duration(days: 7));
      final productivity = ProductivityRepository(api, preferences);
      final calendar = CalendarRepository(api, preferences);
      final snapshot = <String, dynamic>{
        'account': account,
        'nonce':
            '${now.microsecondsSinceEpoch}-${Random.secure().nextInt(1 << 32)}',
        'updatedAt': now.millisecondsSinceEpoch / 1000,
        'events': <dynamic>[],
        'deadlines': <dynamic>[],
        'goals': <dynamic>[],
        'subjects': <dynamic>[],
        'ranking': <dynamic>[],
      };
      // Publish only freshly authorized remote data. A failed source is omitted,
      // rather than refreshing the lifetime of a potentially revoked snapshot.
      await Future.wait([
        () async {
          try {
            final items = await calendar.loadCalendar(
                instantForDay(start), instantForDay(end));
            if (items.syncFailed || items.fromCache) return;
            final sources = await calendar.loadSources();
            final hidden = sources
                .where((s) => !s.includeInDisplay)
                .map((s) => s.id)
                .toSet();
            snapshot['events'] = items.events
                .where((e) => !hidden.contains(e.sourceId))
                .map((e) {
              final first = e.allDay
                  ? e.startDate
                  : e.startAt == null
                      ? null
                      : taipeiDay(e.startAt!);
              final last = e.allDay
                  ? e.endDateExclusive?.subtract(const Duration(days: 1))
                  : e.endAt == null
                      ? first
                      : taipeiDay(
                          e.endAt!.subtract(const Duration(microseconds: 1)));
              return {
                'id': e.id,
                'title': e.title,
                'startDay': first == null ? '' : dateKey(first),
                'endDay': last == null ? '' : dateKey(last)
              };
            }).toList();
            final deadlines = [...items.deadlines]..sort((a, b) {
                if (a.pinned != b.pinned) return a.pinned ? -1 : 1;
                if (a.pinned && a.pinOrder != b.pinOrder)
                  return a.pinOrder.compareTo(b.pinOrder);
                return a.dueOn.compareTo(b.dueOn);
              });
            snapshot['deadlines'] = deadlines.map((d) => d.toJson()).toList();
          } catch (_) {/* This source remains empty. */}
        }(),
        () async {
          try {
            final goals = await productivity.loadGoals(start, end);
            snapshot['goals'] = goals
                .where((g) =>
                    g.archivedAt == null &&
                    (g.ownerId == account || g.role != 'viewer'))
                .map((g) => {
                      'id': g.id,
                      'title': g.title,
                      'icon': g.icon,
                      'dates': g.checkins
                          .where((c) => c.userId == account)
                          .map((c) => dateKey(c.date))
                          .toList(),
                    })
                .toList();
            // Preserve pending local checkins in the snapshot until server sync.
            final pending = jsonDecode(
                preferences.getString('productivity.checkins.$account') ??
                    '[]') as List;
            for (final operation in pending.whereType<Map>()) {
              for (final goal in snapshot['goals'] as List) {
                if (goal['id'] != operation['goalId']) continue;
                final dates = goal['dates'] as List;
                dates.remove(operation['date']);
                if (operation['checked'] == true) dates.add(operation['date']);
              }
            }
          } catch (_) {/* No stale shared goals. */}
        }(),
        () async {
          try {
            final bundle = await productivity.loadFocus(instantForDay(today),
                instantForDay(today.add(const Duration(days: 1))));
            snapshot['subjects'] = bundle.subjects
                .where((s) => s.archivedAt == null)
                .map((s) => {
                      'id': s.id,
                      'name': s.name,
                      'seconds': bundle.sessions
                          .where((f) => f.subjectId == s.id && !f.conflicted)
                          .fold<int>(
                              0,
                              (sum, f) =>
                                  sum +
                                  f.segments.fold<int>(0, (total, segment) {
                                    final left = segment.start
                                            .isBefore(instantForDay(today))
                                        ? instantForDay(today)
                                        : segment.start;
                                    final right = segment.end ?? now;
                                    return total +
                                        max(0,
                                            right.difference(left).inSeconds);
                                  })),
                    })
                .toList();
          } catch (_) {/* The active local timer can still be shown. */}
        }(),
        () async {
          try {
            final groups = await productivity.loadGroups();
            if (groups.isEmpty) return;
            final week = today.subtract(Duration(days: today.weekday - 1));
            final ranking = await productivity.ranking(
                groups.first.id,
                instantForDay(week),
                instantForDay(week.add(const Duration(days: 7))));
            snapshot['ranking'] = ranking
                .map((r) => {
                      'rank': r.rank,
                      'displayName': r.displayName,
                      'seconds': r.seconds
                    })
                .toList();
            snapshot['rankingUpdatedAt'] =
                DateTime.now().millisecondsSinceEpoch / 1000;
          } catch (_) {/* Rankings never use device-submitted totals. */}
        }(),
      ]);
      final timer = productivity.activeLocalTimer();
      final sampledAt = DateTime.now();
      if (timer != null) {
        var seconds = 0;
        for (final segment in (timer['segments'] as List).whereType<Map>()) {
          final start = DateTime.parse(segment['start'] as String);
          final end =
              DateTime.tryParse(segment['end']?.toString() ?? '') ?? sampledAt;
          seconds += max(0, end.difference(start).inSeconds);
        }
        snapshot['timer'] = {
          ...timer,
          'seconds': seconds,
          'sampledAt': sampledAt.millisecondsSinceEpoch / 1000
        };
      }
      if (generation != _generation || account != api.userId) return;
      await channel.invokeMethod<void>('publish', snapshot);
    } finally {
      _refreshing = false;
      if (_again) {
        _again = false;
        unawaited(refresh());
      }
    }
  }

  /// Reject old widgets, other accounts and repeated taps before executing.
  Future<void> _operations = Future<void>.value();
  Future<void> perform(Uri uri) {
    final result = _operations.then((_) => _perform(uri));
    _operations =
        result.then<void>((_) {}, onError: (Object _, StackTrace __) {});
    return result;
  }

  Future<void> _perform(Uri uri) async {
    final p = uri.queryParameters;
    final account = api.userId;
    if (account == null || p['account'] != account)
      throw StateError('請以原帳號開啟小工具');
    final raw = await channel.invokeMapMethod<String, dynamic>('read');
    if (raw == null || raw['account'] != account || raw['nonce'] != p['nonce'])
      throw StateError('小工具已更新，請重新操作');
    final updated = raw['updatedAt'] as num?;
    if (updated == null ||
        DateTime.now().millisecondsSinceEpoch / 1000 - updated > 21600) {
      throw StateError('請更新小工具後重試');
    }
    final today = taipeiDay(DateTime.now());
    if (p['day'] != dateKey(today)) throw StateError('日期已更新，請重新操作');
    final action = p['action'];
    final id = p['id'] ?? '';
    final seenKey = 'widgets.operations.$account';
    final seen = preferences.getStringList(seenKey) ?? [];
    final operation = '${p['nonce']}:$action:$id:${p['value']}';
    if (seen.contains(operation)) return;
    final repo = ProductivityRepository(api, preferences);
    if (action == 'checkin') {
      final goals =
          await repo.loadGoals(today, today.add(const Duration(days: 1)));
      final goal = goals
          .where((g) =>
              g.id == id &&
              g.archivedAt == null &&
              (g.ownerId == account || g.role != 'viewer'))
          .firstOrNull;
      if (goal == null) throw StateError('目標已不可用');
      await repo.setCheckin(id, today, p['value'] == 'true');
    } else if (action == 'start') {
      final bundle = await repo.loadFocus(instantForDay(today),
          instantForDay(today.add(const Duration(days: 1))));
      final subject = bundle.subjects
          .where((s) => s.id == id && s.archivedAt == null)
          .firstOrNull;
      if (subject == null) throw StateError('科目已不可用');
      final active = repo.activeLocalTimer();
      if (active?['subjectId'] == id) return;
      if (active != null) await repo.stopTimer();
      await repo.startTimer(subject);
    } else if (action == 'pause' || action == 'resume') {
      if (repo.activeLocalTimer()?['startedAt'] != id)
        throw StateError('計時已變更');
      if (action == 'pause') {
        await repo.pauseTimer();
      } else {
        await repo.resumeTimer();
      }
    } else {
      return;
    }
    if (api.userId != account) return;
    await preferences.setStringList(seenKey, [...seen.take(63), operation]);
    await refresh();
  }
}
