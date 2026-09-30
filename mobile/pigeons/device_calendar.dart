import 'package:pigeon/pigeon.dart';

class BusyInterval {
  String? id;
  String? startAt;
  String? endAt;
  String? timeZone;
  bool? tentative;
}

class WriteEventRequest {
  String? title;
  String? startAt;
  String? endAt;
  String? calendarId;
}

@HostApi()
abstract class DeviceCalendarApi {
  @async
  List<BusyInterval> readBusy(String startAt, String endAt, String timeZone);

  @async
  String? writeEvent(WriteEventRequest request);

  @async
  bool requestAccess();
}
