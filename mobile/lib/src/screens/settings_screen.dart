import '../widgets/google_connection_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/providers.dart';
import '../widgets/glass.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
        appBar: AppBar(title: const Text('設定')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          GlassPanel(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                const Text('帳號',
                    style:
                        TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Text(ref.read(supabaseProvider).auth.currentUser?.email ??
                    '已登入'),
                const SizedBox(height: 12),
                FilledButton.tonalIcon(
                    icon: const Icon(Icons.logout_rounded),
                    label: const Text('登出'),
                    onPressed: () async {
                      await ref
                          .read(calendarRepositoryProvider)
                          .clearLocalCache();
                      await ref
                          .read(coordinationRepositoryProvider)
                          .clearLocalCache();
                      await ref.read(authServiceProvider).signOut();
                      if (context.mounted)
                        Navigator.of(context)
                            .popUntil((route) => route.isFirst);
                    }),
              ])),
          const SizedBox(height: 12),
          GlassPanel(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                const Text('隱私與同步',
                    style:
                        TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Text('Google 行事曆只用於顯示你的忙碌時段；邀約成員只會看到你提交的狀態。',
                    style: TextStyle(
                        color: Colors.white.withValues(alpha: .7),
                        fontSize: 13)),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                    onPressed: () => showGoogleConnectionSheet(context, ref,
                        anchor: DateTime.now()),
                    icon: const Icon(Icons.account_circle_rounded),
                    label: const Text('管理 Google 日曆')),
              ])),
        ]),
      );
}
