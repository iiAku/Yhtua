# Security policy

## Supported versions

Only the latest published release receives security fixes. Older releases should be upgraded before reporting behavior that may already be fixed.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository: **Security → Advisories → Report a vulnerability**. Do not open a public issue for an undisclosed vulnerability and do not include real TOTP secrets, passwords, encryption keys, tokens, or personal backup files.

Include the affected version/platform, impact, minimal reproduction using synthetic credentials, and any suggested remediation. The maintainer aims to acknowledge a report within 5 business days, provide an initial assessment within 10 business days, and coordinate disclosure after a fix is available. These are targets, not contractual guarantees.

## Security properties and limits

Yhtua encrypts local TOTP secrets with AES-256-GCM using a random key held by the platform credential store. New password backups use Argon2id and AES-256-GCM; supported legacy backups use PBKDF2-SHA256 and AES-256-GCM. Authenticated decryption fails closed.

This protects data at rest and backup contents from casual disclosure. It does not protect against malware, debuggers, accessibility tools, screenshots, memory inspection, or another process running with the same OS-user privileges while Yhtua is unlocked. JavaScript strings cannot be reliably zeroized. Clipboard managers may retain copied values. OS credential-store availability and security depend on the platform and desktop session.

No review can guarantee absolute security or that the software is vulnerability-free. See [the threat model](docs/threat-model.md) and [backup format](docs/backup-format.md).
