enum GatheringStatus { draft, open, calculated, finalized, cancelled }

GatheringStatus gatheringStatusFromJson(Object? value) =>
    GatheringStatus.values.firstWhere((item) => item.name == value,
        orElse: () => GatheringStatus.open);

class GatheringMember {
  const GatheringMember(
      {required this.id,
      required this.name,
      required this.status,
      this.isHost = false,
      this.isPriority = false});
  final String id;
  final String name;
  final String status;
  final bool isHost;
  final bool isPriority;

  factory GatheringMember.fromJson(Map<String, dynamic> json,
          {String? hostId}) =>
      GatheringMember(
        id: (json['id'] ?? json['user_id'] ?? json['userId'] ?? '').toString(),
        name: (json['name'] ??
                json['display_name'] ??
                json['displayName'] ??
                '新朋友')
            .toString(),
        status: (json['status'] ?? 'pending').toString(),
        isHost: json['isHost'] == true ||
            (hostId != null && json['user_id'] == hostId),
        isPriority: json['is_priority'] == true || json['isPriority'] == true,
      );
}

class GatheringSummary {
  const GatheringSummary(
      {required this.id,
      required this.name,
      required this.dateStart,
      required this.dateEnd,
      required this.dailyStart,
      required this.dailyEnd,
      required this.durationMinutes,
      required this.deadline,
      required this.status,
      required this.revision,
      required this.inviteToken,
      required this.members,
      required this.submitted,
      required this.submittedCount,
      this.hostId});
  final String id;
  final String name;
  final DateTime dateStart;
  final DateTime dateEnd;
  final String dailyStart;
  final String dailyEnd;
  final int durationMinutes;
  final DateTime deadline;
  final GatheringStatus status;
  final String revision;
  final String inviteToken;
  final List<GatheringMember> members;
  final bool submitted;
  final int submittedCount;
  final String? hostId;

  factory GatheringSummary.fromJson(Map<String, dynamic> json,
      {String? currentUserId}) {
    final hostId = (json['host_id'] ?? json['hostId'])?.toString();
    final rawMembers = json['memberships'] ?? json['participants'] ?? const [];
    final members = rawMembers is List
        ? rawMembers
            .whereType<Map>()
            .map((item) => GatheringMember.fromJson(
                Map<String, dynamic>.from(item),
                hostId: hostId))
            .toList()
        : <GatheringMember>[];
    final submissions = json['availability_submissions'];
    final submittedCount = submissions is List ? submissions.length : 0;
    final submitted = json['submitted'] == true ||
        (submissions is List &&
            currentUserId != null &&
            submissions.any(
                (item) => item is Map && item['user_id'] == currentUserId));
    DateTime parseDate(Object? value, DateTime fallback) =>
        value is String ? DateTime.tryParse(value) ?? fallback : fallback;
    return GatheringSummary(
      id: (json['id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      dateStart:
          parseDate(json['date_start'] ?? json['dateStart'], DateTime.now()),
      dateEnd: parseDate(json['date_end'] ?? json['dateEnd'],
          DateTime.now().add(const Duration(days: 1))),
      dailyStart: (json['daily_start'] ?? json['dailyStart'] ?? '08:00')
          .toString()
          .substring(0, 5),
      dailyEnd: (json['daily_end'] ?? json['dailyEnd'] ?? '23:00')
          .toString()
          .substring(0, 5),
      durationMinutes: int.tryParse(
              (json['duration_minutes'] ?? json['duration'] ?? 60)
                  .toString()) ??
          60,
      deadline: parseDate(json['deadline_at'] ?? json['deadline'],
          DateTime.now().add(const Duration(days: 2))),
      status: gatheringStatusFromJson(json['status']),
      revision: (json['revision'] ?? '1').toString(),
      inviteToken:
          (json['invite_token'] ?? json['inviteToken'] ?? '').toString(),
      members: members,
      submitted: submitted,
      submittedCount: submittedCount,
      hostId: hostId,
    );
  }
}

class AvailabilityDraft {
  const AvailabilityDraft(
      {required this.cells, required this.version, this.isPendingSync = false});
  final Map<String, String> cells;
  final String version;
  final bool isPendingSync;
  factory AvailabilityDraft.fromJson(Map<String, dynamic> json) =>
      AvailabilityDraft(
          cells: (json['cells'] is Map)
              ? Map<String, String>.from((json['cells'] as Map).map(
                  (key, value) => MapEntry(key.toString(), value.toString())))
              : <String, String>{},
          version: (json['version'] ?? '1').toString(),
          isPendingSync: json['isPendingSync'] == true);
}

class Candidate {
  const Candidate(
      {required this.id,
      required this.startsAt,
      required this.endsAt,
      required this.priorityScore,
      required this.totalScore,
      required this.participantScores});
  final String id;
  final DateTime startsAt;
  final DateTime endsAt;
  final int priorityScore;
  final int totalScore;
  final List<Map<String, dynamic>> participantScores;
  factory Candidate.fromJson(Map<String, dynamic> json) => Candidate(
      id: (json['id'] ?? '').toString(),
      startsAt: DateTime.tryParse(
              (json['startsAt'] ?? json['starts_at'] ?? '').toString()) ??
          DateTime.now(),
      endsAt: DateTime.tryParse(
              (json['endsAt'] ?? json['ends_at'] ?? '').toString()) ??
          DateTime.now().add(const Duration(hours: 1)),
      priorityScore: int.tryParse((json['priorityScore'] ?? 0).toString()) ?? 0,
      totalScore: int.tryParse((json['totalScore'] ?? 0).toString()) ?? 0,
      participantScores: (json['participantScores'] is List)
          ? (json['participantScores'] as List)
              .whereType<Map>()
              .map((item) => Map<String, dynamic>.from(item))
              .toList()
          : const []);
}

class GatheringDetails extends GatheringSummary {
  const GatheringDetails(
      {required super.id,
      required super.name,
      required super.dateStart,
      required super.dateEnd,
      required super.dailyStart,
      required super.dailyEnd,
      required super.durationMinutes,
      required super.deadline,
      required super.status,
      required super.revision,
      required super.inviteToken,
      required super.members,
      required super.submitted,
      required super.submittedCount,
      super.hostId,
      required this.draft,
      required this.candidates,
      this.snapshotId,
      this.finalCandidateId});
  final AvailabilityDraft draft;
  final List<Candidate> candidates;
  final String? snapshotId;
  final String? finalCandidateId;
  GatheringDetails copyWithDraft(AvailabilityDraft next) => GatheringDetails(
      id: id,
      name: name,
      dateStart: dateStart,
      dateEnd: dateEnd,
      dailyStart: dailyStart,
      dailyEnd: dailyEnd,
      durationMinutes: durationMinutes,
      deadline: deadline,
      status: status,
      revision: revision,
      inviteToken: inviteToken,
      members: members,
      submitted: submitted,
      submittedCount: submittedCount,
      hostId: hostId,
      draft: next,
      candidates: candidates,
      snapshotId: snapshotId,
      finalCandidateId: finalCandidateId);
  factory GatheringDetails.fromJson(Map<String, dynamic> json,
      {String? currentUserId}) {
    final summary =
        GatheringSummary.fromJson(json, currentUserId: currentUserId);
    final drafts = json['availability_drafts'];
    final draft = drafts is List && drafts.isNotEmpty && drafts.first is Map
        ? AvailabilityDraft.fromJson(Map<String, dynamic>.from(drafts.first))
        : const AvailabilityDraft(cells: {}, version: '1');
    final snapshots = json['result_snapshots'];
    final Map<String, dynamic>? snapshot =
        snapshots is List && snapshots.isNotEmpty && snapshots.first is Map
            ? Map<String, dynamic>.from(snapshots.first)
            : null;
    final candidates = snapshot?['candidates'] is List
        ? (snapshot!['candidates'] as List)
            .whereType<Map>()
            .map((item) => Candidate.fromJson(Map<String, dynamic>.from(item)))
            .toList()
        : <Candidate>[];
    final finalizations = json['finalizations'];
    final finalization = finalizations is List &&
            finalizations.isNotEmpty &&
            finalizations.first is Map
        ? Map<String, dynamic>.from(finalizations.first)
        : null;
    return GatheringDetails(
        id: summary.id,
        name: summary.name,
        dateStart: summary.dateStart,
        dateEnd: summary.dateEnd,
        dailyStart: summary.dailyStart,
        dailyEnd: summary.dailyEnd,
        durationMinutes: summary.durationMinutes,
        deadline: summary.deadline,
        status: summary.status,
        revision: summary.revision,
        inviteToken: summary.inviteToken,
        members: summary.members,
        submitted: summary.submitted,
        submittedCount: summary.submittedCount,
        hostId: summary.hostId,
        draft: draft,
        candidates: candidates,
        snapshotId: snapshot?['id']?.toString(),
        finalCandidateId: finalization?['candidate_id']?.toString() ??
            finalization?['candidateId']?.toString());
  }
}
