import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../state/providers.dart';
import '../widgets/ai_media.dart';

const _labels = {
  'name': '邀約名稱',
  'dateStart': '開始日期',
  'dateEnd': '結束日期',
  'dailyStart': '每日開始',
  'dailyEnd': '每日結束',
  'duration': '活動分鐘',
  'deadline': '回覆截止'
};

class AiCoordinationScreen extends ConsumerStatefulWidget {
  const AiCoordinationScreen({super.key, this.gatheringId});
  final String? gatheringId;
  @override
  ConsumerState<AiCoordinationScreen> createState() =>
      _AiCoordinationScreenState();
}

class _AiCoordinationScreenState extends ConsumerState<AiCoordinationScreen> {
  final _text = TextEditingController();
  String _key = aiRequestKey();
  List<AiFile> _files = [];
  Map<String, dynamic>? _proposal;
  Map<String, dynamic>? _before;
  int _affectedSubmissions = 0;
  String _message = '';
  bool _busy = false;
  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() task) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _message = '';
    });
    try {
      await task();
    } catch (e) {
      if (mounted) setState(() => _message = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _preview() => _run(() async {
        final result = await ref
            .read(apiClientProvider)
            .request('POST', '/api/v1/coordination/proposals', body: {
          'requestKey': _key,
          'text': _text.text,
          if (widget.gatheringId != null) 'gatheringId': widget.gatheringId,
        });
        if (mounted)
          setState(() {
            _proposal = Map<String, dynamic>.from(result['proposal'] as Map);
            _affectedSubmissions =
                (result['affectedSubmissions'] as num?)?.toInt() ?? 0;
            _before = result['before'] is Map
                ? Map<String, dynamic>.from(result['before'] as Map)
                : null;
          });
      });
  Future<void> _transcribe() => _run(() async {
        final result = await ref.read(apiClientProvider).upload(
            '/api/v1/coordination/proposals',
            requestKey: _key,
            files: _files);
        if (mounted)
          setState(() {
            _text.text = '${_text.text}\n${result['transcript']}'.trim();
            _proposal = null;
          });
      });
  Future<void> _apply() => _run(() async {
        final result = await ref.read(apiClientProvider).request(
            'POST', '/api/v1/coordination/proposals',
            body: {'action': 'apply', 'proposalId': _proposal!['id']});
        ref.invalidate(gatheringsProvider);
        if (widget.gatheringId != null)
          ref.invalidate(gatheringProvider(widget.gatheringId!));
        if (mounted)
          Navigator.pop(
              context, (result['gathering'] as Map)['id']?.toString());
      });
  @override
  Widget build(BuildContext context) {
    final input = _proposal?['input'] as Map?;
    final questions = _proposal?['questions'] as List? ?? [];
    return Scaffold(
        appBar: AppBar(
            title: Text(widget.gatheringId == null ? 'AI 建立邀約' : 'AI 調整邀約')),
        body: ListView(padding: const EdgeInsets.all(20), children: [
          TextField(
              controller: _text,
              enabled: !_busy,
              maxLines: 5,
              maxLength: 6000,
              decoration: const InputDecoration(
                  labelText: '描述需求或補充缺少的條件',
                  hintText: '例如：下週五晚上七點到九點吃飯，兩小時，週三中午截止回覆'),
              onChanged: (_) => setState(() {
                    _key = aiRequestKey();
                    _proposal = null;
                  })),
          AiMedia(
              images: false,
              enabled: !_busy,
              onChanged: (files) => setState(() {
                    _files = files;
                    _key = aiRequestKey();
                  })),
          if (_files.isNotEmpty)
            OutlinedButton(
                onPressed: _busy ? null : _transcribe,
                child: const Text('辨識錄音為文字')),
          FilledButton(
              onPressed: _busy || _text.text.trim().isEmpty ? null : _preview,
              child: Text(_busy ? '處理中…' : '產生預覽')),
          if (_message.isNotEmpty)
            Padding(padding: const EdgeInsets.all(12), child: Text(_message)),
          if (input != null) ...[
            const SizedBox(height: 20),
            const Text('確認邀約條件（台灣時間）', style: TextStyle(fontSize: 20)),
            ..._labels.entries.map((entry) => ListTile(
                title: Text(entry.value),
                subtitle: Text(
                    '${_before != null && _before![entry.key] != input[entry.key] ? '${_before![entry.key] ?? '未設定'} → ' : ''}${input[entry.key] ?? '請補充'}'))),
            ...questions.map((q) => Padding(
                padding: const EdgeInsets.all(8), child: Text(q.toString()))),
            if (widget.gatheringId != null)
              Text(
                  '此次調整將使 $_affectedSubmissions 份提交需要重新確認。保留範圍內草稿，新格未填；推薦需重算。'),
            FilledButton(
                onPressed: _busy || questions.isNotEmpty ? null : _apply,
                child: Text(widget.gatheringId == null ? '確認建立邀約' : '確認套用調整')),
          ],
          TextButton(
              onPressed: _busy ? null : () => Navigator.pop(context),
              child: const Text('返回手動操作')),
        ]));
  }
}

class AiAvailabilityScreen extends ConsumerStatefulWidget {
  const AiAvailabilityScreen(
      {super.key,
      required this.gatheringId,
      required this.version,
      required this.startDate,
      required this.endDate});
  final String gatheringId, version, startDate, endDate;
  @override
  ConsumerState<AiAvailabilityScreen> createState() =>
      _AiAvailabilityScreenState();
}

class _AiAvailabilityScreenState extends ConsumerState<AiAvailabilityScreen> {
  final _answer = TextEditingController();
  List<AiFile> _files = [];
  String _key = aiRequestKey();
  Map<String, dynamic>? _import;
  Map<String, dynamic>? _preview;
  final Set<String> _selected = {};
  bool _busy = false;
  String _message = '';
  String get _id => (_import?['importId'] ?? _import?['id']).toString();
  @override
  void dispose() {
    _answer.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() task) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _message = '';
    });
    try {
      await task();
    } catch (e) {
      if (mounted) setState(() => _message = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _upload() => _run(() async {
        final result = await ref.read(apiClientProvider).upload(
            '/api/v1/imports',
            requestKey: _key,
            files: _files,
            fields: {'gatheringId': widget.gatheringId});
        if (mounted)
          setState(() {
            _import = result;
            _preview = null;
          });
      });
  Future<void> _clarify(Map question, String value) => _run(() async {
        final result = await ref
            .read(apiClientProvider)
            .request('POST', '/api/v1/imports/$_id', body: {
          'action': 'clarify',
          'version': _import!['version'].toString(),
          'answer': {'questionId': question['id'], 'value': value},
        });
        if (mounted)
          setState(() {
            _import = result;
            _answer.clear();
            _preview = null;
          });
      });
  Future<void> _makePreview() => _run(() async {
        final result = await ref
            .read(apiClientProvider)
            .request('POST', '/api/v1/imports/$_id', body: {
          'action': 'preview',
          'version': _import!['version'].toString(),
          'targetVersion': widget.version,
          'range': {'startDate': widget.startDate, 'endDate': widget.endDate},
        });
        if (mounted)
          setState(() {
            _preview = result;
            _selected.clear();
            for (final change in result['changes'] as List? ?? []) {
              if (change['before'] == 'unknown')
                _selected.add(change['key'].toString());
            }
          });
      });
  Future<void> _apply() => _run(() async {
        final changes = (_preview!['changes'] as List)
            .where((c) => _selected.contains(c['key']))
            .map((c) => {'key': c['key'], 'status': c['after']})
            .toList();
        await ref
            .read(apiClientProvider)
            .request('POST', '/api/v1/imports/$_id', body: {
          'action': 'apply',
          'version': _import!['version'].toString(),
          'targetVersion': widget.version,
          'previewId': _preview!['previewId'],
          'selectedChanges': changes,
        });
        ref.invalidate(gatheringProvider(widget.gatheringId));
        if (mounted) Navigator.pop(context, true);
      });
  @override
  Widget build(BuildContext context) {
    const statuses = {
      'red': '不行',
      'yellow': '待確認',
      'green': '可以',
      'unknown': '未填'
    };
    final extraction = _import?['extraction'] as Map?;
    final questions = extraction?['questions'] as List? ?? [];
    final question = questions.isEmpty ? null : questions.first as Map;
    return Scaffold(
        appBar: AppBar(title: const Text('AI 帶入空檔')),
        body: ListView(padding: const EdgeInsets.all(20), children: [
          AiMedia(
              enabled: !_busy,
              onChanged: (files) => setState(() {
                    _files = files;
                    _key = aiRequestKey();
                    _import = null;
                    _preview = null;
                  })),
          FilledButton(
              onPressed: _busy || _files.isEmpty ? null : _upload,
              child: Text(_busy ? '處理中…' : '辨識並預覽')),
          if (_message.isNotEmpty) Text(_message),
          if (_import?['status'] == 'rejected')
            const Text('沒有辨識到行程，請換一張日曆截圖或手動填寫'),
          if (question != null) ...[
            Text(question['prompt'].toString()),
            if (question['options'] is List)
              Wrap(
                  spacing: 8,
                  children: (question['options'] as List)
                      .map((option) => OutlinedButton(
                          onPressed: _busy
                              ? null
                              : () => _clarify(question, option.toString()),
                          child: Text(option.toString())))
                      .toList()),
            TextField(
                controller: _answer,
                enabled: !_busy,
                decoration: const InputDecoration(
                    labelText: '輸入答案（日期 YYYY-MM-DD、時間 HH:mm-HH:mm）')),
            TextButton(
                onPressed:
                    _busy ? null : () => _clarify(question, _answer.text),
                child: const Text('確認答案')),
          ],
          if (_import != null &&
              question == null &&
              _import!['status'] != 'rejected')
            OutlinedButton(
                onPressed: _busy ? null : _makePreview,
                child: const Text('查看差異')),
          if (_preview != null) ...[
            const Text('既有選擇預設不覆蓋；請勾選要套用的差異。套用只更新草稿，不會正式提交。'),
            if ((_preview!['changes'] as List).isEmpty) const Text('沒有需要更新的格子'),
            ...(_preview!['changes'] as List).map((c) => CheckboxListTile(
                value: _selected.contains(c['key']),
                onChanged: _busy
                    ? null
                    : (value) => setState(() {
                          value == true
                              ? _selected.add(c['key'].toString())
                              : _selected.remove(c['key']);
                        }),
                title: Text(c['key'].toString()),
                subtitle: Text(
                    '${statuses[c['before']]} → ${statuses[c['after']]}'))),
            FilledButton(
                onPressed: _busy || _selected.isEmpty ? null : _apply,
                child: const Text('確認套用到草稿')),
          ],
        ]));
  }
}
