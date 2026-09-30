import EventKit
import Foundation

/// Native adapter used by the Pigeon `DeviceCalendarApi` implementation.
/// It intentionally returns only interval state and stable identifiers.
final class CalendarEventKitAdapter {
    private let store = EKEventStore()

    @available(iOS 17.0, *)
    func requestAccess() async -> Bool {
        do { return try await store.requestFullAccessToEvents() } catch { return false }
    }

    func busy(start: Date, end: Date) -> [[String: Any]] {
        let predicate = store.predicateForEvents(withStart: start, end: end, calendars: store.calendars(for: .event))
        return store.events(matching: predicate).compactMap { event in
            guard event.availability != .free else { return nil }
            return [
                "id": event.eventIdentifier ?? UUID().uuidString,
                "startAt": event.startDate.timeIntervalSince1970,
                "endAt": event.endDate.timeIntervalSince1970,
                "tentative": event.availability == .tentative,
            ]
        }
    }

    func write(title: String, start: Date, end: Date, calendarIdentifier: String) throws -> String {
        guard let calendar = store.calendars(for: .event).first(where: { $0.calendarIdentifier == calendarIdentifier }) else { throw NSError(domain: "CalendarEventKitAdapter", code: 404) }
        let event = EKEvent(eventStore: store)
        event.title = title
        event.startDate = start
        event.endDate = end
        event.calendar = calendar
        try store.save(event, span: .thisEvent)
        return event.eventIdentifier ?? ""
    }
}
