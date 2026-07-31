# Release checklist

1. Review [the dependency policy](dependency-policy.md), threat model changes, and all changelog entries.
2. Choose an unused semantic version and run `bun run version:bump X.Y.Z`.
3. Run frozen install, formatting, lint, type checks, frontend/Rust tests, both production builds, `bun audit`, `cargo audit`, `cargo deny`, CodeQL, secret scan, and version consistency.
4. Validate Tauri packaging on Linux x86_64, macOS arm64, and Windows x86_64. Do not advertise formats the matrix did not produce.
5. Confirm signing/notarization configuration. Unsigned artifacts must be clearly identified; never expose signing secrets to pull requests.
6. Review generated CycloneDX SBOMs and SHA-256 checksums, artifact names, and provenance attestations.
7. Merge through normal branch protection; do not bypass required review or checks.
8. Create annotated tag `vX.Y.Z` at the validated commit and push it. The release workflow rejects mismatched tags/versions.
9. Confirm all matrix jobs and the final publish job pass before the release becomes non-draft/non-prerelease/Latest.
10. Confirm GitHub Pages deploys from the same tag/version, displays the version, and that download links and every checksum resolve.
11. Record the tag/commit, workflow URLs, artifacts, and any unsigned/notarization limitations in the release notes.
12. Verify a clean working tree from the tagged commit.

Repository administrators should also verify GitHub **Settings → Code security and analysis** keeps private vulnerability reporting, Dependabot alerts/security updates, secret scanning, and push protection enabled where the repository plan supports them.
