import Flutter
import UIKit
import EventKit
import WidgetKit
import CryptoKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    ScreenshotImportBridge.register(messenger: engineBridge.applicationRegistrar.messenger())
    let widgets = FlutterMethodChannel(name: "com.yuema.mobile/widgets", binaryMessenger: engineBridge.applicationRegistrar.messenger())
    widgets.setMethodCallHandler { call, result in
      do {
        switch call.method {
        case "publish":
          guard let payload = call.arguments as? [String: Any] else { result(FlutterError(code: "INVALID_WIDGET", message: "Invalid snapshot", details: nil)); return }
          try WidgetStore.write(payload)
          WidgetCenter.shared.reloadAllTimelines()
          result(nil)
        case "clear":
          try WidgetStore.clear()
          WidgetCenter.shared.reloadAllTimelines()
          result(nil)
        case "read": result(WidgetStore.read())
        default: result(FlutterMethodNotImplemented)
        }
      } catch { result(FlutterError(code: "WIDGET_STORAGE", message: error.localizedDescription, details: nil)) }
    }
    let channel = FlutterMethodChannel(
      name: "com.yuema.mobile/calendar",
      binaryMessenger: engineBridge.applicationRegistrar.messenger()
    )
    let store = EKEventStore()
    channel.setMethodCallHandler { call, result in
      switch call.method {
      case "requestAccess":
        if #available(iOS 17.0, *) {
          store.requestFullAccessToEvents { granted, error in
            DispatchQueue.main.async { result(error == nil && granted) }
          }
        } else {
          store.requestAccess(to: .event) { granted, error in
            DispatchQueue.main.async { result(error == nil && granted) }
          }
        }
      case "readBusy":
        guard let args = call.arguments as? [String: Any], let startValue = args["start"] as? String, let endValue = args["end"] as? String, let start = Self.parseCalendarDate(startValue), let end = Self.parseCalendarDate(endValue) else { result(FlutterError(code: "INVALID_RANGE", message: "Invalid calendar range", details: nil)); return }
        let predicate = store.predicateForEvents(withStart: start, end: end, calendars: store.calendars(for: .event))
        let formatter = ISO8601DateFormatter()
        result(store.events(matching: predicate).compactMap { event -> [String: Any]? in
          guard event.availability != .free else { return nil }
          return ["id": event.eventIdentifier ?? UUID().uuidString, "startAt": formatter.string(from: event.startDate), "endAt": formatter.string(from: event.endDate), "tentative": event.availability == .tentative]
        })
      case "importedDraftIds":
        let ids = (call.arguments as? [String: Any])?["ids"] as? [String] ?? []
        result(ids.filter { UserDefaults.standard.string(forKey: "calendar-import-\($0)") != nil })
      case "listCalendars":
        result(store.calendars(for: .event).filter { $0.allowsContentModifications }.map { calendar in
          ["id": calendar.calendarIdentifier, "title": calendar.title, "isDefault": calendar.calendarIdentifier == store.defaultCalendarForNewEvents?.calendarIdentifier]
        })
      case "writeEvent":
        guard let args = call.arguments as? [String: Any], let title = args["title"] as? String, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, let startValue = args["start"] as? String, let endValue = args["end"] as? String, let start = Self.parseCalendarDate(startValue), let end = Self.parseCalendarDate(endValue), end > start, let calendarId = args["calendarId"] as? String, let calendar = store.calendars(for: .event).first(where: { $0.calendarIdentifier == calendarId && $0.allowsContentModifications }) else { result(FlutterError(code: "INVALID_EVENT", message: "Invalid event", details: nil)); return }
        let draftId = args["draftId"] as? String
        if let draftId, let savedId = UserDefaults.standard.string(forKey: "calendar-import-\(draftId)") { result(savedId); return }
        let marker = draftId.flatMap { id in URL(string: "yuema-import://draft/" + SHA256.hash(data: Data(id.utf8)).map { String(format: "%02x", $0) }.joined()) }
        if let marker, let draftId {
          let predicate = store.predicateForEvents(withStart: start.addingTimeInterval(-86400), end: end.addingTimeInterval(86400), calendars: nil)
          if let previous = store.events(matching: predicate).first(where: { $0.url == marker }), let identifier = previous.eventIdentifier {
            UserDefaults.standard.set(identifier, forKey: "calendar-import-\(draftId)"); result(identifier); return
          }
        }
        let event = EKEvent(eventStore: store); event.url = marker; event.title = title; event.startDate = start; event.endDate = end; event.calendar = calendar; event.isAllDay = args["allDay"] as? Bool ?? false; event.timeZone = TimeZone(identifier: args["timeZone"] as? String ?? "Asia/Taipei")
        do { try store.save(event, span: .thisEvent); if let draftId, let identifier = event.eventIdentifier { UserDefaults.standard.set(identifier, forKey: "calendar-import-\(draftId)") }; result(event.eventIdentifier) } catch { result(FlutterError(code: "WRITE_FAILED", message: error.localizedDescription, details: nil)) }
      default:
        result(FlutterMethodNotImplemented)
      }
    }
  }
  private static func parseCalendarDate(_ value: String) -> Date? {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: value) { return date }
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.date(from: value)
  }

}
