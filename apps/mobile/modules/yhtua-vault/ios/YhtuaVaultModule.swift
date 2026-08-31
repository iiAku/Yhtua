import ExpoModulesCore

// The JS-facing vault surface. Narrow by design: operations in, results out.
// The encryption key exists only inside KeyStore.withKey closures; there is
// no getRawKey and no API that could add one without widening this file.
// Every key-using operation runs the single authorization path (the
// access-control-bound Keychain fetch IS the biometric check).

public class YhtuaVaultModule: Module {
  public func definition() -> ModuleDefinition {
    Name("YhtuaVault")

    AsyncFunction("vaultExists") { () -> Bool in
      try mapErrors { try KeyStore.keyExists() }
    }

    // A REAL biometric checkpoint: an access-control-bound Keychain fetch
    // whose key never leaves the closure. `vaultExists` deliberately cannot
    // authenticate (it probes with authentication UI disabled).
    AsyncFunction("authenticateVault") { () -> Bool in
      try mapErrors {
        try KeyStore.withKey(prompt: "Unlock Yhtua") { _ in true }
      }
    }

    AsyncFunction("initializeVault") { () -> Bool in
      try mapErrors { try KeyStore.ensureKey() }
    }

    AsyncFunction("encryptSecret") { (plaintext: String) -> String in
      try mapErrors {
        try KeyStore.withKey(prompt: "Encrypt a new token") { key in
          try encryptLocal(key: key, plaintext: plaintext)
        }
      }
    }

    AsyncFunction("decryptSecret") { (ciphertextBase64: String) -> String in
      try mapErrors {
        try KeyStore.withKey(prompt: "Unlock your tokens") { key in
          try decryptLocal(key: key, ciphertextBase64: ciphertextBase64)
        }
      }
    }

    // One biometric checkpoint for a whole export instead of one per token.
    // Bounded to the vault's own token cap; a cancellation aborts the WHOLE
    // batch (JS must never retry per-secret, which would prompt N times).
    AsyncFunction("decryptSecrets") { (ciphertextsBase64: [String]) -> [String] in
      guard ciphertextsBase64.count <= 10_000 else {
        throw Exception(name: "InputTooLarge", description: "Batch exceeds the vault token cap")
      }
      return try mapErrors {
        try KeyStore.withKey(prompt: "Export your tokens") { key in
          try ciphertextsBase64.map { try decryptLocal(key: key, ciphertextBase64: $0) }
        }
      }
    }

    // YHP2 is password-derived — no vault key involved, no biometric prompt.
    AsyncFunction("exportYhp2") { (password: String, payload: String) -> String in
      try mapErrors { try exportYhp2(password: password, payload: payload) }
    }

    AsyncFunction("importYhp2") { (password: String, envelopeBase64: String) -> String in
      try mapErrors { try importYhp2(password: password, envelopeBase64: envelopeBase64) }
    }

    AsyncFunction("destroyVault") { () in
      try mapErrors { try KeyStore.destroyKey() }
    }

    // Debug builds only: runs the bundled golden vectors through this exact
    // module path on the device. Release builds expose the symbol but refuse.
    AsyncFunction("runSelfTest") { (fixtureJson: String) -> String in
      #if DEBUG
        return try SelfTest.run(fixtureJson: fixtureJson)
      #else
        throw Exception(name: "SelfTestDisabled", description: "Self-test is a debug-only feature")
      #endif
    }
  }
}


// Stable, typed error codes across the JS boundary — never raw Swift error
// descriptions that JS would have to string-match.
private func mapErrors<T>(_ operation: () throws -> T) throws -> T {
  do {
    return try operation()
  } catch let error as KeyStoreError {
    switch error {
    case .authenticationCanceled:
      throw Exception(name: "AuthCanceled", description: "Authentication was canceled")
    case .authenticationFailed:
      throw Exception(name: "AuthFailed", description: "Authentication failed")
    case .keyMissing:
      throw Exception(name: "KeyMissing", description: "The vault key is missing")
    case .keyCorrupted:
      throw Exception(name: "KeyCorrupted", description: "The vault key is unreadable")
    case .secureStorageUnavailable:
      throw Exception(name: "SecureStorageUnavailable", description: "Secure storage is unavailable")
    }
  } catch let error as VaultError {
    switch error {
    case .Encryption: throw Exception(name: "EncryptionFailed", description: "Encryption failed")
    case .Decryption: throw Exception(name: "DecryptionFailed", description: "Decryption failed")
    case .InvalidFormat: throw Exception(name: "InvalidFormat", description: "Invalid data format")
    case .InputTooLarge: throw Exception(name: "InputTooLarge", description: "Input exceeds the allowed size")
    case .InvalidPassword:
      throw Exception(name: "InvalidPassword", description: "Password must contain between 8 and 1024 bytes")
    }
  }
}
