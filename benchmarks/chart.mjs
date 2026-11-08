// results/summary.csv → results/cold-start.svg (760 px) and cold-start-narrow.svg (300 px, the card width on a 390 px phone, labels above the bars, for phones):
// median seconds from "create" to the first screenshot, p90 as a tick. One measure, one hue.
//   node benchmarks/chart.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { HERE } from './lib.mjs'

const dir = join(HERE, 'results')
const [head, ...lines] = readFileSync(join(dir, 'summary.csv'), 'utf8').trim().split('\n')
const cols = head.split(',')
const rows = lines.map((l) => Object.fromEntries([...l.matchAll(/("[^"]*"|[^,]*)(,|$)/g)].slice(0, cols.length).map((m, i) => [cols[i], m[1].replace(/^"|"$/g, '')])))
const pick = (provider, client, metric) => rows.find((r) => r.provider === provider && r.client.startsWith(client) && r.metric === metric)

// One row per provider and client, in the order of the table on the page.
const BARS = [
  ['Limrun', 'Limrun', 'Data center'],
  ['Mobilebox', 'Mobilebox', 'Data center'],
  ['Phone Harness', 'Phone Harness', 'Data center'],
  ['Mobilebox, from a CI runner', 'Mobilebox', 'GitHub'],
  ['Local emulator, KVM', 'Local emulator, KVM on', 'GitHub'],
  ['Local emulator, no KVM', 'Local emulator, KVM off', 'GitHub'],
]
const data = BARS.map(([label, p, c]) => {
  const r = pick(p, c, 'cold_start_to_screenshot')
  return { label, med: r?.median_ms ? r.median_ms / 1000 : null, p90: r?.p90_ms ? r.p90_ms / 1000 : null, n: r ? Number(r.n) : 0 }
})
// ponytail: anything past 2 minutes is a text row, so one software boot doesn't flatten the other bars
const OFF = 120
const onScale = (d) => d.med != null && d.med <= OFF
const max = Math.ceil(Math.max(...data.filter(onScale).map((d) => d.p90)) / 10) * 10 || 10
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const secs = (v) => `${v < 10 ? v.toFixed(2) : v.toFixed(1)} s`
const INK = '#111318', MUTED = '#5e626c', RULE = '#e8e9ed', BAR = '#2a46d1'
const FONT = 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif'

function render(W, narrow) {
  const L = narrow ? 0 : 200, R = narrow ? 8 : 24, rowH = narrow ? 64 : 48, top = narrow ? 92 : 64, H = top + data.length * rowH + 40
  const x = (s) => L + (s / max) * (W - L - R)
  const ticks = Array.from({ length: max / 10 + 1 }, (_, i) => i * 10).filter((t) => !narrow || t % 20 === 0)
  const bar = (d, cy) => {
    const w = Math.max(x(d.med) - L, 4), tick = x(d.p90)
    const far = tick - x(d.med) >= 48 // a distant p90 gets a whisker and its own label
    return `<g><title>${esc(d.label)}: median ${secs(d.med)}, p90 ${secs(d.p90)}, n=${d.n}</title>
<path d="M${L} ${cy - 9}h${w - 4}a4 4 0 0 1 4 4v10a4 4 0 0 1 -4 4h-${w - 4}z" fill="${BAR}"/>
${far ? `<line x1="${x(d.med)}" x2="${tick}" y1="${cy}" y2="${cy}" stroke="${MUTED}" stroke-width="1"/>` : ''}<line x1="${tick}" x2="${tick}" y1="${cy - 12}" y2="${cy + 12}" stroke="${INK}" stroke-width="2"/>
<text x="${(far ? x(d.med) : Math.max(tick, x(d.med))) + 8}" y="${far ? cy - 14 : cy + 5}" font-size="14" fill="${INK}">${secs(d.med)}</text>
${far ? `<text x="${tick - 6}" y="${cy - 14}" font-size="14" fill="${MUTED}" text-anchor="end">p90 ${secs(d.p90)}</text>` : ''}</g>`
  }
  const body = data.map((d, i) => {
    const y = top + i * rowH, cy = narrow ? y + 40 : y + rowH / 2
    const label = narrow ? `<text x="0" y="${y + 14}" font-size="14" fill="${INK}">${esc(d.label)}</text>` : `<text x="${L - 14}" y="${cy + 5}" font-size="14" fill="${INK}" text-anchor="end">${esc(d.label)}</text>`
    if (!onScale(d)) return `${label}<text x="${L}" y="${cy + 5}" font-size="14" fill="${MUTED}">${d.med == null ? 'did not reach a screenshot' : `${(d.med / 60).toFixed(1)} min, off this scale (n=${d.n})`}</text>`
    return label + bar(d, cy)
  }).join('\n')
  const sub = narrow ? ['Median, tick = p90. November 8, 2026.', 'Shorter is faster.'] : ['Median seconds, tick = p90. Mobilebox benchmark, November 8, 2026. Shorter is faster.']
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d" font-family="${FONT}">
<title id="t">Cold start to first screenshot, median seconds (November 8, 2026)</title>
<desc id="d">${esc(data.map((d) => `${d.label}: ${d.med == null ? 'no screenshot' : `${secs(d.med)} median, ${secs(d.p90)} p90, n=${d.n}`}`).join('; '))}</desc>
<rect width="${W}" height="${H}" fill="#fff"/>
<text x="0" y="22" font-size="17" font-weight="500" fill="${INK}">Cold start to first screenshot</text>
${sub.map((t, i) => `<text x="0" y="${44 + i * 20}" font-size="14" fill="${MUTED}">${t}</text>`).join('\n')}
${ticks.map((t) => `<line x1="${x(t)}" x2="${x(t)}" y1="${top - 6}" y2="${H - 34}" stroke="${RULE}"/><text x="${x(t)}" y="${H - 14}" font-size="14" fill="${MUTED}" text-anchor="${t === 0 && narrow ? 'start' : t === max ? 'end' : 'middle'}">${t} s</text>`).join('\n')}
${body}
</svg>
`
}
writeFileSync(join(dir, 'cold-start.svg'), render(760, false))
writeFileSync(join(dir, 'cold-start-narrow.svg'), render(300, true))
console.log(`wrote results/cold-start.svg and cold-start-narrow.svg (${data.filter(onScale).length} bars)`)
