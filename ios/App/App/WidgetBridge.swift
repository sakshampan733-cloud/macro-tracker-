import Foundation
import Capacitor
import WidgetKit

/*
 * Publishing the handful of numbers the home screen widget shows.
 *
 * Deliberately a snapshot rather than the log. The log is a couple of
 * hundred kilobytes of JSON and a widget refresh gets a few milliseconds of
 * system budget; parsing the whole thing on every refresh would be slow and
 * would put the app's private record into a shared container for no reason.
 * Six integers is all a widget can usefully show, so six integers is all
 * that crosses.
 *
 * The App Group is what makes the two processes able to see the same
 * defaults at all. On a real device that group needs a provisioning profile,
 * which means a paid developer account — on the simulator it just works.
 */
@objc(WidgetBridge)
public class WidgetBridge: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridge"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "publish", returnType: CAPPluginReturnPromise),
    ]

    private let group = "group.com.sakshampanchal.basal"

    @objc func publish(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: group) else {
            /* No App Group provisioned. Not an error worth surfacing: the app
               is entirely usable without a widget, and the alternative is a
               warning nobody can act on. */
            call.resolve(["ok": false, "reason": "no app group"])
            return
        }

        var payload: [String: Int] = [:]
        for key in ["left", "target", "eaten", "p", "pT", "c", "cT", "f", "fT"] {
            payload[key] = call.getInt(key) ?? 0
        }

        if let data = try? JSONSerialization.data(withJSONObject: payload),
           let text = String(data: data, encoding: .utf8) {
            defaults.set(text, forKey: "widget")
            WidgetCenter.shared.reloadAllTimelines()
            call.resolve(["ok": true])
        } else {
            call.resolve(["ok": false, "reason": "could not encode"])
        }
    }
}
