// Limrun Android emulator, through its own TypeScript SDK: same steps as mobilebox.mjs. Deletes every instance.
//   (cd benchmarks && npm install) && LIM_API_KEY=... CLIENT="..." node benchmarks/limrun.mjs
import { Limrun, createInstanceClient } from '@limrun/api'
import { APK_URL, APK_PACKAGE, RUNS, TAPS, now, record } from './lib.mjs'

const P = 'Limrun', REGION = 'EU (jurisdiction eu)'
const lim = new Limrun() // reads LIM_API_KEY

for (let run = 1; run <= RUNS; run++) {
  let id, client
  try {
    const t0 = now()
    const inst = await lim.androidInstances.create({
      wait: true,
      metadata: { labels: { benchmark: `run-${run}` } },
      // Android 14 like the other phones here; Limrun's default is 15.
      spec: { jurisdiction: 'eu', inactivityTimeout: '5m', hardTimeout: '15m', clues: [{ kind: 'OSVersion', osVersion: '14' }] },
    })
    id = inst.metadata.id
    record(P, REGION, 'ready', run, now() - t0)
    client = await createInstanceClient({ apiUrl: inst.status.apiUrl, token: inst.status.token, logLevel: 'error' })
    await client.screenshot()
    record(P, REGION, 'cold_start_to_screenshot', run, now() - t0, inst.status.region ?? '')

    for (let i = 1; i <= TAPS; i++) {
      const t = now()
      await client.tap({ x: i % 2 ? 300 : 780, y: 1200 })
      const tapped = now()
      await client.screenshot()
      record(P, REGION, 'tap', `${run}.${i}`, tapped - t)
      record(P, REGION, 'tap_to_screenshot', `${run}.${i}`, now() - t)
    }

    const t = now()
    await client.sendAsset(APK_URL, 120_000)
    const ok = (await client.listApps()).some((a) => a.bundleId === APK_PACKAGE)
    record(P, REGION, 'apk_install', run, now() - t, ok ? '' : 'package not listed after install')
  } catch (e) {
    record(P, REGION, 'error', run, null, String(e.message ?? e).slice(0, 200))
  } finally {
    client?.disconnect()
    if (id) await lim.androidInstances.delete(id).catch((e) => record(P, REGION, 'cleanup_failed', run, null, `${id} ${e.message}`))
  }
}
