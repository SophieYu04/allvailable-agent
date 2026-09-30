import Foundation

// Shared only by the containing app and its WidgetKit extension. No auth tokens.
enum WidgetStore {
    static var group: String { Bundle.main.object(forInfoDictionaryKey: "WidgetAppGroup") as? String ?? "group.com.yuema.mobile.widgets" }
    static var url: URL? { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?.appendingPathComponent("widgets.json") }
    static func read() -> [String: Any] {
        guard let url, let data = try? Data(contentsOf: url),
              let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return value
    }
    static func write(_ value: [String: Any]) throws {
        guard let url else { throw CocoaError(.fileNoSuchFile) }
        let data = try JSONSerialization.data(withJSONObject: value)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    static func clear() throws { if let url, FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) } }
}
