// Compile-only iOS-simulator consumer: proves the generated Swift bindings
// plus the XCFramework headers form a consumable unit for an iOS target —
// exactly what the Expo native module will import. Never executed (that is
// the physical-device self-test's job in sub-gate 6b).

import Foundation

func consumerTypeCheck() {
    let _: (Data, String) throws -> String = encryptLocal(key:plaintext:)
    let _: (Data, String) throws -> String = decryptLocal(key:ciphertextBase64:)
    let _: (String, String) throws -> String = exportYhp2(password:payload:)
    let _: (String, String) throws -> String = importYhp2(password:envelopeBase64:)
    let _: VaultError = .Decryption
}
