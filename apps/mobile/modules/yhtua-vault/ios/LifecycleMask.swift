import UIKit

// iOS photographs the screen when the app resigns active, and that snapshot
// is what the app switcher shows — and what sits in the app's container on
// disk. By the time React Native's AppState listener runs, the picture has
// already been taken, so masking has to happen on the UIKit notification
// itself. This is why the mask is native rather than a JS overlay.
//
// `willResignActive` fires for the app switcher, a phone call, Face ID, and
// the notification-centre pull. Covering the screen in all of those is the
// fail-closed choice: a spurious blur costs a moment of confusion, a missed
// one leaks every visible TOTP code into a screenshot the user never took.
enum LifecycleMask {
  private static var maskView: UIView?
  private static var observers: [NSObjectProtocol] = []

  static func install() {
    guard observers.isEmpty else { return }
    let center = NotificationCenter.default
    observers = [
      center.addObserver(
        forName: UIApplication.willResignActiveNotification, object: nil, queue: .main
      ) { _ in show() },
      center.addObserver(
        forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
      ) { _ in hide() },
    ]
  }

  static func uninstall() {
    for observer in observers { NotificationCenter.default.removeObserver(observer) }
    observers = []
    hide()
  }

  private static func keyWindow() -> UIWindow? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }
  }

  private static func show() {
    guard maskView == nil, let window = keyWindow() else { return }
    let blur = UIVisualEffectView(effect: UIBlurEffect(style: .systemMaterialDark))
    blur.frame = window.bounds
    blur.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    // Above everything the app draws, including any presented sheet.
    blur.layer.zPosition = .greatestFiniteMagnitude
    window.addSubview(blur)
    maskView = blur
  }

  private static func hide() {
    maskView?.removeFromSuperview()
    maskView = nil
  }
}
