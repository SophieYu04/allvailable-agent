import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:timezone/timezone.dart' as tz;
import '../services/api_client.dart';
import '../state/providers.dart';
import '../widgets/ai_media.dart';

const _screenshot = MethodChannel('com.yuema.mobile/screenshot');

class CalendarImportScreen extends ConsumerStatefulWidget {
  const CalendarImportScreen({super.key});
  @override
  ConsumerState<CalendarImportScreen> createState() =>
      _CalendarImportScreenState();
}

class _CalendarImportScreenState extends ConsumerState<CalendarImportScreen>
    with WidgetsBindingObserver {
  Map<String, dynamic>? _draft;
  List<Map<String, dynamic>> _saved = [];
  List<String> _shared = [];
  String? _image;
  Uint8List? _originalImage;
  String _key = aiRequestKey();
  String _message = '';
  bool _busy = false;
  bool _done = false;
  final Set<String> _written = {};
  String get _id => (_draft?['importId'] ?? _draft?['id']).toString();
  String get _version => _draft!['version'].toString();
  Map get _extraction => _draft?['extraction'] as Map? ?? {};
  List<Map<String, dynamic>> get _events =>
      (_extraction['events'] as List? ?? [])
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
  Map get _validation => _extraction['screenshotValidation'] as Map? ?? {};
  bool get _validated =>
      _validation['category'] == 'calendar' &&
      (_validation['confidence'] as num? ?? 0) >= .9;
  bool get _hasWrites => _written.isNotEmpty;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    Future.microtask(() => _run(_load));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && !_busy && _draft == null) {
      _run(_load);
    }
  }

  Future<void> _run(Future<void> Function() work) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _message = '';
    });
    try {
      await work();
    } catch (error) {
      if (mounted) {
        setState(() => _message = error is ApiException
            ? error.message
            : error is PlatformException
                ? error.message ?? 'iOS 操作失敗'
                : error.toString());
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _load() async {
    if (Platform.isIOS) {
      final shared =
          await _screenshot.invokeListMethod<String>('sharedImages') ?? [];
      if (mounted) setState(() => _shared = shared);
    }
    final result =
        await ref.read(apiClientProvider).request('GET', '/api/v1/imports');
    final saved = (result['imports'] as List? ?? [])
        .whereType<Map>()
        .where(
            (e) => (e['extraction'] as Map?)?['screenshotValidation'] != null)
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
    if (mounted) setState(() => _saved = saved);
  }

  Future<void> _pick() => _run(() async {
        final image = await ImagePicker().pickImage(
            source: ImageSource.gallery,
            requestFullMetadata: false,
            imageQuality: 90,
            maxWidth: 2400,
            maxHeight: 2400);
        if (mounted && image != null) {
          setState(() {
            _image = image.path;
            _key = aiRequestKey();
          });
        }
      });
  Future<void> _analyze() => _run(() async {
        final path = _image!;
        if (!Platform.isIOS) throw StateError('TimeTree 截圖匯入目前支援 iOS');
        final imageFile = File(path);
        if (await imageFile.length() > 5 * 1024 * 1024) {
          throw StateError('截圖不可超過 5 MB');
        }
        final originalImage = await imageFile.readAsBytes();
        final lines = await _screenshot
                .invokeMethod<List<dynamic>>('recognize', {'path': path}) ??
            [];
        if (lines.isEmpty) {
          setState(() => _message = '沒有偵測到可匯入的行程。');
          return;
        }
        final mime =
            path.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        final result = await ref.read(apiClientProvider).upload(
            '/api/v1/imports',
            requestKey: _key,
            files: [(field: 'images', path: path, mime: mime)],
            fields: {'mode': 'timetree', 'ocr': jsonEncode(lines)});
        if (!mounted) return;
        setState(() {
          _draft = result;
          _originalImage = originalImage;
          _written.clear();
        });
        if (_shared.contains(path)) {
          await _screenshot
              .invokeMethod<void>('removeSharedImage', {'path': path});
          if (mounted) {
            setState(() {
              _shared.remove(path);
              _image = null;
            });
          }
        }
      });
  Future<void> _resume(Map<String, dynamic> draft) => _run(() async {
        final result = await ref
            .read(apiClientProvider)
            .request('GET', '/api/v1/imports/${draft['id']}');
        final ids = await ref
            .read(deviceCalendarServiceProvider)
            .importedDraftIds(_eventsFor(result)
                .map((e) =>
                    '${ref.read(apiClientProvider).cacheScope}:${draft['id']}:${e['id']}')
                .toList());
        if (mounted) {
          setState(() {
            _draft = result;
            _originalImage = null;
            _written.clear();
            _written.addAll(_eventsFor(result)
                .where((e) => ids.contains(
                    '${ref.read(apiClientProvider).cacheScope}:${draft['id']}:${e['id']}'))
                .map((e) => e['id'].toString()));
          });
        }
      });
  List<Map> _eventsFor(Map draft) =>
      ((draft['extraction'] as Map)['events'] as List)
          .whereType<Map>()
          .toList();
  Future<void> _save(
      Map<String, dynamic>? event, Map<String, dynamic> changes) async {
    final result = await ref
        .read(apiClientProvider)
        .request('POST', '/api/v1/imports/$_id', body: {
      'action': event == null ? 'add_event' : 'edit_event',
      'version': _version,
      if (event != null) 'eventId': event['id'],
      'changes': changes,
    });
    if (mounted) setState(() => _draft = result);
  }

  Future<void> _edit(Map<String, dynamic>? event) async {
    await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (_) => _DraftEditor(
            event: event, onSave: (changes) => _save(event, changes)));
  }

  Future<void> _delete(Map<String, dynamic> event) async {
    final yes = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
                title: const Text('刪除這個草稿？'),
                content: Text(event['label']?.toString() ?? '未命名事件'),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('取消')),
                  FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('刪除草稿'))
                ]));
    if (yes == true && mounted) {
      await _run(() => _save(event, {'delete': true}));
    }
  }

  Future<void> _voice(Map<String, dynamic> event) async {
    final api = ref.read(apiClientProvider);
    final correction = await showDialog<Map<String, dynamic>>(
        context: context,
        barrierDismissible: false,
        builder: (_) => _VoiceDialog(
            api: api, importId: _id, version: _version, event: event));
    if (correction == null || !mounted) return;
    final intent = correction['intent'];
    if (intent == 'confirm_event') {
      await _edit(event);
      return;
    }
    if (intent == 'delete_event') {
      await _delete(event);
      return;
    }
    final fields = <String, dynamic>{};
    const mapping = {
      'update_title': 'title',
      'update_date': 'date',
      'update_start_time': 'startTime',
      'update_end_time': 'endTime'
    };
    if (intent == 'add_event') {
      for (final key in ['title', 'date', 'startTime', 'endTime']) {
        if (correction[key] != null) fields[key] = correction[key];
      }
    } else if (mapping.containsKey(intent)) {
      final field = mapping[intent]!;
      fields[field] = correction[field];
    } else {
      setState(() => _message = '這段語音不是目前行程的修正指令。');
      return;
    }
    await _run(() => _save(intent == 'add_event' ? null : event, fields));
  }

  DateTime _instant(Map event, bool end) {
    final date = DateTime.parse(event[end ? 'endDate' : 'startDate'] as String);
    final location = tz.getLocation(event['sourceTimezone'] as String);
    if (event['allDay'] == true) {
      return tz.TZDateTime(
          location, date.year, date.month, date.day + (end ? 1 : 0));
    }
    final parts = (event[end ? 'endTime' : 'startTime'] as String)
        .split(':')
        .map(int.parse)
        .toList();
    final value = tz.TZDateTime(
        location, date.year, date.month, date.day, parts[0], parts[1]);
    if (value.hour != parts[0] || value.minute != parts[1]) {
      throw StateError('這個時間因日光節約時間而不存在，請修改');
    }
    return value;
  }

  Future<void> _writeApple() => _run(() async {
        final api = ref.read(apiClientProvider);
        final scope = api.cacheScope;
        if (_events.any((event) => event['sourceTimezone'] == null)) {
          final confirmZone = await showDialog<bool>(
              context: context,
              builder: (context) => AlertDialog(
                      title: const Text('確認時區'),
                      content: const Text(
                          '截圖未標示時區。缺少時區的行程都使用台灣時間 Asia/Taipei 嗎？其他時區請返回逐筆編輯。'),
                      actions: [
                        TextButton(
                            onPressed: () => Navigator.pop(context, false),
                            child: const Text('返回編輯')),
                        FilledButton(
                            onPressed: () => Navigator.pop(context, true),
                            child: const Text('使用台灣時間'))
                      ]));
          if (confirmZone != true || !mounted || api.cacheScope != scope) {
            return;
          }
          for (final event in _events
              .where((event) => event['sourceTimezone'] == null)
              .toList()) {
            await _save(event, {'sourceTimezone': 'Asia/Taipei'});
          }
        }
        final preview = await api.request('POST', '/api/v1/imports/$_id',
            body: {'action': 'apple_preview', 'version': _version});
        final events = (preview['events'] as List).whereType<Map>().toList();
        final intervals = {
          for (final event in events)
            event['id']: (
              start: _instant(event, false),
              end: _instant(event, true)
            )
        };
        if (intervals.values.any((value) => !value.end.isAfter(value.start))) {
          throw StateError('結束必須晚於開始');
        }
        if (!mounted) return;
        if (_written.length == events.length) {
          await api.request('DELETE', '/api/v1/imports/$_id');
          if (mounted) {
            setState(() {
              _done = true;
              _message = '這些草稿已加入 Apple Calendar。';
            });
          }
          return;
        }
        final proceed = await showDialog<bool>(
            context: context,
            builder: (context) => AlertDialog(
                    title: Text('加入 ${events.length - _written.length} 個行程？'),
                    content: SingleChildScrollView(
                        child: Text(
                            '${events.where((e) => !_written.contains(e['id'])).map((e) => '${e['label']}\n${e['startDate']} ${e['allDay'] == true ? '全天' : '${e['startTime']}–${e['endDate']} ${e['endTime']}'} (${e['sourceTimezone']})').join('\n\n')}\n\n接著選擇 Apple Calendar 的目標日曆。')),
                    actions: [
                      TextButton(
                          onPressed: () => Navigator.pop(context, false),
                          child: const Text('返回修改')),
                      FilledButton(
                          onPressed: () => Navigator.pop(context, true),
                          child: const Text('繼續'))
                    ]));
        if (proceed != true || !mounted || api.cacheScope != scope) return;
        final service = ref.read(deviceCalendarServiceProvider);
        if (!await service.requestAccess()) {
          throw StateError('未取得日曆權限。草稿已保留，可到 iOS 設定允許後重試。');
        }
        final calendars = await service.calendars();
        if (calendars.isEmpty) {
          throw StateError('沒有可寫入的 Apple Calendar 日曆，請先在系統日曆建立。');
        }
        if (!mounted || api.cacheScope != scope) return;
        final target = await showDialog<String>(
            context: context,
            builder: (context) =>
                SimpleDialog(title: const Text('確認加入哪個日曆？'), children: [
                  ...calendars.map((calendar) => SimpleDialogOption(
                      onPressed: () =>
                          Navigator.pop(context, calendar['id'].toString()),
                      child: Text(
                          '確認加入「${calendar['title']}」${calendar['isDefault'] == true ? '（預設）' : ''}'))),
                  SimpleDialogOption(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('取消')),
                ]));
        if (target == null || !mounted || api.cacheScope != scope) return;
        for (final event in events) {
          if (_written.contains(event['id'])) continue;
          if (api.cacheScope != scope) throw StateError('帳號已變更，已停止寫入');
          final start = intervals[event['id']]!.start,
              end = intervals[event['id']]!.end;
          if (!end.isAfter(start)) throw StateError('結束必須晚於開始');
          final identifier = await service.writeEvent(
              title: event['label'] as String,
              start: start,
              end: end,
              calendarId: target,
              draftId: '$scope:$_id:${event['id']}',
              allDay: event['allDay'] == true,
              timeZone: event['sourceTimezone'] as String);
          if (identifier == null || identifier.isEmpty) {
            throw StateError('日曆未回傳儲存結果，請重試');
          }
          if (mounted) setState(() => _written.add(event['id'].toString()));
        }
        if (mounted) {
          setState(() {
            _done = true;
            _message = '已加入 Apple Calendar。';
          });
        }
        // Keep the import until cleanup succeeds; native draft IDs make retries idempotent.
        try {
          await api.request('DELETE', '/api/v1/imports/$_id');
        } catch (_) {/* completed IDs remain on device */}
      });

  @override
  Widget build(BuildContext context) {
    ref.listen<String?>(accountIdProvider, (previous, next) {
      if (previous != next && mounted) {
        Navigator.of(context).popUntil((route) => route.isFirst);
      }
    });
    return PopScope(
        canPop: !_busy,
        child: Scaffold(
          appBar: AppBar(title: const Text('TimeTree 截圖匯入')),
          body: ListView(padding: const EdgeInsets.all(20), children: [
            const Text('截圖 → 辨識 → 修正草稿 → 確認加入',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            const Text('只讀取你選擇的截圖。辨識文字與語音會送交 AI；日曆權限只在準備寫入時要求。'),
            if (_busy) const LinearProgressIndicator(),
            if (_message.isNotEmpty)
              Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Text(_message, semanticsLabel: _message)),
            if (_draft == null) ...[
              if (_shared.isNotEmpty) ...[
                const SizedBox(height: 16),
                const Text('從分享選單收到的截圖'),
                ..._shared.map((path) => ListTile(
                    leading: Image.file(File(path),
                        width: 48, height: 64, fit: BoxFit.cover),
                    title: const Text('待匯入截圖'),
                    onTap: _busy
                        ? null
                        : () => setState(() {
                              _image = path;
                              _key = aiRequestKey();
                            }),
                    trailing: IconButton(
                        tooltip: '刪除分享圖片',
                        onPressed: _busy
                            ? null
                            : () => _run(() async {
                                  await _screenshot.invokeMethod<void>(
                                      'removeSharedImage', {'path': path});
                                  if (mounted) {
                                    setState(() {
                                      _shared.remove(path);
                                      if (_image == path) _image = null;
                                    });
                                  }
                                }),
                        icon: const Icon(Icons.delete_outline)))),
              ],
              OutlinedButton.icon(
                  onPressed: _busy ? null : _pick,
                  icon: const Icon(Icons.photo_library_outlined),
                  label: const Text('選取 TimeTree 截圖')),
              if (_image != null) ...[
                Image.file(File(_image!), height: 220, fit: BoxFit.contain),
                FilledButton(
                    onPressed: _busy ? null : _analyze,
                    child: const Text('分析這張截圖')),
              ],
              if (_saved.isNotEmpty) ...[
                const SizedBox(height: 20),
                const Text('繼續先前的草稿（保留 24 小時）'),
                ..._saved.map((draft) => ListTile(
                    title: Text('${_eventsFor(draft).length} 個辨識事件'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: _busy ? null : () => _resume(draft)))
              ],
            ] else if (_draft!['status'] == 'rejected' ||
                _validation['category'] == 'non_calendar') ...[
              const Padding(
                  padding: EdgeInsets.all(24), child: Text('沒有偵測到可匯入的行程。')),
            ] else ...[
              const SizedBox(height: 16),
              if (_originalImage != null)
                Image.memory(_originalImage!, height: 220, fit: BoxFit.contain),
              Text(_validated
                  ? '行事曆畫面已確認，請檢查每個 Draft。'
                  : '可能是行事曆：只供預覽，不能加入 Calendar。請重選清楚的截圖。'),
              ..._events.map((event) => Card(
                  child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                                '${event['label'] ?? '名稱待確認'}${_written.contains(event['id']) ? ' · 已加入' : ' · Draft'}',
                                style: const TextStyle(
                                    fontSize: 19, fontWeight: FontWeight.bold)),
                            Text(
                                '${event['startDate'] ?? '日期待確認'} ${event['startTime'] ?? ''} → ${event['endDate'] ?? ''} ${event['endTime'] ?? ''}'),
                            Text(
                                event['sourceTimezone']?.toString() ?? '時區待確認'),
                            if ((event['unresolved'] as List? ?? []).isNotEmpty)
                              const Text('請編輯並確認缺少的資料'),
                            Wrap(spacing: 8, children: [
                              TextButton(
                                  onPressed: _busy || _hasWrites
                                      ? null
                                      : () => _edit(event),
                                  child: const Text('編輯／確認')),
                              TextButton(
                                  onPressed: _busy || _hasWrites
                                      ? null
                                      : () => _voice(event),
                                  child: const Text('語音修正')),
                              TextButton(
                                  onPressed: _busy || _hasWrites
                                      ? null
                                      : () => _delete(event),
                                  child: const Text('刪除')),
                            ]),
                          ])))),
              if (!_done) ...[
                OutlinedButton(
                    onPressed: _busy || _hasWrites || !_validated
                        ? null
                        : () => _edit(null),
                    child: const Text('新增漏掉的行程')),
                FilledButton.icon(
                    onPressed: _busy || !_validated || _events.isEmpty
                        ? null
                        : _writeApple,
                    icon: const Icon(Icons.event_available),
                    label:
                        Text(_hasWrites ? '繼續加入剩餘行程' : '確認加入 Apple Calendar')),
              ],
            ],
            if (_draft != null)
              TextButton(
                  onPressed: _busy
                      ? null
                      : () {
                          setState(() {
                            _draft = null;
                            _done = false;
                            _written.clear();
                            _image = null;
                            _originalImage = null;
                          });
                          _run(_load);
                        },
                  child: const Text('返回匯入列表')),
          ]),
        ));
  }
}

class _DraftEditor extends StatefulWidget {
  const _DraftEditor({this.event, required this.onSave});
  final Future<void> Function(Map<String, dynamic>) onSave;
  final Map<String, dynamic>? event;
  @override
  State<_DraftEditor> createState() => _DraftEditorState();
}

class _DraftEditorState extends State<_DraftEditor> {
  late final fields = <String, TextEditingController>{
    'title': TextEditingController(text: widget.event?['label'] as String?),
    'date': TextEditingController(text: widget.event?['startDate'] as String?),
    'endDate': TextEditingController(text: widget.event?['endDate'] as String?),
    'startTime':
        TextEditingController(text: widget.event?['startTime'] as String?),
    'endTime': TextEditingController(text: widget.event?['endTime'] as String?),
    'sourceTimezone': TextEditingController(
        text: widget.event?['sourceTimezone'] as String? ?? 'Asia/Taipei'),
  };
  late bool allDay = widget.event?['allDay'] == true;
  String error = '';
  bool saving = false;
  @override
  void dispose() {
    for (final c in fields.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PopScope(
      canPop: !saving,
      child: AlertDialog(
          title: Text(widget.event == null ? '新增草稿行程' : '編輯草稿'),
          content: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
            for (final entry in {
              'title': '事件名稱',
              'date': '開始日期 YYYY-MM-DD',
              'endDate': '結束日期 YYYY-MM-DD',
              'startTime': '開始 HH:mm',
              'endTime': '結束 HH:mm',
              'sourceTimezone': '時區'
            }.entries)
              if (!allDay || !['startTime', 'endTime'].contains(entry.key))
                TextField(
                    controller: fields[entry.key],
                    enabled: !saving,
                    decoration: InputDecoration(labelText: entry.value)),
            SwitchListTile(
                title: const Text('全天'),
                value: allDay,
                onChanged:
                    saving ? null : (value) => setState(() => allDay = value)),
            const Text('請確認日期、起訖及時區。只匯入這次顯示的事件，不建立重複規則。'),
            if (error.isNotEmpty) Text(error),
          ])),
          actions: [
            TextButton(
                onPressed: saving ? null : () => Navigator.pop(context),
                child: const Text('取消')),
            FilledButton(
                onPressed: saving
                    ? null
                    : () async {
                        final result = <String, dynamic>{
                          for (final entry in fields.entries)
                            if (entry.value.text.trim().isNotEmpty)
                              entry.key: entry.value.text.trim(),
                          'allDay': allDay,
                          'reviewed': true
                        };
                        if (![
                          'title',
                          'date',
                          'endDate',
                          'sourceTimezone',
                          if (!allDay) ...['startTime', 'endTime']
                        ].every(result.containsKey)) {
                          setState(() => error = '請填完名稱、日期、時間與時區');
                          return;
                        }
                        setState(() {
                          saving = true;
                          error = '';
                        });
                        try {
                          await widget.onSave(result);
                          if (context.mounted) Navigator.pop(context);
                        } catch (e) {
                          if (mounted) {
                            setState(() => error =
                                e is ApiException ? e.message : e.toString());
                          }
                        } finally {
                          if (mounted) setState(() => saving = false);
                        }
                      },
                child: const Text('儲存草稿'))
          ]));
}

class _VoiceDialog extends StatefulWidget {
  const _VoiceDialog(
      {required this.api,
      required this.importId,
      required this.version,
      required this.event});
  final ApiClient api;
  final String importId, version;
  final Map<String, dynamic> event;
  @override
  State<_VoiceDialog> createState() => _VoiceDialogState();
}

class _VoiceDialogState extends State<_VoiceDialog> {
  List<AiFile> files = [];
  bool busy = false;
  bool chinese = true;
  Map<String, dynamic>? result;
  String error = '';
  @override
  Widget build(BuildContext context) => PopScope(
      canPop: !busy,
      child: AlertDialog(
          title: const Text('語音修正目前行程'),
          content: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(widget.event['label']?.toString() ?? '草稿事件'),
            const Text('例如：不是三點，是四點。或：結束時間改成六點。'),
            SwitchListTile(
                title: const Text('中文語音使用 iOS 辨識'),
                subtitle: const Text('關閉則使用 Nebius 語音端點，語言依設定模型'),
                value: chinese,
                onChanged: busy
                    ? null
                    : (value) => setState(() {
                          chinese = value;
                          result = null;
                        })),
            AiMedia(
                images: false,
                enabled: !busy,
                onChanged: (value) => setState(() {
                      files = value;
                      result = null;
                    })),
            if (result != null)
              Text(
                  '${result!['transcript']}\n\n${_description(result!['correction'] as Map)}'),
            if (error.isNotEmpty) Text(error),
          ])),
          actions: [
            TextButton(
                onPressed: busy ? null : () => Navigator.pop(context),
                child: const Text('取消')),
            if (result == null)
              FilledButton(
                  onPressed: busy || files.isEmpty
                      ? null
                      : () async {
                          setState(() {
                            busy = true;
                            error = '';
                          });
                          try {
                            final transcript = chinese
                                ? await _screenshot.invokeMethod<String>(
                                    'transcribeChinese',
                                    {'path': files.first.path})
                                : null;
                            if (chinese &&
                                (transcript == null ||
                                    transcript.trim().isEmpty)) {
                              throw StateError('沒有辨識到語音');
                            }
                            final value = await widget.api.upload(
                                '/api/v1/imports/${widget.importId}/correct-voice',
                                requestKey: aiRequestKey(),
                                files: chinese ? [] : files,
                                fields: {
                                  'eventId': widget.event['id'].toString(),
                                  'version': widget.version,
                                  if (transcript != null)
                                    'transcript': transcript
                                });
                            if (mounted) setState(() => result = value);
                          } catch (e) {
                            if (mounted) setState(() => error = e.toString());
                          } finally {
                            if (mounted) setState(() => busy = false);
                          }
                        },
                  child: Text(busy ? '辨識中…' : '辨識修正')),
            if (result != null &&
                (result!['correction'] as Map)['intent'] != 'unsupported')
              FilledButton(
                  onPressed: () => Navigator.pop(context,
                      Map<String, dynamic>.from(result!['correction'] as Map)),
                  child: const Text('套用到草稿')),
          ]));
  String _description(Map c) => switch (c['intent']) {
        'update_title' => '名稱 → ${c['title']}',
        'update_date' => '日期 → ${c['date']}',
        'update_start_time' => '開始 → ${c['startTime']}',
        'update_end_time' => '結束 → ${c['endTime']}',
        'delete_event' => '刪除目前草稿（接著確認）',
        'confirm_event' => '開啟草稿確認，不會直接写入 Calendar',
        'add_event' =>
          '新增：${c['title']} ${c['date']} ${c['startTime']}–${c['endTime']}',
        _ => '這段語音不是目前行程的修正指令。',
      };
}
