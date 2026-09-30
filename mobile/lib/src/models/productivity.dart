import 'package:intl/intl.dart';

class GoalCheckin {
  const GoalCheckin(
      {required this.userId, required this.date, required this.isBackfill});
  final String userId;
  final DateTime date;
  final bool isBackfill;
  factory GoalCheckin.fromJson(Map<String, dynamic> json) => GoalCheckin(
      userId: json['userId']?.toString() ?? '',
      date: DateTime.parse(json['date'] as String),
      isBackfill: json['isBackfill'] as bool? ?? false);
}

class GoalMember {
  const GoalMember(
      {required this.userId,
      required this.displayName,
      required this.role,
      required this.joinedOn});
  final String userId, displayName, role;
  final DateTime joinedOn;
  factory GoalMember.fromJson(Map<String, dynamic> json) => GoalMember(
      userId: json['userId']?.toString() ?? '',
      displayName: json['displayName']?.toString() ?? '成員',
      role: json['role']?.toString() ?? 'viewer',
      joinedOn: DateTime.parse(json['joinedOn'] as String));
}

class Goal {
  const Goal(
      {required this.id,
      required this.ownerId,
      required this.title,
      required this.color,
      required this.icon,
      required this.mode,
      required this.role,
      required this.version,
      required this.checkins,
      this.members = const [],
      this.reminderTime,
      this.archivedAt});
  final String id, ownerId, title, color, icon, mode, role, version;
  final DateTime? archivedAt;
  final String? reminderTime;
  final List<GoalCheckin> checkins;
  final List<GoalMember> members;
  factory Goal.fromJson(Map<String, dynamic> json) => Goal(
      id: json['id'] as String,
      ownerId: json['ownerId'] as String,
      title: json['title'] as String? ?? '',
      color: json['color'] as String? ?? 'blue',
      icon: json['icon'] as String? ?? 'star',
      mode: json['mode'] as String? ?? 'personal',
      role: json['role'] as String? ?? 'viewer',
      version: json['version']?.toString() ?? '1',
      archivedAt: DateTime.tryParse(json['archivedAt']?.toString() ?? ''),
      reminderTime: json['reminderTime']?.toString(),
      checkins: (json['checkins'] as List? ?? const [])
          .whereType<Map>()
          .map((item) => GoalCheckin.fromJson(Map<String, dynamic>.from(item)))
          .toList(),
      members: (json['members'] as List? ?? const [])
          .whereType<Map>()
          .map((item) => GoalMember.fromJson(Map<String, dynamic>.from(item)))
          .toList());
  bool checkedOn(DateTime day, String userId) => checkins
      .any((item) => item.userId == userId && _date(item.date) == _date(day));
  int streak(DateTime today, String userId) {
    var count = 0;
    var cursor = _date(today);
    while (checkedOn(cursor, userId)) {
      count++;
      cursor = cursor.subtract(const Duration(days: 1));
    }
    return count;
  }
}

class Subject {
  const Subject(
      {required this.id,
      required this.name,
      required this.color,
      required this.version,
      this.archivedAt});
  final String id, name, color, version;
  final DateTime? archivedAt;
  factory Subject.fromJson(Map<String, dynamic> json) => Subject(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      color: json['color'] as String? ?? 'blue',
      version: json['version']?.toString() ?? '1',
      archivedAt: DateTime.tryParse(json['archivedAt']?.toString() ?? ''));
}

class FocusSegment {
  const FocusSegment({required this.id, required this.start, this.end});
  final String id;
  final DateTime start;
  final DateTime? end;
  factory FocusSegment.fromJson(Map<String, dynamic> json) => FocusSegment(
      id: json['id']?.toString() ?? '',
      start: DateTime.parse(json['startAt'] as String).toLocal(),
      end: DateTime.tryParse(json['endAt']?.toString() ?? '')?.toLocal());
  int seconds(DateTime now) =>
      ((end ?? now).difference(start).inSeconds).clamp(0, 86400 * 7);
}

class FocusSession {
  const FocusSession(
      {required this.id,
      required this.subjectId,
      required this.source,
      required this.status,
      required this.startedAt,
      required this.version,
      required this.segments,
      this.endedAt,
      this.conflicted = false});
  final String id, subjectId, source, status, version;
  final DateTime startedAt;
  final DateTime? endedAt;
  final bool conflicted;
  final List<FocusSegment> segments;
  factory FocusSession.fromJson(Map<String, dynamic> json) => FocusSession(
      id: json['id'] as String,
      subjectId: json['subjectId'] as String,
      source: json['source'] as String? ?? 'timer',
      status: json['status'] as String? ?? 'completed',
      startedAt: DateTime.parse(json['startedAt'] as String).toLocal(),
      endedAt: DateTime.tryParse(json['endedAt']?.toString() ?? '')?.toLocal(),
      version: json['version']?.toString() ?? '1',
      conflicted: json['conflicted'] as bool? ?? false,
      segments: (json['segments'] as List? ?? const [])
          .whereType<Map>()
          .map((item) => FocusSegment.fromJson(Map<String, dynamic>.from(item)))
          .toList());
  int seconds(DateTime now) =>
      segments.fold(0, (total, item) => total + item.seconds(now));
}

class FocusBundle {
  const FocusBundle({required this.subjects, required this.sessions});
  final List<Subject> subjects;
  final List<FocusSession> sessions;
  Subject? subject(String id) {
    for (final item in subjects) {
      if (item.id == id) return item;
    }
    return null;
  }
}

class FocusGroupMember {
  const FocusGroupMember(
      {required this.userId, required this.displayName, required this.role});
  final String userId, displayName, role;
  factory FocusGroupMember.fromJson(Map<String, dynamic> json) =>
      FocusGroupMember(
          userId: json['userId']?.toString() ?? '',
          displayName: json['displayName']?.toString() ?? '成員',
          role: json['role']?.toString() ?? 'member');
}

class FocusGroup {
  const FocusGroup(
      {required this.id,
      required this.name,
      required this.canManage,
      this.members = const []});
  final String id, name;
  final bool canManage;
  final List<FocusGroupMember> members;
  factory FocusGroup.fromJson(Map<String, dynamic> json) => FocusGroup(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      canManage: json['canManage'] as bool? ?? false,
      members: (json['members'] as List? ?? const [])
          .whereType<Map>()
          .map((item) =>
              FocusGroupMember.fromJson(Map<String, dynamic>.from(item)))
          .toList());
}

class RankingRow {
  const RankingRow(
      {required this.rank,
      required this.displayName,
      required this.seconds,
      required this.isFocusing});
  final int rank, seconds;
  final String displayName;
  final bool isFocusing;
  factory RankingRow.fromJson(Map<String, dynamic> json) => RankingRow(
      rank: (json['rank'] as num).toInt(),
      displayName: json['displayName'] as String? ?? '成員',
      seconds: (json['seconds'] as num?)?.toInt() ?? 0,
      isFocusing: json['isFocusing'] as bool? ?? false);
}

String dateKey(DateTime date) => DateFormat('yyyy-MM-dd').format(date);
DateTime _date(DateTime value) => DateTime(value.year, value.month, value.day);
