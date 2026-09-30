import 'dart:async';
import 'dart:io';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

typedef AiFile = ({String field, String path, String mime});
String aiRequestKey() {
  final bytes = List.generate(16, (_) => Random.secure().nextInt(256));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  final hex = bytes.map((v) => v.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

class AiMedia extends StatefulWidget {
  const AiMedia(
      {super.key,
      required this.onChanged,
      this.images = true,
      this.enabled = true});
  final void Function(List<AiFile>) onChanged;
  final bool images;
  final bool enabled;
  @override
  State<AiMedia> createState() => _AiMediaState();
}

class _AiMediaState extends State<AiMedia> with WidgetsBindingObserver {
  final _recorder = AudioRecorder();
  Timer? _timer;
  String? _temporaryAudio;
  bool _recording = false;
  bool _busy = false;
  String _message = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused && _recording) unawaited(_stop());
  }

  Future<void> _stop() async {
    if (!_recording) return;
    _timer?.cancel();
    setState(() {
      _recording = false;
      _busy = true;
    });
    try {
      final path = await _recorder.stop();
      if (!mounted) return;
      if (path != null) {
        _temporaryAudio = path;
        widget.onChanged([(field: 'audio', path: path, mime: 'audio/mp4')]);
      }
      setState(() => _message = '錄音已準備，按辨識才會上傳');
    } catch (_) {
      if (mounted) setState(() => _message = '錄音失敗，請重試');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _record() async {
    if (_recording) {
      await _stop();
      return;
    }
    setState(() => _busy = true);
    try {
      if (!await _recorder.hasPermission()) {
        if (mounted) setState(() => _message = '請在設定允許麥克風，或改用文字');
        return;
      }
      final directory = await getTemporaryDirectory();
      final old = _temporaryAudio;
      if (old != null && await File(old).exists()) await File(old).delete();
      final path = '${directory.path}/yuema-${aiRequestKey()}.m4a';
      await _recorder.start(const RecordConfig(encoder: AudioEncoder.aacLc),
          path: path);
      _temporaryAudio = path;
      if (!mounted) {
        await _recorder.stop();
        return;
      }
      widget.onChanged([]);
      setState(() {
        _recording = true;
        _message = '錄音中，最長六十秒';
      });
      _timer = Timer(const Duration(seconds: 60), () => unawaited(_stop()));
    } catch (_) {
      if (mounted) setState(() => _message = '無法開始錄音');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pick() async {
    setState(() => _busy = true);
    try {
      final files = await ImagePicker().pickMultiImage(
          limit: 5, imageQuality: 90, requestFullMetadata: false);
      if (!mounted || files.isEmpty) return;
      if (files.length > 5) throw StateError('最多五張');
      final output = <AiFile>[];
      for (final file in files) {
        final path = file.path.toLowerCase();
        final mime = path.endsWith('.png')
            ? 'image/png'
            : path.endsWith('.webp')
                ? 'image/webp'
                : 'image/jpeg';
        output.add((field: 'images', path: file.path, mime: mime));
      }
      widget.onChanged(output);
      setState(() => _message = '已選 ${files.length} 張，按辨識才會上傳');
    } catch (_) {
      if (mounted) setState(() => _message = '無法讀取圖片，請重選 PNG、JPEG 或 WebP');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    final path = _temporaryAudio;
    unawaited(_recorder.dispose().then((_) async {
      if (path != null && await File(path).exists()) await File(path).delete();
    }));
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 8, children: [
          if (widget.images)
            OutlinedButton.icon(
                onPressed:
                    widget.enabled && !_busy && !_recording ? _pick : null,
                icon: const Icon(Icons.photo_library_outlined),
                label: const Text('選截圖')),
          OutlinedButton.icon(
              onPressed: widget.enabled && !_busy ? _record : null,
              icon: Icon(_recording ? Icons.stop : Icons.mic_none),
              label: Text(_recording ? '停止錄音' : '錄音')),
        ]),
        if (_message.isNotEmpty) Text(_message),
        const Text('選定的圖片或錄音會送交 AI 辨識；結果先預覽，確認後才套用。'),
      ]);
}
