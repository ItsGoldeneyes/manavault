import Capacitor
import Foundation
import UniformTypeIdentifiers
import WebKit

enum NativeShellStore {
    static let serverUrlKey = "serverUrl"

    static func serverURL() -> URL? {
        guard let rawValue = UserDefaults.standard.string(forKey: serverUrlKey)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !rawValue.isEmpty,
              let url = URL(string: rawValue),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              url.host != nil else {
            return nil
        }

        return url
    }
}

@objc(BridgeViewController)
class BridgeViewController: CAPBridgeViewController {
    override func instanceDescriptor() -> InstanceDescriptor {
        let descriptor = super.instanceDescriptor()
        if let serverURL = NativeShellStore.serverURL() {
            descriptor.serverURL = serverURL.absoluteString
        }
        return descriptor
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(InAppHttpNavigationPlugin())
        bridge?.registerPluginInstance(SharedImportPlugin())
        bridge?.registerPluginInstance(NativeShellPlugin())
    }
}

@objc(InAppHttpNavigationPlugin)
public class InAppHttpNavigationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "InAppHttpNavigationPlugin"
    public let jsName = "InAppHttpNavigation"
    public let pluginMethods: [CAPPluginMethod] = []

    private let hostedHosts: Set<String> = ["manavault.cfb.dev", "www.manavault.cfb.dev"]

    // Keep navigation to the configured ManaVault server inside the web view. Returning nil
    // defers to Capacitor, which opens other top-level http(s) URLs in the system browser.
    override public func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
        guard let url = navigationAction.request.url,
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else {
            return nil
        }

        return isAppNavigation(url) ? NSNumber(value: false) : nil
    }

    private func isAppNavigation(_ url: URL) -> Bool {
        if let host = url.host?.lowercased(), hostedHosts.contains(host) {
            return true
        }

        guard let serverURL = NativeShellStore.serverURL() else {
            return false
        }

        return sameOrigin(url, serverURL)
    }

    private func sameOrigin(_ left: URL, _ right: URL) -> Bool {
        return left.scheme?.lowercased() == right.scheme?.lowercased()
            && left.host?.lowercased() == right.host?.lowercased()
            && effectivePort(left) == effectivePort(right)
    }

    private func effectivePort(_ url: URL) -> Int? {
        if let port = url.port {
            return port
        }

        switch url.scheme?.lowercased() {
        case "http": return 80
        case "https": return 443
        default: return nil
        }
    }
}

@objc(SharedImportPlugin)
public class SharedImportPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SharedImportPlugin"
    public let jsName = "SharedImport"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPendingImport", returnType: CAPPluginReturnPromise)
    ]

    private static var pendingImport: [String: Any]?
    private static weak var activePlugin: SharedImportPlugin?

    override public func load() {
        Self.activePlugin = self
    }

    @objc func getPendingImport(_ call: CAPPluginCall) {
        var result: [String: Any] = [:]

        if let payload = Self.pendingImport {
            result["import"] = payload
            Self.pendingImport = nil
        }

        call.resolve(result)
    }

    @discardableResult
    static func capture(url: URL) -> Bool {
        let accessing = url.startAccessingSecurityScopedResource()
        defer {
            if accessing {
                url.stopAccessingSecurityScopedResource()
            }
        }

        guard let data = try? Data(contentsOf: url), let text = decodedText(data), !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return false
        }

        var mimeType: String? = nil
        if let contentType = try? url.resourceValues(forKeys: [.contentTypeKey]).contentType {
            mimeType = contentType.preferredMIMEType
        }

        let payload: [String: Any] = [
            "text": text,
            "fileName": url.lastPathComponent.isEmpty ? "Shared list.txt" : url.lastPathComponent,
            "mimeType": mimeType ?? "text/plain",
            "source": "ios-open"
        ]

        pendingImport = payload
        activePlugin?.notifyListeners("sharedImport", data: payload)
        return true
    }

    private static func decodedText(_ data: Data) -> String? {
        if let text = String(data: data, encoding: .utf8) {
            return text
        }

        return String(data: data, encoding: .isoLatin1)
    }
}

@objc(NativeShellPlugin)
public class NativeShellPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeShellPlugin"
    public let jsName = "NativeShell"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveServer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearServer", returnType: CAPPluginReturnPromise)
    ]

    private let serverUrlKey = NativeShellStore.serverUrlKey
    private let releaseRepository = "cfbender/manavault"
    private let fallbackVersion = "0.0.0"

    @objc func getSettings(_ call: CAPPluginCall) {
        call.resolve(settingsPayload())
    }

    @objc func saveServer(_ call: CAPPluginCall) {
        guard let serverUrl = call.getString("serverUrl")?.trimmingCharacters(in: .whitespacesAndNewlines), !serverUrl.isEmpty else {
            call.reject("Enter a ManaVault URL.")
            return
        }

        UserDefaults.standard.set(serverUrl, forKey: serverUrlKey)
        call.resolve(settingsPayload())
    }

    @objc func clearServer(_ call: CAPPluginCall) {
        UserDefaults.standard.removeObject(forKey: serverUrlKey)
        call.resolve(settingsPayload())
    }

    private func settingsPayload() -> [String: Any] {
        var payload: [String: Any] = [
            "appVersion": appVersion(),
            "releaseRepository": releaseRepository
        ]

        if let serverUrl = UserDefaults.standard.string(forKey: serverUrlKey)?.trimmingCharacters(in: .whitespacesAndNewlines), !serverUrl.isEmpty {
            payload["serverUrl"] = serverUrl
        }

        return payload
    }

    private func appVersion() -> String {
        if let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String, !version.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return version
        }

        return fallbackVersion
    }
}
