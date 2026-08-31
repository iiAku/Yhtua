require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'YhtuaVault'
  s.version        = package['version']
  s.summary        = 'Yhtua native vault: Keychain key custody + Rust crypto formats'
  s.description    = 'Biometric-gated Keychain key custody over the yhtua-crypto Rust core (UniFFI).'
  s.author         = package['author'] || 'Yoann Gendrey'
  s.homepage       = 'https://github.com/iiAku/Yhtua'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => 'https://github.com/iiAku/Yhtua.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # The Rust core + generated bindings, produced by scripts/build-ios-rust.sh
  # (or the EAS pre-install hook) into ios/rust/.
  s.source_files = '*.swift', 'rust/bindings/yhtua_mobile.swift'
  s.resource_bundles = { 'YhtuaVaultPrivacy' => ['PrivacyInfo.xcprivacy'] }
  s.vendored_frameworks = 'rust/YhtuaMobile.xcframework'

  # The generated bindings guard the FFI types behind
  # `#if canImport(yhtua_mobileFFI)`; without these include paths the import
  # silently fails and every RustBuffer/RustCallStatus reference breaks. The
  # module.modulemap lives in the vendored XCFramework's per-slice Headers.
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    'SWIFT_INCLUDE_PATHS[sdk=iphoneos*]' => '$(PODS_TARGET_SRCROOT)/rust/YhtuaMobile.xcframework/ios-arm64/Headers',
    'SWIFT_INCLUDE_PATHS[sdk=iphonesimulator*]' => '$(PODS_TARGET_SRCROOT)/rust/YhtuaMobile.xcframework/ios-arm64_x86_64-simulator/Headers'
  }
end
