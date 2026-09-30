import 'package:intl/intl.dart';

class Deadline {
  const Deadline({
    required this.id,
    required this.title,
    required this.dueOn,
    required this.completed,
    required this.version,
    this.idempotencyKey,
    this.isPendingSync = false,
    this.pinned = false,
    this.pinOrder = 0,
  });

  final String id;
  final String title;

  /// A local calendar date. This is never converted to UTC.
  final DateTime dueOn;
  final bool completed;
  final String version;
  final String? idempotencyKey;
  final bool isPendingSync;
  final bool pinned;
  final int pinOrder;

  factory Deadline.fromJson(Map<String, dynamic> json,
      {bool pendingSync = false}) {
    final dueOn = DateTime.tryParse(json['dueOn'] as String? ?? '');
    if (dueOn == null) throw const FormatException('Deadline dueOn is invalid');
    return Deadline(
      id: json['id'] as String,
      title: json['title'] as String? ?? '',
      dueOn: DateTime(dueOn.year, dueOn.month, dueOn.day),
      completed: json['completed'] as bool? ?? false,
      version: json['version']?.toString() ?? '1',
      idempotencyKey: json['idempotencyKey']?.toString(),
      isPendingSync: pendingSync || json['version']?.toString() == '0',
      pinned: json['pinned'] as bool? ?? false,
      pinOrder: (json['pinOrder'] as num?)?.toInt() ?? 0,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'idempotencyKey': idempotencyKey,
        'title': title,
        'dueOn': DateFormat('yyyy-MM-dd').format(dueOn),
        'completed': completed,
        'version': version,
        'pinned': pinned,
        'pinOrder': pinOrder,
      };

  Deadline copyWith({
    String? title,
    DateTime? dueOn,
    bool? completed,
    String? version,
    bool? isPendingSync,
    bool? pinned,
    int? pinOrder,
  }) =>
      Deadline(
        id: id,
        idempotencyKey: idempotencyKey,
        title: title ?? this.title,
        dueOn: dueOn ?? this.dueOn,
        completed: completed ?? this.completed,
        version: version ?? this.version,
        isPendingSync: isPendingSync ?? this.isPendingSync,
        pinned: pinned ?? this.pinned,
        pinOrder: pinOrder ?? this.pinOrder,
      );
}
