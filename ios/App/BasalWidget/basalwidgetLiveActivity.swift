//
//  basalwidgetLiveActivity.swift
//  basalwidget
//
//  Created by Saksham Panchal on 06/09/26.
//

import ActivityKit
import WidgetKit
import SwiftUI

struct basalwidgetAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // Dynamic stateful properties about your activity go here!
        var emoji: String
    }

    // Fixed non-changing properties about your activity go here!
    var name: String
}

struct basalwidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: basalwidgetAttributes.self) { context in
            // Lock screen/banner UI goes here
            VStack {
                Text("Hello \(context.state.emoji)")
            }
            .activityBackgroundTint(Color.cyan)
            .activitySystemActionForegroundColor(Color.black)

        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded UI goes here.  Compose the expanded UI through
                // various regions, like leading/trailing/center/bottom
                DynamicIslandExpandedRegion(.leading) {
                    Text("Leading")
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("Trailing")
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("Bottom \(context.state.emoji)")
                    // more content
                }
            } compactLeading: {
                Text("L")
            } compactTrailing: {
                Text("T \(context.state.emoji)")
            } minimal: {
                Text(context.state.emoji)
            }
            .widgetURL(URL(string: "http://www.apple.com"))
            .keylineTint(Color.red)
        }
    }
}

extension basalwidgetAttributes {
    fileprivate static var preview: basalwidgetAttributes {
        basalwidgetAttributes(name: "World")
    }
}

extension basalwidgetAttributes.ContentState {
    fileprivate static var smiley: basalwidgetAttributes.ContentState {
        basalwidgetAttributes.ContentState(emoji: "😀")
     }
     
     fileprivate static var starEyes: basalwidgetAttributes.ContentState {
         basalwidgetAttributes.ContentState(emoji: "🤩")
     }
}

#Preview("Notification", as: .content, using: basalwidgetAttributes.preview) {
   basalwidgetLiveActivity()
} contentStates: {
    basalwidgetAttributes.ContentState.smiley
    basalwidgetAttributes.ContentState.starEyes
}
