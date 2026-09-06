import UIKit
import Capacitor

/*
 * The bridge, with Basal's own plugin attached.
 *
 * Capacitor stopped scanning the Objective-C runtime for plugins: packages
 * declare themselves through Package.swift, and a plugin written inside the
 * app has no package to declare it. So it is registered here by hand, which
 * is the documented route and the only one that works — without this the
 * Swift compiles, ships, and is simply never reachable from JavaScript,
 * which is exactly how it failed the first time.
 */
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(BasalHealth())
        bridge?.registerPluginInstance(WidgetBridge())
    }
}
