// results/*.csv (raw samples) → results/summary.csv: n, failures, median and p90 per provider, client and metric.
//   node benchmarks/summarize.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { HERE, pct } from './lib.mjs'

const dir = join(HERE, 'results')
const parse = (line) => [...line.matchAll(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)].slice(0, -1).map((m) => m[1].replace(/^"|"$/g, '').replaceAll('""', '"'))
const groups = new Map()
for (const f of readdirSync(dir).filter((f) => f.endsWith('.csv') && f !== 'summary.csv' && !f.startsWith('excluded-'))) {
  const [head, ...rows] = readFileSync(join(dir, f), 'utf8').trim().split('\n')
  const cols = parse(head)
  for (const r of rows) {
    const o = Object.fromEntries(parse(r).map((v, i) => [cols[i], v]))
    const k = [o.provider, o.region, o.client, o.metric].join('\u0000')
    const g = groups.get(k) ?? { ...o, ms: [], failed: 0, dates: new Set() }
    o.ms === '' ? g.failed++ : g.ms.push(Number(o.ms))
    g.dates.add(o.date.slice(0, 10))
    groups.set(k, g)
  }
}
const out = ['provider,region,client,metric,n,failed,median_ms,p90_ms,dates']
for (const g of [...groups.values()].sort((a, b) => (a.provider + a.client + a.metric).localeCompare(b.provider + b.client + b.metric))) {
  out.push([g.provider, g.region, g.client, g.metric, g.ms.length, g.failed, g.ms.length ? pct(g.ms, 50) : '', g.ms.length ? pct(g.ms, 90) : '', [...g.dates].join(' ')]
    .map((v) => /[",]/.test(String(v)) ? `"${v}"` : v).join(','))
}
writeFileSync(join(dir, 'summary.csv'), out.join('\n') + '\n')
console.log(out.join('\n'))

// Self-check of the percentile rule the page states: nearest rank, nothing dropped.
console.assert(pct([5, 1, 4, 2, 3], 50) === 3 && pct([5, 1, 4, 2, 3], 90) === 5 && pct([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90) === 9, 'pct')
