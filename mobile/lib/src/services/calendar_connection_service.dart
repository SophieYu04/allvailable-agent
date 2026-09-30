import 'package:url_launcher/url_launcher.dart';

import 'api_client.dart';

class CalendarConnectionService {
  CalendarConnectionService(this.api);
  final ApiClient api;

  Future<void> connect(String provider) async {
    final body = await api.request('POST', '/api/v1/calendar-connections',
        body: {
          'provider': provider,
          'returnTo': 'com.yuema.mobile://calendar-callback/'
        });
    final rawUrl = body['authorizationUrl'];
    if (rawUrl is! String ||
        !await launchUrl(Uri.parse(rawUrl),
            mode: LaunchMode.externalApplication))
      throw const ApiException(502, 'CALENDAR_LINK_OPEN_FAILED', '無法開啟授權頁面',
          retryable: true);
  }

  Future<int> syncGoogle(
      {required DateTime start,
      required DateTime end,
      String timeZone = 'Asia/Taipei'}) async {
    final body = await api
        .request('POST', '/api/v1/calendar-integrations/google/sync', body: {
      'start': start.toUtc().toIso8601String(),
      'end': end.toUtc().toIso8601String(),
      'timeZone': timeZone,
      'calendarId': 'primary',
    });
    return int.tryParse((body['synced'] ?? 0).toString()) ?? 0;
  }

  Future<void> disconnectGoogle() =>
      api.request('DELETE', '/api/v1/calendar-integrations/google');

  Future<Map<String, dynamic>?> googleConnection() async {
    final body = await api.request('GET', '/api/v1/calendar-integrations');
    final providers = body['providers'];
    if (providers is! List) return null;
    for (final item in providers.whereType<Map>()) {
      if (item['provider'] == 'google' && item['connection'] is Map)
        return Map<String, dynamic>.from(item['connection'] as Map);
    }
    return null;
  }
}
