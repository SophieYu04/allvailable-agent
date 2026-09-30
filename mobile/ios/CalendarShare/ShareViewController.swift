import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    private let message = UILabel()
    private let save = UIButton(type: .system)
    private var image: UIImage?
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        message.numberOfLines = 0
        message.text = "正在讀取截圖…"
        save.setTitle("儲存到約嗎待匯入", for: .normal)
        save.isEnabled = false
        save.addTarget(self, action: #selector(saveImage), for: .touchUpInside)
        let cancel = UIButton(type: .system)
        cancel.setTitle("取消", for: .normal)
        cancel.addTarget(self, action: #selector(close), for: .touchUpInside)
        let stack = UIStackView(arrangedSubviews: [message, save, cancel])
        stack.axis = .vertical; stack.spacing = 24; stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24), stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24), stack.centerYAnchor.constraint(equalTo: view.centerYAnchor)])
        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }.filter { $0.hasItemConformingToTypeIdentifier(UTType.image.identifier) }
        guard providers.count == 1, let provider = providers.first,
              let type = provider.registeredTypeIdentifiers.first(where: { UTType($0)?.conforms(to: .image) == true }) else { message.text = "請一次分享一張 TimeTree 截圖。"; return }
        provider.loadDataRepresentation(forTypeIdentifier: type) { [weak self] data, _ in
            DispatchQueue.main.async {
                guard let self, let data, data.count <= 20 * 1024 * 1024, let image = UIImage(data: data) else { self?.message.text = "無法讀取截圖，請回到照片重選。"; return }
                self.image = image
                self.message.text = "將這張截圖保存到約嗎。開啟約嗎後，先辨識與修正，再確認加入 Apple Calendar。"
                self.save.isEnabled = true
            }
        }
    }
    @objc private func saveImage() {
        save.isEnabled = false
        guard let image, let group = Bundle.main.object(forInfoDictionaryKey: "WidgetAppGroup") as? String,
              let root = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else { message.text = "分享儲存空間未啟用，請直接在約嗎選取截圖。"; return }
        do {
            let directory = root.appendingPathComponent("CalendarImport", isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.creationDateKey])
            for file in files {
                let created = (try? file.resourceValues(forKeys: [.creationDateKey]))?.creationDate ?? .distantPast
                if Date().timeIntervalSince(created) > 86400 { try? FileManager.default.removeItem(at: file) }
            }
            guard (try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)).count < 5 else { message.text = "已有五張待匯入圖片，請先開啟約嗎處理。"; return }
            let scale = min(1, 2400 / max(image.size.width, image.size.height))
            let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
            let format = UIGraphicsImageRendererFormat(); format.scale = 1
            let normalized = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
            guard let data = normalized.jpegData(compressionQuality: 0.9), data.count <= 5 * 1024 * 1024 else { message.text = "圖片太大，請裁切為單張行事曆畫面後再分享。"; return }
            let file = directory.appendingPathComponent("\(UUID().uuidString).jpg")
            try data.write(to: file, options: [.atomic, .completeFileProtection])
            message.text = "已儲存。請開啟約嗎，在「匯入截圖」繼續。圖片保留 24 小時。"
            save.setTitle("完成", for: .normal)
            save.removeTarget(self, action: #selector(saveImage), for: .touchUpInside)
            save.addTarget(self, action: #selector(close), for: .touchUpInside)
            save.isEnabled = true
        } catch { message.text = "儲存失敗，請重試。"; save.isEnabled = true }
    }
    @objc private func close() { extensionContext?.completeRequest(returningItems: nil) }
}
