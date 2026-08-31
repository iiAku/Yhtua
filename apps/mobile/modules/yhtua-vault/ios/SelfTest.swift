import Foundation

// Debug-only device self-test (sub-gate 6b): executes the byte-exact golden
// vectors through the SAME Swift->Rust path the app uses, plus a Keychain
// round trip behind the real access-control-bound fetch. Compiled into
// release builds but refused there by the module (and the fixture never
// ships in release bundles).

enum SelfTest {
    struct Fixture: Decodable {
        let key_base64: String
        let password: String
        let vectors: [Vector]
        let rejection_vectors: [Rejection]
    }

    struct Vector: Decodable {
        let format: String
        let plaintext: String
        let ciphertext_base64: String
    }

    struct Rejection: Decodable {
        let format: String
        let ciphertext_base64: String
        let expected: String
    }

    static func run(fixtureJson: String) throws -> String {
        guard let raw = fixtureJson.data(using: .utf8),
              let fixture = try? JSONDecoder().decode(Fixture.self, from: raw),
              let key = Data(base64Encoded: fixture.key_base64),
              fixture.vectors.count >= 4, fixture.rejection_vectors.count >= 8
        else {
            return "FAIL: fixture unreadable or incomplete"
        }

        var checked = 0
        for vector in fixture.vectors {
            do {
                let plaintext: String
                switch vector.format {
                case "YHL2", "legacy-local":
                    plaintext = try decryptLocal(
                        key: key, ciphertextBase64: vector.ciphertext_base64)
                case "YHP2", "legacy-password":
                    plaintext = try importYhp2(
                        password: fixture.password, envelopeBase64: vector.ciphertext_base64)
                default:
                    return "FAIL: unknown vector format \(vector.format)"
                }
                guard plaintext == vector.plaintext else {
                    return "FAIL: \(vector.format) plaintext mismatch"
                }
                checked += 1
            } catch {
                return "FAIL: \(vector.format) did not decrypt (\(error))"
            }
        }

        for rejection in fixture.rejection_vectors {
            do {
                switch rejection.format {
                case "YHL2", "legacy-local":
                    _ = try decryptLocal(key: key, ciphertextBase64: rejection.ciphertext_base64)
                case "YHP2", "legacy-password":
                    _ = try importYhp2(
                        password: fixture.password, envelopeBase64: rejection.ciphertext_base64)
                default:
                    return "FAIL: unknown rejection format \(rejection.format)"
                }
                return "FAIL: rejection vector \(rejection.format) decrypted"
            } catch let error as VaultError {
                switch (rejection.expected, error) {
                case ("invalid-format", .InvalidFormat), ("auth-failure", .Decryption):
                    checked += 1
                default:
                    return "FAIL: rejection \(rejection.format) wrong error \(error)"
                }
            } catch {
                return "FAIL: rejection \(rejection.format) non-vault error"
            }
        }

        // Real Keychain round trip through the access-control-bound fetch —
        // on a physical device this raises the biometric prompt.
        do {
            _ = try KeyStore.ensureKey()
            let ciphertext = try KeyStore.withKey(prompt: "Vault self-test") { vaultKey in
                try encryptLocal(key: vaultKey, plaintext: "JBSWY3DPEHPK3PXP")
            }
            let plaintext = try KeyStore.withKey(prompt: "Vault self-test") { vaultKey in
                try decryptLocal(key: vaultKey, ciphertextBase64: ciphertext)
            }
            guard plaintext == "JBSWY3DPEHPK3PXP" else {
                return "FAIL: keychain round trip mismatch"
            }
            checked += 1
        } catch {
            return "FAIL: keychain round trip (\(error))"
        }

        return "OK: \(checked) golden checks passed on device"
    }
}
