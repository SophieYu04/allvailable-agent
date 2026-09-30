import 'package:flutter/material.dart';

import '../services/api_client.dart';

mixin AsyncSaveForm<T extends StatefulWidget, D> on State<T> {
  bool _saving = false;
  String? _saveError;
  bool _conflict = false;
  Future<void> Function(D)? get save;
  Future<void> Function()? get reload;

  Future<void> submitForm(D draft) async {
    if (_saving || _conflict) return;
    setState(() {
      _saving = true;
      _saveError = null;
    });
    try {
      await save?.call(draft);
      if (mounted) {
        setState(() => _saving = false);
        Navigator.pop(context, draft);
      }
    } catch (error) {
      if (mounted)
        setState(() {
          _saving = false;
          _conflict = error is ApiException && error.status == 409;
          _saveError = error is ApiException && error.status == 401
              ? '登入已失效，內容仍保留；請重新登入後再試'
              : _conflict
                  ? '資料已更新，輸入已保留。請重新載入最新版本後確認儲存。'
                  : '無法儲存，內容已保留，請重試';
        });
    }
  }

  Widget guardSaveForm(Widget child) => PopScope(
        canPop: !_saving,
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          AbsorbPointer(absorbing: _saving, child: child),
          if (_saveError != null)
            Padding(padding: const EdgeInsets.all(8), child: Text(_saveError!)),
          if (_conflict && reload != null)
            TextButton(
                onPressed: _saving
                    ? null
                    : () async {
                        setState(() => _saving = true);
                        try {
                          await reload!();
                          if (mounted)
                            setState(() {
                              _conflict = false;
                              _saveError = '已載入最新版本；保留了你的輸入，請確認後再次儲存';
                            });
                        } catch (_) {
                          if (mounted)
                            setState(
                                () => _saveError = '無法載入最新資料，請連線後重試，或取消編輯');
                        } finally {
                          if (mounted) setState(() => _saving = false);
                        }
                      },
                child: const Text('重新載入最新版本')),
          if (_saving)
            const Padding(padding: EdgeInsets.all(8), child: Text('儲存中…')),
          TextButton(
              onPressed: _saving ? null : () => Navigator.pop(context),
              child: const Text('取消')),
        ]),
      );
}
