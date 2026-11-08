// Phone Harness cloud Android: REST to create and end the session, ADB for everything on the phone (their documented path:
// no tap, screenshot-on-demand or install endpoint). Same steps as mobilebox.mjs. Ends every session.
//   PHONE_HARNESS_API_KEY=... ADB=/path/to/adb CLIENT="..." node benchmarks/phoneharness.mjs
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { apk, HERE, APK_PACKAGE, RUNS, TAPS, now, record, sleep } from './lib.mjs'

const base = 'https://api.phone-harness.com'
const key = process.env.PHONE_HARNESS_API_KEY ?? (() => { throw new Error('Set PHONE_HARNESS_API_KEY') })()
const ADB = process.env.ADB ?? 'adb'
const P = 'Phone Harness', REGION = 'service default'
const run_ = promisify(execFile)
const adb = (...a) => run_(ADB, a, { maxBuffer: 64 << 20, encoding: 'buffer', timeout: 180_000 }).then((r) => r.stdout)

async function call(path, method = 'GET', body, headers = {}) {
  const r = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}

await apk()
const APK = join(HERE, 'results', 'org.fossify.math_10.apk')
for (let run = 1; run <= RUNS; run++) {
  let id, serial
  try {
    const t0 = now()
    id = (await call('/sessions', 'POST', { timeout_seconds: 600 }, { 'Idempotency-Key': `benchmark-${crypto.randomUUID()}` })).id
    let s
    for (const deadline = now() + 300_000; ; await sleep(1000)) {
      s = await call(`/sessions/${id}`)
      if (s.state === 'ready') break
      if (s.state === 'error' || s.state === 'closing' || now() > deadline) throw new Error(`session ${id} ${s.state}`)
    }
    record(P, REGION, 'ready', run, now() - t0)
    const a = s.adb ?? await call(`/sessions/${id}/adb`, 'POST') // enable is idempotent; ready sessions usually carry it
    serial = `${a.host}:${a.port}`
    await adb('connect', serial)
    await adb('-s', serial, 'shell', 'unlock', a.code)
    await adb('-s', serial, 'exec-out', 'screencap', '-p')
    record(P, REGION, 'cold_start_to_screenshot', run, now() - t0)

    for (let i = 1; i <= TAPS; i++) {
      const t = now()
      await adb('-s', serial, 'shell', 'input', 'tap', String(i % 2 ? 300 : 780), '1200')
      const tapped = now()
      await adb('-s', serial, 'exec-out', 'screencap', '-p')
      record(P, REGION, 'tap', `${run}.${i}`, tapped - t)
      record(P, REGION, 'tap_to_screenshot', `${run}.${i}`, now() - t)
    }

    const t = now()
    await adb('-s', serial, 'install', '-r', APK) // uploaded from the client: no install-by-URL in their API
    const ok = String(await adb('-s', serial, 'shell', 'pm', 'list', 'packages', APK_PACKAGE)).includes(APK_PACKAGE)
    record(P, REGION, 'apk_install', run, now() - t, ok ? 'adb install from the client' : 'package not listed after install')
  } catch (e) {
    record(P, REGION, 'error', run, null, String(e.message ?? e).slice(0, 200))
  } finally {
    if (serial) await adb('disconnect', serial).catch(() => {})
    if (id) await call(`/sessions/${id}`, 'DELETE').catch((e) => record(P, REGION, 'cleanup_failed', run, null, `${id} ${e.message}`))
  }
}
