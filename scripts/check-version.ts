import { readFileSync } from 'node:fs'

const readJsonVersion = (path: string): string =>
  (JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown }).version as string

const cargoToml = readFileSync('src-tauri/Cargo.toml', 'utf8')
const cargoLock = readFileSync('src-tauri/Cargo.lock', 'utf8')
const landingPage = readFileSync('landing/src/pages/index.astro', 'utf8')

const versions = new Map<string, string | undefined>([
  ['package.json', readJsonVersion('package.json')],
  ['landing/package.json', readJsonVersion('landing/package.json')],
  ['src-tauri/tauri.conf.json', readJsonVersion('src-tauri/tauri.conf.json')],
  ['src-tauri/Cargo.toml', cargoToml.match(/^version = "([^"]+)"/m)?.[1]],
  [
    'src-tauri/Cargo.lock',
    cargoLock.match(/\[\[package\]\]\nname = "yhtua"\nversion = "([^"]+)"/)?.[1],
  ],
])

const expected = versions.get('package.json')
if (!expected || !/^\d+\.\d+\.\d+$/.test(expected)) {
  throw new Error('package.json must contain a stable semantic version')
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
