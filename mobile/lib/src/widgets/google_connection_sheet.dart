import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../state/providers.dart';
import '../services/api_client.dart';
import 'glass.dart';
import 'deadline_overview.dart';

Future<void> showGoogleConnectionSheet(BuildContext context, WidgetRef ref,
    {required DateTime anchor}) async {
  final service = ref.read(calendarConnectionServiceProvider);
  Map<String, dynamic>? connection;
  try {
    connection = await service.googleConnection();
  } catch (error) {
    if (context.mounted)
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('無法載入連線狀態，請重試')));
    return;
  }
  if (!context.mounted) return;
  final connectionData = connection ?? const <String, dynamic>{};
  final action = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => GlassPanel(
          borderRadius: 28,
          child: SafeArea(
              top: false,
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Text('Google 日曆',
                    style:
                        TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
                if (connection != null) ...[
                  ListTile(
                      leading: const Icon(Icons.check_circle_outline_rounded,
                          color: Color(0xFFA8E6B7)),
                      title: Text(
                          connectionData['account_email']?.toString() ?? '已連接'),
                      subtitle: Text(connectionData['last_synced_at'] == null
                          ? '尚未同步'
                          : '上次同步 ${connectionData['last_synced_at']}')),
                  ListTile(
                      leading: const Icon(Icons.sync_rounded),
                      title: const Text('立即同步'),
                      onTap: () => Navigator.pop(context, 'sync')),
                  if (connectionData['last_error'] != null)
                    ListTile(
                        leading: const Icon(Icons.refresh_rounded),
                        title: const Text('重新連接'),
                        onTap: () => Navigator.pop(context, 'connect')),
                  ListTile(
                      leading: const Icon(Icons.link_off_rounded),
                      title: const Text('中斷連接'),
                      onTap: () => Navigator.pop(context, 'disconnect')),
                ] else
                  ListTile(
                      leading: const Icon(Icons.account_circle_rounded),
                      title: const Text('連接 Google 帳號'),
                      subtitle: const Text('只讀取忙碌狀態，活動名稱只在你的日曆顯示'),
                      onTap: () => Navigator.pop(context, 'connect')),
              ]))));
  if (action == null || !context.mounted) return;
  try {
    if (action == 'connect') await service.connect('google');
    if (action == 'sync')
      await service.syncGoogle(
          start: anchor.subtract(const Duration(days: 7)),
          end: anchor.add(const Duration(days: 42)));
    if (action == 'disconnect') {
      await service.disconnectGoogle();
      await ref.read(calendarRepositoryProvider).clearExternalCaches();
    }
    if (!context.mounted) return;
    ref.invalidate(sourcesProvider);
    ref.invalidate(calendarItemsProvider);
    ref.invalidate(deadlineOverviewProvider);
    if (context.mounted && action != 'connect')
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(action == 'sync' ? 'Google 日曆已同步' : 'Google 日曆已中斷連接')));
  } catch (error) {
    if (context.mounted)
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(error is ApiException ? error.message : '日曆操作失敗，請重試')));
  }
}
