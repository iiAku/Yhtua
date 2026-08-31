// Golden-vector assertion runner: executes every byte-exact compatibility
// vector THROUGH the generated Swift bindings into the Rust static library —
// the exact call path the iOS native module uses. Run by the mobile-bridge CI
// job on a macOS runner (native arch); exits non-zero on any mismatch.

import Foundation

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

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data(("FAIL: " + message + "\n").utf8))
    exit(1)
}

guard CommandLine.arguments.count > 1 else {
    fail("usage: golden-vector-runner <crypto-vectors.json>")
}
let fixtureURL = URL(fileURLWithPath: CommandLine.arguments[1])
guard let raw = try? Data(contentsOf: fixtureURL),
      let fixture = try? JSONDecoder().decode(Fixture.self, from: raw)
else {
    fail("cannot read or decode fixture")
}
guard let key = Data(base64Encoded: fixture.key_base64) else {
    fail("cannot decode fixture key")
}
guard fixture.vectors.count >= 4, fixture.rejection_vectors.count >= 8 else {
    fail("fixture is incomplete — refusing a hollow golden run")
}

var checked = 0

for vector in fixture.vectors {
    do {
        let plaintext: String
        switch vector.format {
        case "YHL2", "legacy-local":
            plaintext = try decryptLocal(key: key, ciphertextBase64: vector.ciphertext_base64)
        case "YHP2", "legacy-password":
            plaintext = try importYhp2(
                password: fixture.password, envelopeBase64: vector.ciphertext_base64)
        default:
            fail("unknown vector format \(vector.format)")
        }
        guard plaintext == vector.plaintext else {
            fail("vector \(vector.format) decrypted to the wrong plaintext")
        }
        checked += 1
    } catch {
        fail("vector \(vector.format) failed to decrypt: \(error)")
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
            fail("unknown rejection format \(rejection.format)")
        }
        fail("rejection vector \(rejection.format) unexpectedly decrypted")
    } catch let error as VaultError {
        switch (rejection.expected, error) {
        case ("invalid-format", .InvalidFormat), ("auth-failure", .Decryption):
            checked += 1
        default:
            fail("rejection vector \(rejection.format) failed with the wrong error: \(error)")
        }
    } catch {
        fail("rejection vector \(rejection.format) threw a non-vault error: \(error)")
    }
}

// Round trips through the same surface. Key generation is Swift's job
// (custody layer): SecRandomCopyBytes, exactly as the native module does.
do {
    var freshKey = Data(count: 32)
    let status = freshKey.withUnsafeMutableBytes { buffer in
        SecRandomCopyBytes(kSecRandomDefault, 32, buffer.baseAddress!)
    }
    guard status == errSecSuccess else { fail("SecRandomCopyBytes failed") }
    let ciphertext = try encryptLocal(key: freshKey, plaintext: "JBSWY3DPEHPK3PXP")
    guard try decryptLocal(key: freshKey, ciphertextBase64: ciphertext) == "JBSWY3DPEHPK3PXP"
    else { fail("local round trip mismatch") }
    let envelope = try exportYhp2(password: "correct horse", payload: "example backup")
    guard try importYhp2(password: "correct horse", envelopeBase64: envelope) == "example backup"
    else { fail("YHP2 round trip mismatch") }
    checked += 2
} catch {
    fail("round trip failed: \(error)")
}

// Error variants and exact boundaries through the same surface.
do {
    _ = try encryptLocal(key: key, plaintext: String(repeating: "A", count: 4096))
    do {
        _ = try encryptLocal(key: key, plaintext: String(repeating: "A", count: 4097))
        fail("oversized plaintext unexpectedly encrypted")
    } catch VaultError.InputTooLarge {}
    do {
        _ = try encryptLocal(key: Data(count: 16), plaintext: "JBSWY3DPEHPK3PXP")
        fail("short key unexpectedly encrypted")
    } catch VaultError.Encryption {}
    _ = try exportYhp2(password: "12345678", payload: "payload")
    do {
        _ = try exportYhp2(password: "1234567", payload: "payload")
        fail("short password unexpectedly accepted")
    } catch VaultError.InvalidPassword {}
    do {
        _ = try importYhp2(password: "", envelopeBase64: "WUhQMg==")
        fail("empty password unexpectedly accepted")
    } catch VaultError.InvalidPassword {}
    checked += 5
} catch {
    fail("error-variant checks failed unexpectedly: \(error)")
}

print("OK: \(checked) golden checks passed through Swift -> Rust")
