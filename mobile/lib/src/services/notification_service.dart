import 'package:firebase_messaging/firebase_messaging.dart';

import 'api_client.dart';

class NotificationService {
  NotificationService(this.api);
  final ApiClient api;

  Future<void> register(
      {required String platform,
      required String appVersion,
      required String timeZone}) async {
    final messaging = FirebaseMessaging.instance;
    await messaging.requestPermission(alert: true, badge: true, sound: true);
    final token = await messaging.getToken();
    if (token == null || token.isEmpty) return;
    await api.request('POST', '/api/v1/devices', body: {
      'platform': platform,
      'pushToken': token,
      'appVersion': appVersion,
      'timeZone': timeZone
    });
  }

  Future<List<Map<String, dynamic>>> listInApp() async {
    final body = await api.request('GET', '/api/v1/notifications');
    return (body['notifications'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }
}
