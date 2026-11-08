// Shared helpers for the benchmark scripts: timing, the raw-samples CSV, the test APK. Node 24, no dependencies.
import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const HERE = dirname(fileURLToPath(import.meta.url))
// Same small APK for every provider: Fossify Calculator 1.4.0 from F-Droid (arm64 + x86_64, ~4 MB).
export const APK_URL = 'https://f-droid.org/repo/org.fossify.math_10.apk'
export const APK_PACKAGE = 'org.fossify.math'
export const RUNS = Number(process.env.RUNS ?? 5)
export const TAPS = Number(process.env.TAPS ?? 10)
export const OUT = process.env.OUT ?? join(HERE, 'results', 'samples.csv')
export const CLIENT = process.env.CLIENT ?? 'unknown client' // where the script runs, e.g. "GitHub Actions ubuntu-latest"

export const now = () => performance.now()
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function apk() {
  const file = join(HERE, 'results', 'org.fossify.math_10.apk')
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true })
    const r = await fetch(APK_URL)
    if (!r.ok) throw new Error(`APK download ${r.status}`)
    writeFileSync(file, Buffer.from(await r.arrayBuffer()))
  }
  return readFileSync(file)
}

// One row per measurement. ms is empty when a step failed; note says why.
const HEADER = 'date,provider,region,client,metric,run,ms,note\n'
export function record(provider, region, metric, run, ms, note = '') {
  if (!existsSync(OUT)) { mkdirSync(dirname(OUT), { recursive: true }); writeFileSync(OUT, HEADER) }
  const cell = (v) => /[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v)
  const row = [new Date().toISOString(), provider, region, CLIENT, metric, run, ms == null ? '' : Math.round(ms), note]
  appendFileSync(OUT, row.map(cell).join(',') + '\n')
  console.log(`${provider} run ${run} ${metric}: ${ms == null ? 'FAILED' : `${Math.round(ms)} ms`} ${note}`)
}

// Nearest-rank percentile: with 5 samples p90 is the slowest one. No interpolation, no outliers dropped.
export function pct(values, p) {
  const s = [...values].sort((a, b) => a - b)
  return s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)]
}
