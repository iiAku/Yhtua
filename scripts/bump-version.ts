import { readFileSync, writeFileSync } from 'node:fs'

const nextVersion = process.argv[2]
if (!nextVersion || !/^\d+\.\d+\.\d+$/.test(nextVersion)) {
  throw new Error('Usage: bun run version:bump X.Y.Z')
}

const updateJson = (path: string) => {
  const data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  data.version = nextVersion
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
}

for (const path of ['package.json', 'landing/package.json', 'src-tauri/tauri.conf.json']) {
  updateJson(path)
}

const replaceVersion = (path: string, pattern: RegExp, replacement: string) => {
  const content = readFileSync(path, 'utf8')
  const updated = content.replace(pattern, replacement)
  if (updated === content) throw new Error(`Could not update ${path}`)
  writeFileSync(path, updated)
}

replaceVersion('Cargo.toml', /^version = "[^"]+"/m, `version = "${nextVersion}"`)
for (const crate of ['yhtua', 'yhtua-crypto']) {
  replaceVersion(
    'Cargo.lock',
    new RegExp(`(\\[\\[package\\]\\]\\nname = "${crate}"\\nversion = ")[^"]+"`),
    `$1${nextVersion}"`,
  )
}
// The standalone fuzz crate pins yhtua-crypto in its own lockfile.
replaceVersion(
  'src-tauri/fuzz/Cargo.lock',
  /(\[\[package\]\]\nname = "yhtua-crypto"\nversion = ")[^"]+"/,
  `$1${nextVersion}"`,
)

console.log(`Updated all version sources to ${nextVersion}`)
