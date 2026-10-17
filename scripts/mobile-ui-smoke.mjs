// Exercises the real Expo screens against the fixture-only development port.
// This does not claim to test native Keychain, camera, clipboard, or Files behavior.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

const port = process.env.YHTUA_MOBILE_PORT ?? '8094'
const url = process.env.YHTUA_MOBILE_URL ?? `http://localhost:${port}`
const output = process.env.YHTUA_MOBILE_SCREENSHOTS ?? join(tmpdir(), 'yhtua-mobile-ui')
const server = process.env.YHTUA_MOBILE_URL
  ? null
  : spawn(process.execPath, ['../../node_modules/expo/bin/cli', 'start', '--web', '--port', port], {
      cwd: new URL('../apps/mobile', import.meta.url),
      env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1', EXPO_PUBLIC_USE_MOCK_VAULT: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    })
let serverLog = ''
server?.stdout.on('data', (chunk) => {
  serverLog = (serverLog + chunk).slice(-4000)
})
server?.stderr.on('data', (chunk) => {
  serverLog = (serverLog + chunk).slice(-4000)
})
let browser
try {
  await mkdir(output, { recursive: true })
  const deadline = Date.now() + 60_000
  while (true) {
    if (server && server.exitCode !== null) throw new Error(`Expo exited: ${serverLog}`)
    try {
      if ((await fetch(url)).ok) break
    } catch {
      /* Metro is still starting. */
    }
    if (Date.now() > deadline) throw new Error(`Expo did not start: ${serverLog}`)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  browser = await chromium.launch({
    headless: true,
    ...(process.env.YHTUA_BROWSER_PATH ? { executablePath: process.env.YHTUA_BROWSER_PATH } : {}),
    args: ['--no-sandbox'],
  })
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  const button = (name) => page.getByRole('button', { name, exact: true })
  const field = (name) => page.getByLabel(name, { exact: true })
  const screenshot = (name) => page.screenshot({ path: join(output, `${name}.png`) })
  await page.goto(url)
  await button('Enter a setup key').waitFor()
  await screenshot('welcome')
  await button('Enter a setup key').click()
  await field('Account name').fill('Personal email')
  await field('Service (optional)').fill('Google')
  await field('Setup key').fill('JBSWY3DPEHPK3PXP') // Public synthetic fixture only.
  await button('Add token').click()
  await button('Open Personal email').waitFor()
  await screenshot('vault')
  const rowDirection = await button('Open Personal email').evaluate(
    (element) => getComputedStyle(element).flexDirection,
  )
  assert.equal(rowDirection, 'row', 'Token avatar, name, and chevron must stay on one row')
  await page.getByRole('textbox', { name: 'Search tokens', exact: true }).fill('missing')
  await page.getByText('No tokens found', { exact: true }).waitFor()
  await button('Clear search').click()
  await page.getByRole('textbox', { name: 'Search tokens', exact: true }).fill('google')
  await button('Open Personal email').click()
  await page.getByLabel(/^Verification code (\d ){5}\d$/).waitFor()
  await screenshot('token')
  await button('Edit token').click()
  await field('Account name').fill('Work email')
  await button('Save changes').click()
  await page.getByText('Work email', { exact: true }).filter({ visible: true }).waitFor()

  // A reload is a fresh session and must re-lock a persisted vault.
  await page.goto(`${url}/settings/transfer`)
  await button('Unlock vault').click()
  await page.getByText('A copy, just in case.', { exact: true }).waitFor()
  await field('Create a backup password').fill('test password')
  await field('Confirm backup password').fill('different password')
  await button('Choose where to save').click()
  await page.getByText('The passwords do not match.', { exact: true }).waitFor()
  await page.getByRole('tab', { name: 'Import a backup', exact: true }).click()
  assert.equal(
    await field('Backup password').inputValue(),
    '',
    'Changing mode must clear the password',
  )
  await button('Choose a backup file').click()
  await page
    .getByText('Enter a backup password with at least 8 characters.', { exact: true })
    .waitFor()
  await screenshot('backups')
  await page.goto(`${url}/settings`)
  await button('Unlock vault').click()
  await button('Lock vault now').click()
  await button('Unlock vault').waitFor()
  await screenshot('locked')
  await button('Unlock vault').click()
  await button('Add token').waitFor()

  // Custom parameters are mobile-relevant TOTP features, unlike desktop folder paths.
  await button('Add token').click()
  await field('Account name').fill('Eight digit account')
  await field('Setup key').fill('JBSWY3DPEHPK3PXP')
  await button('Advanced options').click()
  await page.getByRole('radio', { name: 'SHA256', exact: true }).click()
  await field('Code digits (6–8)').fill('8')
  await field('Refresh interval in seconds (15–300)').fill('60')
  await button('Add token').click()
  await button('Open Eight digit account').click()
  await page.getByLabel(/^Verification code (\d ){7}\d$/).waitFor()
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    await screenshot(`token-${width}`)
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `No horizontal overflow at ${width}px`,
    )
  }
  await button('Delete token…').click()
  await button('Keep token').click()
  await button('Delete token…').click()
  await button('Delete token permanently').click()
  await button('Open Work email').waitFor()
  assert.equal(await button('Open Eight digit account').count(), 0)
  assert.deepEqual(errors, [], 'The walkthrough must have no runtime or console errors')
  console.log(`Mobile UI smoke passed. Screenshots: ${output}`)
} finally {
  await browser?.close()
  if (server?.pid) {
    if (process.platform === 'win32') server.kill()
    else {
      try {
        process.kill(-server.pid, 'SIGTERM')
      } catch {
        /* Already exited. */
      }
    }
  }
}
