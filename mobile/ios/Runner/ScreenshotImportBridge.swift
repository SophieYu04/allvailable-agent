import Flutter
import UIKit
import Vision
import Speech

final class ScreenshotImportBridge {
    private static var speechTask: SFSpeechRecognitionTask?
    private static var speechRecognizer: SFSpeechRecognizer?
    static func register(messenger: FlutterBinaryMessenger) {
        let channel = FlutterMethodChannel(name: "com.yuema.mobile/screenshot", binaryMessenger: messenger)
        channel.setMethodCallHandler { call, result in
            switch call.method {
            case "transcribeChinese":
                guard speechTask == nil, let args = call.arguments as? [String: Any], let path = args["path"] as? String else {
                    result(FlutterError(code: "SPEECH_BUSY", message: "已有辨識正在進行", details: nil)); return
                }
                SFSpeechRecognizer.requestAuthorization { status in
                    DispatchQueue.main.async {
                        guard status == .authorized, let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "zh-TW")), recognizer.isAvailable else {
                            result(FlutterError(code: "SPEECH_UNAVAILABLE", message: "中文語音辨識未開放，請到設定允許語音辨識，或改用手動編輯", details: nil)); return
                        }
                        speechRecognizer = recognizer
                        let request = SFSpeechURLRecognitionRequest(url: URL(fileURLWithPath: path))
                        request.shouldReportPartialResults = false
                        request.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition
                        var completed = false
                        func finish(_ value: Any) {
                            guard !completed else { return }; completed = true
                            speechTask?.cancel(); speechTask = nil; speechRecognizer = nil
                            result(value)
                        }
                        speechTask = recognizer.recognitionTask(with: request) { response, error in
                            DispatchQueue.main.async {
                                if let response, response.isFinal { finish(response.bestTranscription.formattedString) }
                                else if error != nil { finish(FlutterError(code: "SPEECH_FAILED", message: "無法辨識這段中文，請重錄或手動修正", details: nil)) }
                            }
                        }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 65) { finish(FlutterError(code: "SPEECH_TIMEOUT", message: "語音辨識逾時，請重試", details: nil)) }
                    }
                }
            case "recognize":
                guard let args = call.arguments as? [String: Any], let path = args["path"] as? String else {
                    result(FlutterError(code: "IMAGE_INVALID", message: "請重新選擇圖片", details: nil)); return
                }
                DispatchQueue.global(qos: .userInitiated).async {
                    do {
                        guard let image = UIImage(contentsOfFile: path), image.size.width > 0, image.size.height > 0 else { throw ImportError.invalidImage }
                        let scale = min(1, 2400 / max(image.size.width, image.size.height))
                        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
                        let format = UIGraphicsImageRendererFormat(); format.scale = 1
                        let normalized = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
                        guard let cgImage = normalized.cgImage else { throw ImportError.invalidImage }
                        let request = VNRecognizeTextRequest()
                        request.recognitionLevel = .accurate
                        request.recognitionLanguages = ["zh-Hant", "en-US", "ja-JP"]
                        request.usesLanguageCorrection = false
                        try VNImageRequestHandler(cgImage: cgImage).perform([request])
                        let lines: [[String: Any]] = (request.results ?? []).prefix(500).compactMap { observation in
                            guard let candidate = observation.topCandidates(1).first else { return nil }
                            let box = observation.boundingBox
                            return ["text": String(candidate.string.prefix(1000)), "confidence": Double(candidate.confidence), "x": box.minX, "y": box.minY, "width": box.width, "height": box.height]
                        }
                        DispatchQueue.main.async { result(lines) }
                    } catch { DispatchQueue.main.async { result(FlutterError(code: "OCR_FAILED", message: "無法讀取圖片文字，請選擇清楚的原始截圖", details: nil)) } }
                }
            case "sharedImages":
                guard let directory = sharedDirectory() else { result([]); return }
                let urls = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.creationDateKey])) ?? []
                let valid = urls.filter { url in
                    guard url.pathExtension == "jpg" else { return false }
                    let date = (try? url.resourceValues(forKeys: [.creationDateKey]))?.creationDate ?? .distantPast
                    if Date().timeIntervalSince(date) > 86400 { try? FileManager.default.removeItem(at: url); return false }
                    return true
                }.sorted { $0.lastPathComponent < $1.lastPathComponent }
                result(valid.map { $0.path })
            case "removeSharedImage":
                guard let args = call.arguments as? [String: Any], let path = args["path"] as? String,
                      let directory = sharedDirectory(), URL(fileURLWithPath: path).deletingLastPathComponent().standardizedFileURL == directory.standardizedFileURL else {
                    result(FlutterError(code: "INVALID_SHARE", message: "分享檔案無效", details: nil)); return
                }
                do { try FileManager.default.removeItem(atPath: path); result(nil) }
                catch { result(FlutterError(code: "SHARE_REMOVE_FAILED", message: "無法清除分享圖片", details: nil)) }
            default: result(FlutterMethodNotImplemented)
            }
        }
    }
    private static func sharedDirectory() -> URL? {
        guard let group = Bundle.main.object(forInfoDictionaryKey: "WidgetAppGroup") as? String,
              let root = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else { return nil }
        return root.appendingPathComponent("CalendarImport", isDirectory: true)
    }
    private enum ImportError: Error { case invalidImage }
}
