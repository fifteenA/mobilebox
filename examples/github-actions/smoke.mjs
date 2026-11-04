// APK smoke test for CI: upload the build to a fresh phone, open it, wait for one label, delete the phone.
// Node 24, no dependencies. Exits non-zero on a wrong package, a failed action or a failed cleanup.
//
//   MOBILESANDBOX_API_KEY=... APK_FILE=app-debug.apk EXPECTED_PACKAGE=com.example.app EXPECTED_LABEL=Welcome \
//     node smoke.mjs
import { readFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'

const base = process.env.MOBILESANDBOX_URL ?? 'https://mobilebox.dev'
const { MOBILESANDBOX_API_KEY: key, APK_FILE, EXPECTED_PACKAGE, EXPECTED_LABEL } = process.env
if (!key || !APK_FILE || !EXPECTED_PACKAGE || !EXPECTED_LABEL) {
  throw new Error('Set MOBILESANDBOX_API_KEY, APK_FILE, EXPECTED_PACKAGE and EXPECTED_LABEL')
}

async function call(path, method = 'GET', body, headers = {}) {
  const json = body !== undefined && !(body instanceof Uint8Array)
  let response
  try {
    response = await fetch(base + path, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body === undefined ? {} : { 'Content-Type': json ? 'application/json' : 'application/octet-stream' }),
        ...headers,
      },
      body: json ? JSON.stringify(body) : body,
      signal: AbortSignal.timeout(180_000),
    })
  } catch (error) {
    throw Object.assign(new Error(`${method} ${path} -> ${error.message}`), { retryable: true }) // network or timeout
  }
  const text = await response.text()
  if (!response.ok) {
    throw Object.assign(new Error(`${method} ${path} -> ${response.status} ${text}`), { retryable: response.status >= 500 })
  }
  return text ? JSON.parse(text) : null
}

let id
let deleting
function cleanup() { // runs once, whether from finally or a signal
  deleting ??= id ? call(`/v1/phones/${id}`, 'DELETE').then(() => console.log(`Deleted ${id}`)) : Promise.resolve()
  return deleting
}
// A cancelled CI job sends SIGINT, then SIGTERM: delete the phone before exiting.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => cleanup().finally(() => process.exit(130)))
}

let failed = false
try {
  // Retrying with the same Idempotency-Key returns the same phone, so a lost response cannot leak a second one.
  const idempotencyKey = crypto.randomUUID()
  let phone
  for (let attempt = 1; !phone; attempt++) {
    try {
      phone = await call('/v1/phones?wait=ready&timeout=50', 'POST', {
        name: `ci-${process.env.GITHUB_RUN_ID ?? Date.now()}`, idle_timeout: 120, max_duration: 600,
      }, { 'Idempotency-Key': idempotencyKey })
    } catch (error) {
      if (attempt === 3 || !error.retryable) throw error
      await sleep(3000)
    }
  }
  id = phone.id // keep this id; never create again while it boots
  const deadline = Date.now() + 180_000
  while (phone.status === 'creating' || phone.status === 'starting') {
    if (Date.now() > deadline) throw new Error('Boot deadline exceeded')
    phone = await call(`/v1/phones/${id}?wait=ready&timeout=50`)
  }
  if (phone.status !== 'ready') throw new Error(JSON.stringify(phone))

  const installed = await call(`/v1/phones/${id}/apps?grant_permissions=true`, 'POST', await readFile(APK_FILE))
  if (installed.package !== EXPECTED_PACKAGE) {
    throw new Error(`Installed ${installed.package}, expected ${EXPECTED_PACKAGE}`)
  }
  const result = await call(`/v1/phones/${id}/actions`, 'POST', { actions: [
    { type: 'open_app', package: installed.package },
    { type: 'wait_for', text: EXPECTED_LABEL, timeout_ms: 30_000 },
  ] })
  const bad = result.results.find(item => !item.ok)
  if (bad) throw new Error(`${JSON.stringify(bad.error)}\nScreen:\n${result.screen.text}`)
  console.log(`Smoke passed: ${installed.package} ${installed.version_name} shows "${EXPECTED_LABEL}"`)
} catch (error) {
  failed = true
  throw error
} finally {
  try {
    await cleanup()
  } catch (cleanupError) {
    console.error('Cleanup failed; delete the phone from the dashboard:', cleanupError)
    if (!failed) process.exitCode = 1
  }
}
