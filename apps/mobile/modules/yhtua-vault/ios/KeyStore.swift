import Foundation
import Security

// Key custody for the Yhtua vault. SINGLE authorization path by design: the
// key item itself carries `SecAccessControl(.biometryCurrentSet)` with
// `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly`, so the Keychain FETCH is
// the biometric check — there is no separate LAContext.evaluatePolicy whose
// result gates anything (two paths would be a TOCTOU surface). Biometric
// re-enrollment invalidates the item (documented in the threat model:
// device-bound key, YHP2 backups are the recovery path). The key never
// leaves this file except as a transient parameter into the Rust FFI, wiped
// after every use; no API returns it.

enum KeyStoreError: Error {
    case secureStorageUnavailable
    case authenticationFailed
    case authenticationCanceled
    case keyMissing
    case keyCorrupted
}

final class KeyStore {
    private static let service = "fr.gendrey.yhtua.vault"
    private static let account = "encryption-key"

    static func keyExists() throws -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            // Presence check must not trigger the biometric prompt.
            kSecUseAuthenticationUI as String: kSecUseAuthenticationUIFail,
            kSecReturnData as String: false,
        ]
        let status = SecItemCopyMatching(query as CFDictionary, nil)
        switch status {
        case errSecSuccess, errSecInteractionNotAllowed:
            return true
        case errSecItemNotFound:
            return false
        default:
            throw KeyStoreError.secureStorageUnavailable
        }
    }

    /// Creates the vault key if absent. Generation happens HERE (custody
    /// layer), never across the FFI: SecRandomCopyBytes into a buffer that is
    /// stored behind access control and wiped locally.
    static func ensureKey() throws -> Bool {
        if try keyExists() { return false }

        var keyBytes = Data(count: 32)
        let randomStatus = keyBytes.withUnsafeMutableBytes { buffer in
            SecRandomCopyBytes(kSecRandomDefault, 32, buffer.baseAddress!)
        }
        guard randomStatus == errSecSuccess else {
            throw KeyStoreError.secureStorageUnavailable
        }
        defer { keyBytes.resetBytes(in: 0..<keyBytes.count) }

        var accessControlError: Unmanaged<CFError>?
        guard
            let accessControl = SecAccessControlCreateWithFlags(
                nil,
                kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
                .biometryCurrentSet,
                &accessControlError
            )
        else {
            throw KeyStoreError.secureStorageUnavailable
        }

        let attributes: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessControl as String: accessControl,
            // Never synchronized: the key is device-bound by design.
            kSecAttrSynchronizable as String: false,
            kSecValueData as String: keyBytes,
        ]
        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeyStoreError.secureStorageUnavailable
        }
        return true
    }

    /// Fetches the key — THE biometric checkpoint — hands it to `operation`,
    /// and wipes the local copy before returning. The key must not escape the
    /// closure.
    static func withKey<T>(prompt: String, _ operation: (Data) throws -> T) throws -> T {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecUseOperationPrompt as String: prompt,
            kSecReturnData as String: true,
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        switch status {
        case errSecSuccess:
            guard var keyBytes = result as? Data, keyBytes.count == 32 else {
                throw KeyStoreError.keyCorrupted
            }
            defer { keyBytes.resetBytes(in: 0..<keyBytes.count) }
            return try operation(keyBytes)
        case errSecItemNotFound:
            throw KeyStoreError.keyMissing
        case errSecUserCanceled:
            throw KeyStoreError.authenticationCanceled
        case errSecAuthFailed, errSecInteractionNotAllowed:
            throw KeyStoreError.authenticationFailed
        default:
            throw KeyStoreError.secureStorageUnavailable
        }
    }

    static func destroyKey() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeyStoreError.secureStorageUnavailable
        }
    }
}
