import SwiftUI

/// Tap where it hurts.
///
/// The same fifteen regions and the same coordinates as `components/BodyMap.tsx`,
/// so an athlete who marks a left knee on the phone sees a left knee on the web.
/// Untouched regions are dim with a legible edge and a marked one grows — the
/// web version had fifteen bright dots, which made the one you had actually
/// marked the quietest thing on the figure.
struct BodyMap: View {
    @Binding var pain: [String: Int]
    @State private var selected: String?

    private struct Region { let key: String; let label: String; let x: CGFloat; let y: CGFloat; let r: CGFloat }
    private let regions: [Region] = [
        .init(key: "head", label: "Head / neck", x: 80, y: 36, r: 10),
        .init(key: "shoulder_left", label: "L shoulder", x: 58, y: 70, r: 9),
        .init(key: "shoulder_right", label: "R shoulder", x: 102, y: 70, r: 9),
        .init(key: "lower_back", label: "Lower back", x: 80, y: 120, r: 10),
        .init(key: "hip_left", label: "L hip", x: 66, y: 148, r: 9),
        .init(key: "hip_right", label: "R hip", x: 94, y: 148, r: 9),
        .init(key: "groin", label: "Groin", x: 80, y: 158, r: 9),
        .init(key: "hamstring_left", label: "L hamstring", x: 68, y: 195, r: 9),
        .init(key: "hamstring_right", label: "R hamstring", x: 92, y: 195, r: 9),
        .init(key: "knee_left", label: "L knee", x: 68, y: 235, r: 9),
        .init(key: "knee_right", label: "R knee", x: 92, y: 235, r: 9),
        .init(key: "calf_left", label: "L calf", x: 68, y: 262, r: 8),
        .init(key: "calf_right", label: "R calf", x: 92, y: 262, r: 8),
        .init(key: "ankle_left", label: "L ankle", x: 68, y: 285, r: 8),
        .init(key: "ankle_right", label: "R ankle", x: 92, y: 285, r: 8),
    ]

    private func colour(_ level: Int) -> Color {
        switch level {
        case 7...: return .red
        case 4...6: return .yellow
        case 1...3: return .orange
        default: return .white.opacity(0.10)
        }
    }

    var body: some View {
        VStack(spacing: 12) {
            Canvas { ctx, size in
                let s = min(size.width / 160, size.height / 320)
                func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * s, y: y * s) }

                // Silhouette
                let body = Path { path in
                    path.addEllipse(in: CGRect(x: 62 * s, y: 18 * s, width: 36 * s, height: 36 * s))
                    path.addRoundedRect(in: CGRect(x: 60 * s, y: 56 * s, width: 40 * s, height: 70 * s), cornerSize: CGSize(width: 14 * s, height: 14 * s))
                    path.addRoundedRect(in: CGRect(x: 46 * s, y: 60 * s, width: 12 * s, height: 60 * s), cornerSize: CGSize(width: 6 * s, height: 6 * s))
                    path.addRoundedRect(in: CGRect(x: 102 * s, y: 60 * s, width: 12 * s, height: 60 * s), cornerSize: CGSize(width: 6 * s, height: 6 * s))
                    path.addRoundedRect(in: CGRect(x: 62 * s, y: 150 * s, width: 14 * s, height: 140 * s), cornerSize: CGSize(width: 7 * s, height: 7 * s))
                    path.addRoundedRect(in: CGRect(x: 84 * s, y: 150 * s, width: 14 * s, height: 140 * s), cornerSize: CGSize(width: 7 * s, height: 7 * s))
                }
                ctx.fill(body, with: .color(.white.opacity(0.05)))
                ctx.stroke(body, with: .color(.white.opacity(0.20)), lineWidth: 1.5)

                for r in regions {
                    let level = pain[r.key] ?? 0
                    let radius = (level > 0 ? r.r + 1.5 : r.r) * s
                    let c = p(r.x, r.y)
                    let circle = Path(ellipseIn: CGRect(x: c.x - radius, y: c.y - radius, width: radius * 2, height: radius * 2))
                    ctx.fill(circle, with: .color(colour(level)))
                    ctx.stroke(circle, with: .color(level > 0 ? .white.opacity(0.5) : .white.opacity(0.32)), lineWidth: 1.5)
                }
            }
            .frame(height: 300)
            .contentShape(Rectangle())
            .onTapGesture { location in
                let s = 300.0 / 320.0
                // Nearest region within a generous radius — a fingertip is much
                // bigger than a 9pt dot, and demanding precision on a body map
                // is how someone gives up and reports nothing.
                let hit = regions.min { a, b in
                    hypot(a.x * s - location.x, a.y * s - location.y) < hypot(b.x * s - location.x, b.y * s - location.y)
                }
                guard let hit, hypot(hit.x * s - location.x, hit.y * s - location.y) < 26 else { return }
                if pain[hit.key] != nil { pain[hit.key] = nil; if selected == hit.key { selected = nil } }
                else { pain[hit.key] = 5; selected = hit.key }
            }

            // Chips, not a panel. Also the only way to see what you have marked
            // without squinting at the figure.
            if !pain.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(pain.keys.sorted(), id: \.self) { key in
                            let label = regions.first { $0.key == key }?.label ?? key
                            Button { pain[key] = nil } label: {
                                HStack(spacing: 5) {
                                    Text(label).font(.caption.weight(.semibold))
                                    Image(systemName: "xmark").font(.system(size: 9))
                                }
                                .padding(.horizontal, 12).padding(.vertical, 7)
                            }
                            .foregroundStyle(Color.accentColor)
                            .background(Capsule().fill(Color.accentColor.opacity(0.12)))
                            .overlay(Capsule().strokeBorder(Color.accentColor.opacity(0.4)))
                        }
                    }
                }
            } else {
                Text("Tap where it hurts.").font(.footnote).foregroundStyle(.secondary)
            }
        }
    }
}
