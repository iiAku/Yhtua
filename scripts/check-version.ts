import { readFileSync } from 'node:fs'

const readJsonVersion = (path: string): string =>
  (JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown }).version as string

const cargoToml = readFileSync('Cargo.toml', 'utf8')
const cargoLock = readFileSync('Cargo.lock', 'utf8')
const fuzzCargoLock = readFileSync('src-tauri/fuzz/Cargo.lock', 'utf8')
const landingPage = readFileSync('landing/src/pages/index.astro', 'utf8')

const lockedVersion = (lock: string, name: string): string | undefined =>
  lock.match(new RegExp(`\\[\\[package\\]\\]\\nname = "${name}"\\nversion = "([^"]+)"`))?.[1]

const versions = new Map<string, string | undefined>([
  ['package.json', readJsonVersion('package.json')],
  ['landing/package.json', readJsonVersion('landing/package.json')],
  ['src-tauri/tauri.conf.json', readJsonVersion('src-tauri/tauri.conf.json')],
  ['Cargo.toml (workspace)', cargoToml.match(/^version = "([^"]+)"/m)?.[1]],
  ['Cargo.lock (yhtua)', lockedVersion(cargoLock, 'yhtua')],
  ['Cargo.lock (yhtua-crypto)', lockedVersion(cargoLock, 'yhtua-crypto')],
  ['src-tauri/fuzz/Cargo.lock (yhtua-crypto)', lockedVersion(fuzzCargoLock, 'yhtua-crypto')],
])

const expected = versions.get('package.json')
if (!expected || !/^\d+\.\d+\.\d+$/.test(expected)) {
  throw new Error('package.json must contain a stable semantic version')
}

// The mobile app versions independently of the desktop lockstep, but its own
// sources must agree with each other.
const mobilePackage = readJsonVersion('apps/mobile/package.json')
const mobileApp = (
  JSON.parse(readFileSync('apps/mobile/app.json', 'utf8')) as { expo?: { version?: unknown } }
).expo?.version as string | undefined
if (!mobilePackage || mobilePackage !== mobileApp) {
  console.error(
    `apps/mobile version mismatch: package.json ${mobilePackage} vs app.json ${mobileApp}`,
  )
  process.exit(1)
}

const mismatches = [...versions].filter(([, version]) => version !== expected)
if (mismatches.length > 0) {
  for (const [file, version] of mismatches) {
    console.error(`${file}: expected ${expected}, found ${version ?? 'no version'}`)
  }
  process.exit(1)
}

if (/v\d+\.\d+\.\d+/.test(landingPage)) {
  throw new Error('The landing page must derive its displayed version instead of hard-coding one')
}

console.log(`All version sources agree on ${expected}`)
