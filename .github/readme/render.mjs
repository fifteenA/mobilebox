// Renders the README's banner and demo (light + dark) from the website's own recorded run, in the site's design system
// (cobalt, pixel mountain, Inter, the phone frame). Playwright and ffmpeg are not repo dependencies:
//   NODE_PATH=<dir with playwright> PLAYWRIGHT_BROWSERS_PATH=<browsers> node .github/readme/render.mjs <site checkout>/web
// The site's web/ folder supplies static/run (recording.json + frames), static/fonts, static/mark.svg and mountain().
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'

const WEB = process.argv[2]
if (!WEB) throw new Error('usage: node .github/readme/render.mjs <site checkout>/web')
const OUT = new URL('.', import.meta.url).pathname
const { mountain } = await import(join(WEB, 'build.ts'))
const rec = JSON.parse(readFileSync(join(WEB, 'static/run/recording.json'), 'utf8'))
const TASK = 'Find the height of the Matterhorn on Wikipedia' // RUN.task in the site's build.ts
const ANSWER = '4,478 m (14,692 ft)' // [42] in the answer step's observe text, which uses no-break spaces
if (!rec.steps.at(-1).observe.includes('[42] View "4,478\u00a0m (14,692\u00a0ft)"')) throw new Error('answer not in the recorded observe text')
const seconds = (ms) => ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
const total = rec.steps.reduce((sum, s) => sum + s.durationMs, 0)

const THEMES = {
  light: { ground: '#fbfbfc', ink: '#111318', muted: '#5e626c', accent: '#2a46d1', hairline: '#e8e9ed', field: '#868a94', well: '#f3f4f6',
    card: 'rgba(255,255,255,.92)', ring: 'rgba(17,19,24,.06)', shadow: '0 2px 4px rgba(17,19,24,.04), 0 16px 40px -12px rgba(17,19,24,.14), 0 40px 80px -32px rgba(17,19,24,.16)',
    glow: 'rgba(42,70,209,.08)', mtn: '#2a46d1', mtnBoost: 1 },
  dark: { ground: '#10131a', ink: '#f2f3f6', muted: '#9ca2ae', accent: '#4a66f5', hairline: '#252a34', field: '#5d636f', well: '#1c212a',
    card: 'rgba(24,28,36,.94)', ring: 'rgba(255,255,255,.08)', shadow: '0 2px 4px rgba(0,0,0,.3), 0 16px 40px -12px rgba(0,0,0,.5), 0 40px 80px -32px rgba(0,0,0,.6)',
    glow: 'rgba(74,102,245,.16)', mtn: '#6f86ff', mtnBoost: 1.9 },
}
// The site's mark, in the theme's cobalt (the light one is too dark on a dark ground).
const mark = (t) => readFileSync(join(WEB, 'static/mark.svg'), 'utf8').replaceAll('#2a46d1', t.mtn)
const ground = (t, width, height, boost = 1) => mountain(width, height).replaceAll('#2a46d1', t.mtn)
  .replace(/stop-opacity="(0\.\d+)"/g, (_, a) => `stop-opacity="${(a * t.mtnBoost * boost).toFixed(3)}"`)

const css = (t) => `
@font-face { font-family: Inter; src: url(/static/fonts/Inter-Regular-Latin.woff2); font-weight: 400; }
@font-face { font-family: Inter; src: url(/static/fonts/Inter-Medium-Latin.woff2); font-weight: 500; }
* { box-sizing: border-box; margin: 0; }
html, body { background: transparent; }
body { font-family: Inter, sans-serif; color: ${t.ink}; -webkit-font-smoothing: antialiased; }
.canvas { position: relative; overflow: hidden; border-radius: 24px; background: ${t.ground}; box-shadow: inset 0 0 0 1px ${t.ring}; }
.canvas::before { content: ""; position: absolute; inset: 0; background: radial-gradient(30% 60% at var(--gx) 50%, ${t.glow}, transparent 70%); }
.hero-ground { position: absolute; left: var(--ml, 0); bottom: 0; width: var(--mw); height: var(--mh); }
.phone { position: absolute; padding: 3px; border-radius: 34px; background: linear-gradient(145deg, #71757e 0%, #2b2d33 18%, #1b1c20 50%, #2b2d33 82%, #5f636b 100%);
  box-shadow: 0 1px 1px rgba(17,19,24,.12), 0 24px 48px -16px rgba(17,19,24,.28), 0 48px 80px -28px rgba(17,19,24,.30); }
.phone::before, .phone::after { content: ""; position: absolute; right: -2px; width: 3px; border-radius: 0 2px 2px 0; background: linear-gradient(90deg, #2b2d33, #6c7079); }
.phone::before { top: 21%; height: 7%; } .phone::after { top: 31%; height: 13%; }
.screen { position: relative; aspect-ratio: 1080 / 2400; overflow: hidden; border: 9px solid #050506; border-radius: 31px; background: #0b0c10; }
.screen img { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 22px; opacity: 0; }
`

// The banner: wordmark, the hero headline and the site's pixel Matterhorn, no phone (the demo right below has one).
const banner = (t) => `<!doctype html><style>${css(t)}
.canvas { width: 1280px; height: 320px; --gx: 70%; --mw: 1600px; --mh: 320px; --ml: 230px; }
.hero-ground { -webkit-mask-image: linear-gradient(90deg, transparent, #000 22%); mask-image: linear-gradient(90deg, transparent, #000 22%); }
.brand { position: absolute; left: 80px; top: 64px; display: flex; align-items: center; gap: 12px; font-size: 26px; font-weight: 500; letter-spacing: -0.02em; }
.brand svg { width: 34px; height: 34px; }
h1 { position: absolute; left: 80px; bottom: 64px; font-size: 64px; font-weight: 500; line-height: 1.06; letter-spacing: -0.034em; }
h1 em { display: block; font-style: normal; color: ${t.muted}; }
</style><div class="canvas">${ground(t, 1600, 320, 1.6)}
<div class="brand">${mark(t)}Mobilebox</div>
<h1>Mobile sandboxes <em>for your AI agents.</em></h1></div>`

// The numbers strip: measured or read from the implementation (see the README for where each comes from).
const STATS = [['~18 s', 'to a ready phone'], ['13', 'MCP tools'], ['$0.01', 'per phone-minute'], ['Android 14', 'arm64 phones'], ['Park & resume', 'apps and logins kept']]
// Wide: one row on hairlines. Narrow (phones): two columns, so the labels stay readable when GitHub scales it down.
const stats = (t, narrow) => `<!doctype html><style>${css(t)}
.canvas { display: grid; grid-template-columns: repeat(${narrow ? 2 : STATS.length}, auto); row-gap: 20px; width: max-content; padding: 16px 0; background: transparent; box-shadow: none; border-radius: 0; }
.canvas::before { display: none; }
div > div { display: grid; gap: 4px; padding: 0 22px; text-align: center; white-space: nowrap; }
${narrow ? 'div > div:last-child { grid-column: 1 / -1; }' : `div > div + div { border-left: 1px solid ${t.hairline}; }`}
b { font-size: 28px; font-weight: 500; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
span { color: ${t.muted}; font-size: 15px; letter-spacing: -0.006em; }
</style><div class="canvas">${STATS.map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join('')}</div>`

// The demo: the site's hero loop (agent card + phone), one state per still, frames and timings from recording.json.
const W = 820, H = 660, PW = 270
const demo = (t) => `<!doctype html><style>${css(t)}
.canvas { width: ${W}px; height: ${H}px; --gx: 80%; --mw: 1400px; --mh: 420px; --ml: -300px; }
.phone { right: 48px; top: 50%; width: ${PW}px; transform: translateY(-50%); }
.ripple { position: absolute; width: 52px; height: 52px; margin: -26px 0 0 -26px; border-radius: 50%; box-shadow: 0 0 0 3px ${THEMES.light.accent}, 0 0 0 6px rgba(255,255,255,.85); opacity: 0; }
.card { position: absolute; left: 40px; top: 50%; width: ${W - 40 - 48 - PW - 32}px; transform: translateY(-50%); padding: 22px; border-radius: 16px; background: ${t.card}; box-shadow: 0 0 0 1px ${t.ring}, ${t.shadow}; }
.task { display: grid; gap: 4px; padding-bottom: 16px; border-bottom: 1px solid ${t.hairline}; font-size: 17px; font-weight: 500; line-height: 1.35; letter-spacing: -0.012em; }
.label { color: ${t.muted}; font-size: 14px; font-weight: 400; letter-spacing: -0.006em; }
ol { display: grid; gap: 2px; padding: 12px 0 0; list-style: none; }
li { display: grid; grid-template-columns: 22px 1fr auto; align-items: center; gap: 10px; min-height: 33px; font-size: 15.5px; letter-spacing: -0.01em; }
.ms { color: ${t.muted}; font-size: 14px; font-variant-numeric: tabular-nums; }
.tick { width: 22px; height: 22px; padding: 4px; border-radius: 50%; background: ${t.accent}; color: #fff; }
li:not(.done) .tick { background: transparent; box-shadow: inset 0 0 0 1.5px ${t.field}; color: transparent; transform: scale(.92); }
li:not(.done) .ms { opacity: 0; }
li:not(.done):not(.current) > span { color: ${t.muted}; }
li.current .tick { box-shadow: inset 0 0 0 1.5px ${t.accent}, 0 0 0 4px ${t.glow}; }
.result { margin-top: 12px; padding-top: 12px; border-top: 1px solid ${t.hairline}; }
.total { display: grid; grid-template-columns: 22px 1fr; align-items: center; gap: 10px; font-size: 15.5px; font-weight: 500; }
.total .tick { background: ${t.ink}; color: ${t.ground}; }
.answer { display: grid; gap: 2px; margin-top: 12px; }
q { justify-self: start; border-radius: 6px; font-size: 21px; font-weight: 500; line-height: 1.3; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; quotes: "\\201c" "\\201d"; }
.playing .total .tick { visibility: hidden; } .playing .total .done-text { display: none; }
.finished .progress { display: none; }
.playing .progress { color: ${t.muted}; font-weight: 400; }
.playing q { color: transparent; background: ${t.well}; }
</style><div class="canvas">${ground(t, 1400, 420)}
<div class="card"><p class="task"><span class="label">Task</span>${TASK}</p><ol>${rec.steps.map((s) =>
  `<li>${tick}<span>${s.title}</span><span class="ms">${seconds(s.durationMs)}</span></li>`).join('')}</ol>
<div class="result"><p class="total">${tick}<span class="done-text">Done in ${seconds(total)}</span><span class="progress"></span></p>
<p class="answer"><span class="label">Answer, read from the screen</span><q>${ANSWER}</q></p></div></div>
<div class="phone"><div class="screen">${[...new Set(rec.steps.map((s) => s.frame))].map((f) =>
  `<img data-frame="${f}" src="/static/run/${f.replace('.png', '.webp')}" alt="">`).join('')}<div class="ripple"></div></div></div></div>
<script>
window.show = (s) => {
  const imgs = [...document.querySelectorAll('.screen img')]
  for (const img of imgs) { img.style.opacity = img.dataset.frame === s.frame ? 1 : img.dataset.frame === s.next ? s.mix : 0; img.style.zIndex = img.dataset.frame === s.next ? 2 : 1 }
  document.querySelectorAll('li').forEach((li, i) => { li.classList.toggle('done', i < s.done); li.classList.toggle('current', i === s.current) })
  document.querySelector('.card').className = 'card ' + (s.finished ? 'finished' : 'playing')
  document.querySelector('.progress').textContent = s.finished ? '' : 'Step ' + (s.current + 1) + ' of ${rec.steps.length}'
  const r = document.querySelector('.ripple'), k = r.parentElement.clientWidth / ${rec.screen.width}
  r.style.opacity = s.ripple ? s.ripple.a : 0
  if (s.ripple) { r.style.left = s.ripple.x * k + 'px'; r.style.top = s.ripple.y * k + 'px'; r.style.transform = 'scale(' + s.ripple.s + ')' }
}
</script>`
const tick = '<svg class="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'

// One still per state, each with how long it holds (ms). Playback is shortened; the rows show the recorded times.
// The first still is the end state (every row ticked, the answer read), like the site's hero: it is what a viewer that
// doesn't animate shows, and the loop's last step leads straight back into it.
function timeline() {
  const out = [], push = (s, ms) => out.push([{ ...s }, ms])
  const end = { frame: rec.steps.at(-1).frame, next: null, mix: 0, ripple: null, current: -1, done: rec.steps.length, finished: true }
  push(end, 4500)
  let s = { frame: rec.steps[0].frame, next: null, mix: 0, ripple: null, current: 0, done: 0, finished: false }
  for (const mix of [0.35, 0.7]) push({ ...s, frame: end.frame, next: s.frame, mix }, 90) // fade to the home screen
  push(s, 900)
  rec.steps.forEach((step, i) => {
    s.current = i
    push(s, 350)
    const input = step.input
    if (input?.type === 'tap') for (const [a, sc] of [[1, 0.55], [1, 0.8], [0.8, 1], [0.35, 1.1]]) push({ ...s, ripple: { x: input.x, y: input.y, a, s: sc } }, 70)
    if (input?.type === 'swipe') for (const f of [0, 0.25, 0.5, 0.75, 1]) push({ ...s, ripple: { x: input.from[0], y: input.from[1] + (input.to[1] - input.from[1]) * f, a: f === 1 ? 0.4 : 1, s: 0.8 } }, 80)
    if (step.frame !== s.frame) { for (const mix of [0.35, 0.7]) push({ ...s, next: step.frame, mix }, 80); s.frame = step.frame }
    s.done = i + 1
    push(s, ['open', 'search'].includes(step.id) ? 350 : 750)
  })
  return out
}

const types = { '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' }
const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1280, height: 720 } })
const serve = async (html) => {
  await page.unroute('http://readme.test/**')
  await page.route('http://readme.test/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: html })
    return route.fulfill({ contentType: types[extname(path)], body: readFileSync(join(WEB, path)) })
  })
  await page.goto('http://readme.test/')
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode())) })
}
for (const [name, t] of Object.entries(THEMES)) {
  await serve(banner(t))
  const file = join(OUT, `banner-${name}.png`)
  await page.locator('.canvas').screenshot({ path: file, omitBackground: true })
  console.log(file, statSync(file).size)

  for (const narrow of [false, true]) {
    await serve(stats(t, narrow))
    const strip = join(OUT, `stats-${name}${narrow ? '-narrow' : ''}.png`)
    await page.locator('.canvas').screenshot({ path: strip, omitBackground: true })
    console.log(strip, statSync(strip).size)
  }

  if (process.argv.includes('--no-demo')) continue
  await serve(demo(t))
  const dir = mkdtempSync(join(tmpdir(), 'readme-demo-')), list = []
  for (const [n, [state, ms]] of timeline().entries()) {
    await page.evaluate((s) => window.show(s), state)
    const still = join(dir, `${String(n).padStart(3, '0')}.png`)
    await page.locator('.canvas').screenshot({ path: still, omitBackground: true })
    list.push(`file '${still}'`, `duration ${ms / 1000}`)
  }
  list.push(list.at(-2)) // the concat demuxer drops the last duration unless the last file repeats
  writeFileSync(join(dir, 'list.txt'), list.join('\n'))
  const webp = join(OUT, `demo-${name}.webp`)
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt'),
    '-vf', 'format=yuva420p', '-fps_mode', 'passthrough', '-c:v', 'libwebp_anim', '-lossless', '0', '-quality', '82', '-compression_level', '6', '-loop', '0', webp])
  console.log(webp, statSync(webp).size)
}
await browser.close()
