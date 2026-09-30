import 'package:intl/intl.dart';

enum EventColor { sage, blue, peach, lilac }

EventColor eventColorFromJson(Object? value) => switch (value) {
      'blue' => EventColor.blue,
      'peach' => EventColor.peach,
      'lilac' => EventColor.lilac,
      _ => EventColor.sage,
    };

String eventColorToJson(EventColor color) => color.name;

class CalendarSource {
  const CalendarSource({
    required this.id,
    required this.provider,
    required this.displayName,
    required this.includeInDisplay,
    required this.includeInCoordination,
    required this.canWrite,
    required this.syncStatus,
  });

  final String id;
  final String provider;
  final String displayName;
  final bool includeInDisplay;
  final bool includeInCoordination;
  final bool canWrite;
  final String syncStatus;

  factory CalendarSource.fromJson(Map<String, dynamic> json) => CalendarSource(
        id: json['id'] as String,
        provider: json['provider'] as String? ?? 'manual',
        displayName: json['displayName'] as String? ?? '',
        includeInDisplay: json['includeInDisplay'] as bool? ?? true,
        includeInCoordination: json['includeInCoordination'] as bool? ?? true,
        canWrite: json['canWrite'] as bool? ?? false,
        syncStatus: json['syncStatus'] as String? ?? 'idle',
      );
}

class CalendarMember {
  const CalendarMember(
      {required this.userId, required this.displayName, required this.role});
  final String userId, displayName, role;
  factory CalendarMember.fromJson(Map<String, dynamic> json) => CalendarMember(
      userId: json['userId']?.toString() ?? '',
      displayName: json['displayName']?.toString() ?? '成員',
      role: json['role']?.toString() ?? 'viewer');
}

class SharedCalendar {
  const SharedCalendar(
      {required this.id,
      required this.name,
      required this.color,
      required this.kind,
      required this.role,
      required this.version,
      this.members = const []});
  final String id, name, color, kind, role, version;
  final List<CalendarMember> members;
  bool get canEdit => role == 'owner' || role == 'editor';
  factory SharedCalendar.fromJson(Map<String, dynamic> json) => SharedCalendar(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      color: json['color'] as String? ?? 'sage',
      kind: json['kind'] as String? ?? 'shared',
      role: json['role'] as String? ?? 'viewer',
      version: json['version']?.toString() ?? '1',
      members: (json['members'] as List? ?? const [])
          .whereType<Map>()
          .map((item) =>
              CalendarMember.fromJson(Map<String, dynamic>.from(item)))
          .toList());
}

class CalendarEvent {
  const CalendarEvent({
    required this.id,
    required this.sourceId,
    this.calendarId = '',
    this.createdBy,
    required this.title,
    required this.color,
    required this.allDay,
    required this.version,
    this.idempotencyKey,
    this.startAt,
    this.endAt,
    this.startDate,
    this.endDateExclusive,
    this.timeZone,
    this.isExternal = false,
    this.isFocus = false,
    this.isManualFocus = false,
  });

  final String id;
  final String sourceId;
  final String calendarId;
  final String? createdBy;
  final String title;
  final EventColor color;
  final bool allDay;
  final DateTime? startAt;
  final DateTime? endAt;
  final DateTime? startDate;
  final DateTime? endDateExclusive;
  final String? timeZone;
  final String version;
  final String? idempotencyKey;
  final bool isExternal;
  final bool isFocus;
  final bool isManualFocus;

  factory CalendarEvent.fromJson(Map<String, dynamic> json,
      {bool external = false}) {
    DateTime? parseInstant(Object? value) =>
        value is String ? DateTime.tryParse(value)?.toUtc() : null;
    DateTime? parseDate(Object? value) =>
        value is String ? DateTime.tryParse(value) : null;
    return CalendarEvent(
      id: json['id'] as String,
      sourceId: json['sourceId'] as String? ?? '',
      calendarId: json['calendarId'] as String? ?? '',
      createdBy: json['createdBy'] as String?,
      title: json['title'] as String? ?? '',
      color: eventColorFromJson(json['color']),
      allDay: json['allDay'] as bool? ?? false,
      startAt: parseInstant(json['startAt']),
      endAt: parseInstant(json['endAt']),
      startDate: parseDate(json['startDate']),
      endDateExclusive: parseDate(json['endDateExclusive']),
      timeZone: json['timeZone'] as String?,
      version: json['version']?.toString() ?? '1',
      idempotencyKey: json['idempotencyKey']?.toString(),
      isExternal: external || (json['isExternal'] as bool? ?? false),
      isFocus: json['isFocus'] as bool? ?? false,
      isManualFocus: json['isManualFocus'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'idempotencyKey': idempotencyKey,
        'sourceId': sourceId,
        'calendarId': calendarId,
        'createdBy': createdBy,
        'title': title,
        'color': eventColorToJson(color),
        'allDay': allDay,
        'startAt': startAt?.toUtc().toIso8601String(),
        'endAt': endAt?.toUtc().toIso8601String(),
        'startDate': startDate == null
            ? null
            : DateFormat('yyyy-MM-dd').format(startDate!),
        'endDateExclusive': endDateExclusive == null
            ? null
            : DateFormat('yyyy-MM-dd').format(endDateExclusive!),
        'timeZone': timeZone,
        'version': version,
        'isExternal': isExternal,
        'isFocus': isFocus,
        'isManualFocus': isManualFocus,
      };

  CalendarEvent copyWith({String? title, EventColor? color, String? version}) =>
      CalendarEvent(
        id: id,
        idempotencyKey: idempotencyKey,
        sourceId: sourceId,
        calendarId: calendarId,
        createdBy: createdBy,
        title: title ?? this.title,
        color: color ?? this.color,
        allDay: allDay,
        startAt: startAt,
        endAt: endAt,
        startDate: startDate,
        endDateExclusive: endDateExclusive,
        timeZone: timeZone,
        version: version ?? this.version,
        isExternal: isExternal,
        isFocus: isFocus,
        isManualFocus: isManualFocus,
      );
}
