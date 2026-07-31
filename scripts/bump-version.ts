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

replaceVersion('src-tauri/Cargo.toml', /^version = "[^"]+"/m, `version = "${nextVersion}"`)
replaceVersion(
  'src-tauri/Cargo.lock',
  /(\[\[package\]\]\nname = "yhtua"\nversion = ")[^"]+"/,
  `$1${nextVersion}"`,
)

console.log(`Updated all version sources to ${nextVersion}`)
