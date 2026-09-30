import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class ApiException implements Exception {
  const ApiException(this.status, this.code, this.message,
      {this.retryable = false});

  final int status;
  final String code;
  final String message;
  final bool retryable;

  @override
  String toString() => 'ApiException($status, $code): $message';
}

class ApiClient {
  static final mutations = StreamController<void>.broadcast();
  ApiClient(this._supabase, {http.Client? client})
      : _client = client ?? http.Client();

  static const baseUrl = String.fromEnvironment('API_BASE_URL',
      defaultValue: 'http://localhost:5173');
  final SupabaseClient _supabase;
  final http.Client _client;

  /// Keeps device caches from one account out of another account's calendar.
  String get cacheScope => _supabase.auth.currentUser?.id ?? 'signed-out';
  String? get userId => _supabase.auth.currentUser?.id;

  Future<Map<String, dynamic>> upload(
    String path, {
    required String requestKey,
    Map<String, String> fields = const {},
    required List<({String field, String path, String mime})> files,
  }) async {
    final scope = cacheScope;
    final session = _supabase.auth.currentSession;
    if (session == null)
      throw const ApiException(401, 'UNAUTHENTICATED', '請先登入');
    final request = http.MultipartRequest('POST', Uri.parse('$baseUrl$path'))
      ..headers.addAll({
        'Authorization': 'Bearer ${session.accessToken}',
        'Idempotency-Key': requestKey
      })
      ..fields.addAll({...fields, 'requestKey': requestKey});
    for (final file in files) {
      request.files.add(await http.MultipartFile.fromPath(file.field, file.path,
          contentType: MediaType.parse(file.mime)));
    }
    final response = await _client
        .send(request)
        .then(http.Response.fromStream)
        .timeout(const Duration(seconds: 150));
    if (cacheScope != scope)
      throw const ApiException(401, 'ACCOUNT_CHANGED', '請重新登入');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final error = body['error'] as Map?;
      throw ApiException(
          response.statusCode,
          error?['code']?.toString() ?? 'UPLOAD_FAILED',
          error?['message']?.toString() ?? '上傳失敗',
          retryable: true);
    }
    return body;
  }

  Future<Map<String, dynamic>> request(String method, String path,
      {Map<String, dynamic>? body, Map<String, String>? query}) async {
    final scope = cacheScope;
    final session = _supabase.auth.currentSession;
    if (session == null)
      throw const ApiException(401, 'UNAUTHENTICATED', '請先登入');
    final uri = Uri.parse('$baseUrl$path').replace(queryParameters: query);
    final request = http.Request(method, uri)
      ..headers.addAll({
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${session.accessToken}',
      });
    if (body != null) request.body = jsonEncode(body);
    final response = await _client
        .send(request)
        .then(http.Response.fromStream)
        .timeout(Duration(seconds: path.contains('/proposals') ? 150 : 15));
    Map<String, dynamic> decoded = <String, dynamic>{};
    if (response.body.isNotEmpty) {
      final value = jsonDecode(response.body);
      if (value is Map<String, dynamic>) decoded = value;
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final error = decoded['error'];
      throw ApiException(
          response.statusCode,
          error is Map
              ? error['code']?.toString() ?? 'REQUEST_FAILED'
              : 'REQUEST_FAILED',
          error is Map ? error['message']?.toString() ?? '請稍後再試' : '請稍後再試',
          retryable: error is Map && error['retryable'] == true);
    }
    if (cacheScope != scope)
      throw const ApiException(401, 'ACCOUNT_CHANGED', '請重新登入');
    if (method != 'GET') mutations.add(null);
    return decoded;
  }
}
