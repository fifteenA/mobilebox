// Mobilebox: cold start → first screenshot, tap → screenshot, APK install, park → resume. Deletes every phone.
//   MOBILESANDBOX_API_KEY=... CLIENT="my laptop, Berlin" node benchmarks/mobilebox.mjs
import { APK_URL, APK_PACKAGE, RUNS, TAPS, now, record, sleep } from './lib.mjs'

const base = process.env.MOBILESANDBOX_URL ?? 'https://mobilebox.dev'
const key = process.env.MOBILESANDBOX_API_KEY ?? (() => { throw new Error('Set MOBILESANDBOX_API_KEY') })()
const P = 'Mobilebox', REGION = 'EU (Germany)'

async function call(path, method = 'GET', body) {
  const bytes = body instanceof Uint8Array
  const r = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'User-Agent': 'mobilebox-benchmark MobileboxInternal', ...(body === undefined ? {} : { 'Content-Type': bytes ? 'application/octet-stream' : 'application/json' }) },
    body: body === undefined ? undefined : bytes ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  })
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${await r.text()}`)
  return r.headers.get('content-type')?.includes('json') ? r.json() : r.arrayBuffer()
}
async function until(id, want) {
  for (const deadline = now() + 300_000; now() < deadline;) {
    const p = await call(`/v1/phones/${id}?wait=${want}&timeout=50`)
    if (p.status === want) return p
    if (p.status === 'failed') throw new Error(`phone ${id} failed`)
    await sleep(500)
  }
  throw new Error(`phone ${id} not ${want} after 300 s`)
}

for (let run = 1; run <= RUNS; run++) {
  let id
  try {
    const t0 = now()
    id = (await call('/v1/phones', 'POST', { name: `benchmark-${run}`, idle_timeout: 300, max_duration: 900 })).id
    await until(id, 'ready')
    record(P, REGION, 'ready', run, now() - t0)
    await call(`/v1/phones/${id}/screenshot`)
    record(P, REGION, 'cold_start_to_screenshot', run, now() - t0)

    for (let i = 1; i <= TAPS; i++) { // alternate two points on the home screen; the next screenshot is the "screen"
      const t = now()
      await call(`/v1/phones/${id}/actions`, 'POST', { actions: [{ type: 'tap', target: { x: i % 2 ? 300 : 780, y: 1200 } }] })
      const tapped = now()
      await call(`/v1/phones/${id}/screenshot`)
      record(P, REGION, 'tap', `${run}.${i}`, tapped - t)
      record(P, REGION, 'tap_to_screenshot', `${run}.${i}`, now() - t)
    }

    let t = now()
    await call(`/v1/phones/${id}/apps`, 'POST', { url: APK_URL }) // the phone downloads it, like the other providers
    record(P, REGION, 'apk_install', run, now() - t)

    t = now()
    await call(`/v1/phones/${id}/park`, 'POST')
    await until(id, 'parked')
    record(P, REGION, 'park', run, now() - t)
    t = now()
    await call(`/v1/phones/${id}/start`, 'POST')
    await until(id, 'ready')
    await call(`/v1/phones/${id}/screenshot`)
    const kept = (await call(`/v1/phones/${id}/apps`)).data?.some((a) => a.package === APK_PACKAGE)
    record(P, REGION, 'resume_to_screenshot', run, now() - t, kept ? 'app kept after park' : 'APP MISSING after park')
  } catch (e) {
    record(P, REGION, 'error', run, null, e.message.slice(0, 200))
  } finally {
    for (let i = 0; id && i < 5; i++) { // retried: a restarting API answers 502 for a few seconds
      try { await call(`/v1/phones/${id}`, 'DELETE'); id = null } catch (e) { if (i === 4) record(P, REGION, 'cleanup_failed', run, null, `${id} ${e.message}`); else await sleep(10_000) }
    }
  }
}
