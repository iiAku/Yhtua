import UIKit
import UniformTypeIdentifiers

// A TOTP code on the pasteboard is a live secret sitting on a surface every
// other app can read. Two properties make that acceptable, and neither is
// reachable from JavaScript:
//
//   * `.localOnly` keeps the item off Universal Clipboard, so the code never
//     leaves this device for a Mac or iPad.
//   * `.expirationDate` is enforced by the OS, so the code disappears even if
//     this process is killed before it can clean up.
//
// Ownership is tracked by the pasteboard's change count rather than by
// reading it back: on iOS 16+ a read raises the system paste prompt, and
// asking the user to approve a paste at the moment their vault locks is both
// alarming and defeatable. If anything wrote to the pasteboard after us, the
// count moved and the value is no longer ours to erase.
enum SensitiveClipboard {
  private static var ownedChangeCount: Int?

  static func copy(_ value: String, ttlSeconds: Double) -> Bool {
    let pasteboard = UIPasteboard.general
    pasteboard.setItems(
      [[UTType.utf8PlainText.identifier: value]],
      options: [
        .localOnly: true,
        .expirationDate: Date().addingTimeInterval(ttlSeconds),
      ]
    )
    ownedChangeCount = pasteboard.changeCount
    return true
  }

  /// Clears the pasteboard only while it still holds the value we wrote.
  /// Returns false when we own nothing, or when someone else has written
  /// since — erasing another app's clipboard would be a bug, not hygiene.
  static func clearOwned() -> Bool {
    guard let owned = ownedChangeCount else { return false }
    ownedChangeCount = nil
    let pasteboard = UIPasteboard.general
    guard pasteboard.changeCount == owned else { return false }
    pasteboard.items = []
    return true
  }
}
