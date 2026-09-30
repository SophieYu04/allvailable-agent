import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/providers.dart';
import '../widgets/glass.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) => Scaffold(
        body: DecoratedBox(
          decoration: const BoxDecoration(
              gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                Color(0xFF15212A),
                Color(0xFF253B3B),
                Color(0xFF151B29)
              ])),
          child: Center(
            child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: GlassPanel(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.calendar_month_rounded,
                      color: Color(0xFFA8E6B7), size: 48),
                  const SizedBox(height: 14),
                  const Text('約嗎',
                      style:
                          TextStyle(fontSize: 30, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  Text('把每個人的空檔放在同一張圖上',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.7))),
                  const SizedBox(height: 26),
                  _LoginButton(
                      icon: Icons.account_circle_rounded,
                      label: 'Google',
                      onPressed: _busy
                          ? null
                          : () => _signIn(
                              ref.read(authServiceProvider).signInWithGoogle)),
                  const SizedBox(height: 12),
                  _LoginButton(
                      icon: Icons.apple,
                      label: 'Apple',
                      onPressed: _busy
                          ? null
                          : () => _signIn(
                              ref.read(authServiceProvider).signInWithApple)),
                  if (_busy)
                    const Padding(
                        padding: EdgeInsets.only(top: 20),
                        child: LinearProgressIndicator()),
                  if (_error != null)
                    Padding(
                        padding: const EdgeInsets.only(top: 14),
                        child: Text(_error!,
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: Color(0xFFFFB4AB)))),
                ]))),
          ),
        ),
      );

  Future<void> _signIn(Future<bool> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } catch (_) {
      if (mounted) setState(() => _error = '登入尚未完成，請稍後再試');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _LoginButton extends StatelessWidget {
  const _LoginButton(
      {required this.icon, required this.label, required this.onPressed});
  final IconData icon;
  final String label;
  final VoidCallback? onPressed;
  @override
  Widget build(BuildContext context) => SizedBox(
      width: double.infinity,
      child: FilledButton.tonalIcon(
          onPressed: onPressed, icon: Icon(icon), label: Text(label)));
}
