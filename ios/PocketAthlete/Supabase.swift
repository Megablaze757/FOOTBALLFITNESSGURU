import Foundation

/// A minimal Supabase client: auth + PostgREST, over URLSession.
///
/// NO SDK ON PURPOSE. `supabase-swift` pulls a dependency graph for realtime,
/// storage and functions, none of which this app touches — and every one of
/// them is a thing that can break a build the week before a submission. What is
/// actually needed is a token and three REST calls.
///
/// The security model is unchanged from the web: RLS on every table is the real
/// boundary, so this holds the *publishable* anon key and nothing sensitive.
/// A stolen token gets you exactly what that user could already see.
actor Supabase {
    static let shared = Supabase()

    /// Same project the web app uses. The anon key is public by design — it is
    /// useless without RLS being wrong, and RLS covers all 29 tables.
    private let url = URL(string: "https://txqhstackgidjqkkrzyj.supabase.co")!
    private let anonKey = "sb_publishable_kr26XwyR0HZxS3HR3UJI2Q_YLLT7Sfl"

    private var accessToken: String?
    private var refreshToken: String?
    private(set) var userId: String?

    struct AuthError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    // MARK: - Auth

    func signIn(email: String, password: String) async throws {
        struct Body: Encodable { let email: String; let password: String }
        struct Response: Decodable {
            let access_token: String
            let refresh_token: String
            struct User: Decodable { let id: String }
            let user: User
        }
        let res: Response = try await post("/auth/v1/token?grant_type=password",
                                           body: Body(email: email, password: password),
                                           authed: false)
        store(access: res.access_token, refresh: res.refresh_token, user: res.user.id)
    }

    /// Restore a session from the Keychain on launch.
    ///
    /// Keychain, not UserDefaults: a refresh token is a long-lived credential
    /// and UserDefaults is an unencrypted plist that ends up in backups.
    func restore() async {
        guard let refresh = Keychain.read("refresh_token") else { return }
        struct Body: Encodable { let refresh_token: String }
        struct Response: Decodable {
            let access_token: String
            let refresh_token: String
            struct User: Decodable { let id: String }
            let user: User
        }
        guard let res: Response = try? await post("/auth/v1/token?grant_type=refresh_token",
                                                  body: Body(refresh_token: refresh),
                                                  authed: false) else {
            // An expired or revoked token is a signed-out user, not an error to
            // show. Clear it so the next launch does not retry a dead token.
            Keychain.delete("refresh_token")
            return
        }
        store(access: res.access_token, refresh: res.refresh_token, user: res.user.id)
    }

    func signOut() {
        accessToken = nil; refreshToken = nil; userId = nil
        Keychain.delete("refresh_token")
    }

    var isSignedIn: Bool { accessToken != nil }

    private func store(access: String, refresh: String, user: String) {
        accessToken = access; refreshToken = refresh; userId = user
        Keychain.write("refresh_token", refresh)
    }

    // MARK: - Data

    /// Upsert today's check-in. Conflict target matches the web app's, so the
    /// same day submitted from phone and browser updates one row rather than
    /// racing to create two.
    func saveCheckIn(_ payload: [String: Any], date: String) async throws {
        var body = payload
        body["user_id"] = userId
        body["check_in_date"] = date
        try await upsert("/rest/v1/daily_check_ins?on_conflict=user_id,check_in_date", body)
    }

    /// Store a day of HealthKit numbers.
    ///
    /// `source` MUST be one of the values in `biometrics_source_check`, and
    /// 'healthkit' is NOT one of them — the constraint lists 'apple_health'.
    /// Getting this wrong fails the insert, and because it is best-effort the
    /// failure would be silent.
    func saveBiometrics(date: String, hrv: Double?, restingHr: Double?, sleepHours: Double?) async throws {
        let body: [String: Any] = [
            "user_id": userId as Any,
            "metric_date": date,
            "hrv_ms": hrv as Any,
            "resting_hr": restingHr as Any,
            "sleep_hours": sleepHours as Any,
            "source": "apple_health",
        ]
        try await upsert("/rest/v1/biometrics?on_conflict=user_id,metric_date", body)
    }

    // MARK: - Reads

    /// The last `limit` check-ins, newest first.
    ///
    /// THE CLIENT HAD NO READ PATH AT ALL until now — it could submit a check-in
    /// and never see one again. That is fine for a form and useless for an app:
    /// no streak, no history, and reopening the app on a day you had already
    /// logged showed an empty form as if you hadn't.
    ///
    /// No `user_id` filter is sent. RLS on `daily_check_ins` already restricts
    /// every row to the authenticated user, and adding a client-side filter
    /// would imply the security lives here, which it does not.
    func recentCheckIns(limit: Int = 30) async throws -> [CheckInRow] {
        try await get("/rest/v1/daily_check_ins?select=check_in_date,sleep_quality,fatigue_score,nutrition_quality,pain_map&order=check_in_date.desc&limit=\(limit)")
    }

    /// A check-in row, in the shape the scoring engine wants.
    struct CheckInRow: Decodable {
        let check_in_date: String
        let sleep_quality: Int?
        let fatigue_score: Int?
        let nutrition_quality: Int?
        /// Stored as a JSON object of body part -> 0-10. Absent on older rows.
        let pain_map: [String: Int]?

        var input: CheckInInput {
            CheckInInput(sleepQuality: sleep_quality,
                         fatigueScore: fatigue_score,
                         nutritionQuality: nutrition_quality,
                         painMap: pain_map ?? [:])
        }
    }

    // MARK: - Transport

    private func get<R: Decodable>(_ path: String) async throws -> R {
        var req = URLRequest(url: URL(string: url.absoluteString + path)!)
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(accessToken ?? anonKey)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let text = String(data: data, encoding: .utf8) ?? "no body"
            throw AuthError(message: "Supabase refused the read: \(text)")
        }
        return try JSONDecoder().decode(R.self, from: data)
    }

    private func upsert(_ path: String, _ body: [String: Any]) async throws {
        // Built by string rather than appendingPathComponent, which escapes the
        // `?on_conflict=` query and turns the upsert into a plain insert.
        var req = URLRequest(url: URL(string: url.absoluteString + path)!)
        req.httpMethod = "POST"
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(accessToken ?? anonKey)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("resolution=merge-duplicates", forHTTPHeaderField: "Prefer")
        req.httpBody = try JSONSerialization.data(withJSONObject: body.compactMapValues { $0 })

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let text = String(data: data, encoding: .utf8) ?? "no body"
            throw AuthError(message: "Supabase rejected the write: \(text)")
        }
    }

    private func post<B: Encodable, R: Decodable>(_ path: String, body: B, authed: Bool) async throws -> R {
        var req = URLRequest(url: URL(string: url.absoluteString + path)!)
        req.httpMethod = "POST"
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if authed, let t = accessToken { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        req.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            // Surface what actually failed. Replacing every error with "couldn't
            // sign in" is how a broken endpoint sits unnoticed — the same
            // mistake the web app already made once and fixed.
            struct SupabaseError: Decodable { let error_description: String?; let msg: String?; let message: String? }
            let parsed = try? JSONDecoder().decode(SupabaseError.self, from: data)
            throw AuthError(message: parsed?.error_description ?? parsed?.msg ?? parsed?.message
                            ?? String(data: data, encoding: .utf8) ?? "Request failed")
        }
        return try JSONDecoder().decode(R.self, from: data)
    }
}

/// The smallest Keychain wrapper that does the job.
enum Keychain {
    private static let service = "com.pocketathlete.app"

    static func write(_ key: String, _ value: String) {
        delete(key)
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: Data(value.utf8),
            // Not synced to iCloud and unavailable until the device has been
            // unlocked once — a session token has no business restoring onto a
            // different device from a backup.
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstThisDeviceOnly,
        ]
        SecItemAdd(q as CFDictionary, nil)
    }

    static func read(_ key: String) -> String? {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(_ key: String) {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(q as CFDictionary)
    }
}
