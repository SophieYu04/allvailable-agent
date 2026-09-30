import SwiftUI
import WidgetKit

private var taipei: Calendar {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone(identifier: "Asia/Taipei")!
    c.firstWeekday = 2
    return c
}
private func key(_ date: Date) -> String {
    let f = DateFormatter(); f.calendar = taipei; f.timeZone = taipei.timeZone; f.dateFormat = "yyyy-MM-dd"
    return f.string(from: date)
}
private func day(_ value: String) -> Date? {
    let f = DateFormatter(); f.calendar = taipei; f.timeZone = taipei.timeZone; f.dateFormat = "yyyy-MM-dd"
    return f.date(from: value)
}
private func rows(_ value: Any?) -> [[String: Any]] { value as? [[String: Any]] ?? [] }
private func string(_ row: [String: Any], _ field: String) -> String { row[field] as? String ?? "" }
private func icon(_ value: String) -> String {
    switch value { case "book", "reading", "讀書": return "book.closed"
    case "exercise", "fitness", "運動": return "figure.run"
    case "language", "英文": return "character.book.closed"
    default: return "star" }
}
private func duration(_ seconds: Double) -> String {
    let n = max(0, Int(seconds)); return String(format: "%02d:%02d", n / 3600, (n % 3600) / 60)
}
private let accent = Color(red: 0.30, green: 0.48, blue: 0.70)

struct PlannerEntry: TimelineEntry {
    let date: Date
    let data: [String: Any]
    var valid: Bool {
        guard let updated = data["updatedAt"] as? Double else { return false }
        return !string(data, "account").isEmpty && date.timeIntervalSince1970 - updated < 6 * 3600
    }
    func link(_ action: String, id: String = "", value: String = "") -> URL {
        var u = URLComponents(); u.scheme = "com.yuema.mobile"; u.host = "widget"
        u.queryItems = [URLQueryItem(name: "action", value: action), URLQueryItem(name: "id", value: id),
                       URLQueryItem(name: "value", value: value), URLQueryItem(name: "day", value: key(date)),
                       URLQueryItem(name: "account", value: string(data, "account")),
                       URLQueryItem(name: "nonce", value: string(data, "nonce"))]
        return u.url!
    }
}
struct PlannerProvider: TimelineProvider {
    func placeholder(in context: Context) -> PlannerEntry { PlannerEntry(date: Date(), data: [:]) }
    func getSnapshot(in context: Context, completion: @escaping (PlannerEntry) -> Void) {
        completion(PlannerEntry(date: Date(), data: WidgetStore.read()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<PlannerEntry>) -> Void) {
        let now = Date(), data = WidgetStore.read()
        let midnight = taipei.date(byAdding: .day, value: 1, to: taipei.startOfDay(for: now))!
        let expiry = Date(timeIntervalSince1970: (data["updatedAt"] as? Double ?? 0) + 6 * 3600)
        var dates = [now, midnight]
        if expiry > now { dates.append(expiry) }
        completion(Timeline(entries: dates.sorted().map { PlannerEntry(date: $0, data: data) }, policy: .after(now.addingTimeInterval(1800))))
    }
}

struct WidgetSurface: View {
    let entry: PlannerEntry
    let kind: String
    @Environment(\.widgetFamily) var family
    var body: some View {
        Group {
            if entry.valid {
                switch kind {
                case "week": calendar(month: false)
                case "month": calendar(month: true)
                case "deadline": deadlines
                case "goals": goals
                case "focus": focus
                default: ranking
                }
            } else {
                Link(destination: entry.link("open")) {
                    Image(systemName: "arrow.clockwise").font(.title2).foregroundStyle(accent)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .accessibilityLabel("開啟約嗎更新小工具")
                }
            }
        }
        .containerBackground(.background, for: .widget)
        .widgetURL(entry.link(kind))
        .privacySensitive()
    }
    func calendar(month: Bool) -> some View {
        let date = entry.date
        let start = month ? taipei.date(from: taipei.dateComponents([.year, .month], from: date))! : taipei.dateInterval(of: .weekOfYear, for: date)!.start
        let count = month ? taipei.range(of: .day, in: .month, for: date)!.count : 7
        let offset = month ? (taipei.component(.weekday, from: start) + 5) % 7 : 0
        return VStack(alignment: .leading, spacing: month ? 6 : 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(String(format: "%02d", taipei.component(.month, from: date))).font(.system(size: 24, weight: .semibold, design: .rounded))
                Spacer()
                if month { Text(String(taipei.component(.year, from: date))).font(.caption2).foregroundStyle(.secondary) }
                else { Image(systemName: "calendar").foregroundStyle(.secondary) }
            }
            HStack { ForEach(["一", "二", "三", "四", "五", "六", "日"], id: \.self) { Text($0).font(.system(size: 10)).foregroundStyle(.secondary).frame(maxWidth: .infinity) } }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 7), spacing: month ? 5 : 0) {
                ForEach(0..<(count + offset), id: \.self) { index in
                    if index < offset { Color.clear.frame(height: 30) }
                    else { dateCell(taipei.date(byAdding: .day, value: index - offset, to: start)!, month: month) }
                }
            }
            Spacer(minLength: 0)
        }
    }
    func dateCell(_ date: Date, month: Bool) -> some View {
        let dateKey = key(date)
        let events = rows(entry.data["events"]).filter { string($0, "startDay") <= dateKey && string($0, "endDay") >= dateKey }
        let stamps = rows(entry.data["goals"]).filter { ($0["dates"] as? [String] ?? []).contains(dateKey) }
        return VStack(spacing: 3) {
            Text(String(taipei.component(.day, from: date))).font(.system(size: 12, weight: .medium))
                .frame(width: 23, height: 23)
                .background(taipei.isDate(date, inSameDayAs: entry.date) ? accent : .clear, in: Circle())
                .foregroundStyle(taipei.isDate(date, inSameDayAs: entry.date) ? .white : .primary)
            if month {
                HStack(spacing: 2) { ForEach(Array(events.prefix(2).enumerated()), id: \.offset) { _, _ in Capsule().fill(accent.opacity(0.6)).frame(height: 3) } }.frame(height: 3)
                HStack(spacing: 2) {
                    ForEach(Array(stamps.prefix(2).enumerated()), id: \.offset) { _, g in Image(systemName: icon(string(g, "icon"))).font(.system(size: 8)).accessibilityLabel(string(g, "title") + "已完成") }
                    if stamps.count > 2 { Text("+\(stamps.count - 2)").font(.system(size: 8)) }
                }.foregroundStyle(accent).frame(height: 10)
            } else {
                ForEach(Array(events.prefix(2).enumerated()), id: \.offset) { _, event in
                    Text(string(event, "title")).font(.system(size: 10)).lineLimit(1).frame(maxWidth: .infinity)
                        .padding(.vertical, 4).background(accent.opacity(0.10), in: RoundedRectangle(cornerRadius: 4))
                }
                if events.count > 2 { Text("+\(events.count - 2)").font(.system(size: 9)).foregroundStyle(.secondary) }
                Spacer(minLength: 0)
            }
        }.frame(maxHeight: .infinity, alignment: .top)
    }
    var deadlines: some View {
        let items = rows(entry.data["deadlines"])
        return VStack(spacing: 12) {
            if let first = items.first { deadlineRow(first, prominent: true) }
            else { empty("flag", action: "calendar") }
            if family != .systemSmall { ForEach(Array(items.dropFirst().prefix(2).enumerated()), id: \.offset) { _, d in deadlineRow(d, prominent: false) } }
        }
    }
    func deadlineRow(_ item: [String: Any], prominent: Bool) -> some View {
        let due = day(string(item, "dueOn")) ?? entry.date
        let days = taipei.dateComponents([.day], from: taipei.startOfDay(for: entry.date), to: due).day ?? 0
        let completed = item["completed"] as? Bool ?? false
        return HStack {
            VStack(alignment: .leading, spacing: 6) {
                if prominent { Image(systemName: "flag").foregroundStyle(accent) }
                Text(string(item, "title")).font(.subheadline).lineLimit(2)
                Text(String(string(item, "dueOn").suffix(5)).replacingOccurrences(of: "-", with: ".")).font(.caption2).foregroundStyle(.secondary)
            }
            Spacer(minLength: 6)
            if completed { Image(systemName: "checkmark.circle").font(.title).foregroundStyle(.secondary) }
            else if days < 0 { Image(systemName: "calendar.badge.exclamationmark").font(.title).accessibilityLabel("已截止") }
            else { HStack(alignment: .firstTextBaseline, spacing: 3) { Text("\(days)").font(.system(size: prominent ? 54 : 22, weight: .light, design: .rounded)); Text("天").font(.caption2).foregroundStyle(.secondary) }.minimumScaleFactor(0.6) }
        }.opacity(completed ? 0.5 : 1)
    }
    var goals: some View {
        let items = rows(entry.data["goals"])
        return Group {
            if items.isEmpty { empty("plus", action: "goals") }
            else { HStack(spacing: 12) {
                ForEach(Array(items.prefix(family == .systemSmall ? 1 : 3).enumerated()), id: \.offset) { _, goal in
                    let checked = (goal["dates"] as? [String] ?? []).contains(key(entry.date))
                    Link(destination: entry.link("checkin", id: string(goal, "id"), value: checked ? "false" : "true")) {
                        VStack(spacing: 9) {
                            Image(systemName: icon(string(goal, "icon"))).font(.title2).frame(width: 54, height: 54)
                                .foregroundStyle(checked ? .white : accent)
                                .background(checked ? accent : accent.opacity(0.1), in: RoundedRectangle(cornerRadius: 19))
                                .overlay(alignment: .bottomTrailing) { if checked { Image(systemName: "checkmark.circle.fill").symbolRenderingMode(.palette).foregroundStyle(accent, .background).offset(x: 4, y: 4) } }
                            Text(string(goal, "title")).font(.caption).lineLimit(1)
                        }.frame(maxWidth: .infinity)
                    }.accessibilityLabel(string(goal, "title") + (checked ? "，已完成，取消打卡" : "，打卡"))
                }
            } }
        }
    }
    var focus: some View {
        let subjects = rows(entry.data["subjects"])
        let timer = entry.data["timer"] as? [String: Any] ?? [:]
        let running = string(timer, "status") == "running"
        let seconds = timer["seconds"] as? Double ?? 0
        return VStack(alignment: .leading, spacing: 12) {
            if subjects.isEmpty { empty("timer", action: "focus") }
            else {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(string(timer, "subjectName").isEmpty ? string(subjects[0], "name") : string(timer, "subjectName")).font(.caption)
                        if running, let updated = timer["sampledAt"] as? Double {
                            Text(Date(timeIntervalSince1970: updated - seconds), style: .timer).font(.system(size: 30, weight: .regular, design: .rounded)).monospacedDigit()
                        } else { Text(String(format: "%02d:%02d", Int(seconds) / 60, Int(seconds) % 60)).font(.system(size: 30, weight: .regular, design: .rounded)).monospacedDigit() }
                    }
                    Spacer(minLength: 4)
                    Link(destination: entry.link(timer.isEmpty ? "start" : running ? "pause" : "resume", id: timer.isEmpty ? string(subjects[0], "id") : string(timer, "startedAt"))) {
                        Image(systemName: running ? "pause.fill" : "play.fill").frame(width: 44, height: 44).background(accent, in: Circle()).foregroundStyle(.white)
                    }.accessibilityLabel(running ? "暫停" : "開始或繼續")
                }
                if family != .systemSmall {
                    HStack(spacing: 6) { ForEach(Array(subjects.prefix(3).enumerated()), id: \.offset) { _, s in
                        Link(destination: entry.link("start", id: string(s, "id"))) {
                            VStack(spacing: 3) { Text(string(s, "name")).font(.caption); Text(duration(s["seconds"] as? Double ?? 0)).font(.system(size: 10)).foregroundStyle(.secondary) }
                                .frame(maxWidth: .infinity).padding(.vertical, 8).background(accent.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                        }
                    } }
                }
            }
        }
    }
    var ranking: some View {
        let items = rows(entry.data["ranking"])
        let ordered = items.count >= 2 ? [items[1], items[0]] + Array(items.dropFirst(2).prefix(1)) : items
        return VStack(spacing: 8) {
            if items.isEmpty { empty("person.2", action: "groups") }
            else { HStack(alignment: .bottom, spacing: 12) {
                ForEach(Array(ordered.enumerated()), id: \.offset) { _, row in
                    let rank = row["rank"] as? Int ?? 1
                    VStack(spacing: 6) {
                        Text(String(string(row, "displayName").prefix(1))).font(.caption).frame(width: 32, height: 32).background(accent.opacity(0.12), in: Circle())
                        Text(string(row, "displayName")).font(.caption).lineLimit(1)
                        Text(duration(row["seconds"] as? Double ?? 0)).font(.system(size: 10)).foregroundStyle(.secondary)
                        Text("\(rank)").font(.title3).frame(maxWidth: .infinity).frame(height: rank == 1 ? 42 : rank == 2 ? 30 : 22).background(accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 7))
                    }.frame(maxWidth: .infinity)
                }
            } }
            if let updated = entry.data["rankingUpdatedAt"] as? Double {
                HStack(spacing: 4) { Spacer(); Image(systemName: "arrow.clockwise"); Text(Date(timeIntervalSince1970: updated), style: .time) }.font(.system(size: 9)).foregroundStyle(.secondary)
            }
        }
    }
    func empty(_ symbol: String, action: String) -> some View {
        Link(destination: entry.link(action)) { Image(systemName: symbol).font(.title2).foregroundStyle(accent).frame(maxWidth: .infinity, maxHeight: .infinity) }.accessibilityLabel("開啟約嗎")
    }
}
struct QuietWidget: Widget {
    let kind: String
    let name: String
    let families: [WidgetFamily]
    init() { kind = "week"; name = "週曆"; families = [.systemMedium] }
    init(kind: String, name: String, families: [WidgetFamily]) {
        self.kind = kind; self.name = name; self.families = families
    }
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "com.yuema.widgets." + kind, provider: PlannerProvider()) { WidgetSurface(entry: $0, kind: kind) }
            .configurationDisplayName(name)
            .description("約嗎")
            .supportedFamilies(families)
    }
}
@main struct YuemaWidgetBundle: WidgetBundle {
    var body: some Widget {
        QuietWidget(kind: "week", name: "週曆", families: [.systemMedium])
        QuietWidget(kind: "month", name: "月曆", families: [.systemLarge])
        QuietWidget(kind: "deadline", name: "倒數", families: [.systemSmall, .systemMedium])
        QuietWidget(kind: "goals", name: "打卡", families: [.systemSmall, .systemMedium])
        QuietWidget(kind: "focus", name: "專注", families: [.systemSmall, .systemMedium])
        QuietWidget(kind: "groups", name: "群組", families: [.systemMedium])
    }
}
