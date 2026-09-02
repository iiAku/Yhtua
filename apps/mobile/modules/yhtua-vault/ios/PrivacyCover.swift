import UIKit

// iOS photographs the screen when the app resigns active, and that snapshot
// is what the app switcher shows and what sits in the app container on disk.
// React Native's AppState listener runs after the picture is taken, so the
// cover is installed on the UIKit notification itself.
//
// The cover is OPAQUE, not a blur. A blurred six-digit code is not redacted:
// there are only a million renderings, the font and layout are known, and a
// captured snapshot can be classified against candidates. The cover must
// therefore contain nothing derived from what was on screen.
//
// Removal is not symmetric with installation. `didBecomeActive` fires before
// JavaScript has re-rendered, so after a REAL backgrounding the cover stays
// until the JS layout says it has drawn a safe frame (`dismiss()`), which
// under the zero-grace lock config is the lock screen. A mere `inactive`
// blip — Face ID, control centre, a phone call — never backgrounded the app,
// so the frame underneath is still the one the user left, and the cover is
// removed immediately.
enum PrivacyCover {
  private static var coverView: UIView?
  private static var observers: [NSObjectProtocol] = []
  private static var didEnterBackground = false

  static func install() {
    guard observers.isEmpty else { return }
    let center = NotificationCenter.default
    observers = [
      center.addObserver(
        forName: UIApplication.willResignActiveNotification, object: nil, queue: .main
      ) { _ in show() },
      center.addObserver(
        forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
      ) { _ in didEnterBackground = true },
      center.addObserver(
        forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
      ) { _ in
        // Only a transient blip may uncover without JavaScript's word.
        if !didEnterBackground { hide() }
      },
    ]
  }

  static func uninstall() {
    for observer in observers { NotificationCenter.default.removeObserver(observer) }
    observers = []
    didEnterBackground = false
    hide()
  }

  /// Called by the JS lock host once the layout has drawn a frame that is safe
  /// to show. Failing to call it leaves the app covered — the fail-closed
  /// direction, and visible enough to be reported rather than silent.
  static func dismiss() {
    didEnterBackground = false
    hide()
  }

  private static func windows() -> [UIWindow] {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .filter { !$0.isHidden }
  }

  private static func show() {
    guard coverView == nil, let window = windows().first(where: { $0.isKeyWindow }) ?? windows().first
    else { return }
    let cover = UIView(frame: window.bounds)
    // Secret-independent by construction: one flat colour, the app's own
    // background, and nothing drawn from the screen underneath.
    cover.backgroundColor = UIColor(red: 0.043, green: 0.043, blue: 0.059, alpha: 1)
    cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    cover.layer.zPosition = .greatestFiniteMagnitude
    window.addSubview(cover)
    coverView = cover
  }

  private static func hide() {
    coverView?.removeFromSuperview()
    coverView = nil
  }
}
