import 'package:supabase_flutter/supabase_flutter.dart';

class AuthService {
  AuthService(this.client);

  final SupabaseClient client;

  Stream<AuthState> get changes => client.auth.onAuthStateChange;
  Session? get session => client.auth.currentSession;

  Future<bool> signInWithGoogle() => _signIn(OAuthProvider.google);

  Future<bool> signInWithApple() => _signIn(OAuthProvider.apple);

  Future<bool> _signIn(OAuthProvider provider) => client.auth.signInWithOAuth(
        provider,
        authScreenLaunchMode: LaunchMode.externalApplication,
        redirectTo: 'com.yuema.mobile://login-callback/',
      );

  Future<void> signOut() => client.auth.signOut();
}
