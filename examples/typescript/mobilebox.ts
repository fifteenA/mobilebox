// Minimal Mobilebox REST client. Node 24 runs this file directly; no dependencies.
//
//   export MOBILESANDBOX_API_KEY=...   # from https://mobilebox.dev/dashboard
//   node mobilebox.ts
//
// Creates a phone, opens Settings > Display, reads the brightness level, deletes the phone.
import { setTimeout as sleep } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

export type Phone = { id: string; status: string; name: string; failure: unknown }
export type Element = { ref: number; type: string; text?: string; summary?: string }
export type Screen = { app: string; elements: Element[]; text: string }
export type Action = { type: string; [field: string]: unknown }
type ActionResult = { type: string; ok: boolean; error?: { code: string; message: string; next: string } }

export class MobileboxError extends Error {
  retryable: boolean
  constructor(message: string, retryable = false) {
    super(message)
    this.retryable = retryable
  }
}

export class Mobilebox {
  key: string
  base: string

  constructor(key = process.env.MOBILESANDBOX_API_KEY, base = process.env.MOBILESANDBOX_URL ?? 'https://mobilebox.dev') {
    if (!key) throw new Error('Set MOBILESANDBOX_API_KEY')
    this.key = key
    this.base = base.replace(/\/$/, '')
  }

  async call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    let response: Response
    try {
      response = await fetch(this.base + path, {
        method,
        headers: {
          Authorization: `Bearer ${this.key}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(65_000),
      })
    } catch (error) {
      throw new MobileboxError(`${method} ${path} -> ${(error as Error).message}`, true) // network or timeout
    }
    const text = await response.text()
    // Every error body has error.code, error.message and error.next (what to do instead).
    if (!response.ok) throw new MobileboxError(`${method} ${path} -> ${response.status} ${text}`, response.status >= 500)
    return (text ? JSON.parse(text) : null) as T
  }

  /** Returns the phone, possibly still "creating": pass it to waitReady(). */
  async create(options: Record<string, unknown> = {}, idempotencyKey: string = crypto.randomUUID()): Promise<Phone> {
    // Retrying with the same idempotency key returns the same phone, so a lost response cannot leak a second one.
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.call('POST', '/v1/phones?wait=ready&timeout=50', options, { 'Idempotency-Key': idempotencyKey })
      } catch (error) {
        if (attempt === 3 || !(error instanceof MobileboxError && error.retryable)) throw error
        await sleep(3000)
      }
    }
  }

  async waitReady(phone: Phone, deadlineMs = 180_000): Promise<Phone> {
    const deadline = Date.now() + deadlineMs
    while (phone.status === 'creating' || phone.status === 'starting') {
      if (Date.now() > deadline) throw new Error(`${phone.id} not ready after ${deadlineMs} ms`)
      phone = await this.call('GET', `/v1/phones/${phone.id}?wait=ready&timeout=50`)
    }
    if (phone.status !== 'ready') throw new Error(JSON.stringify(phone))
    return phone
  }

  observe(id: string): Promise<Screen> {
    return this.call('GET', `/v1/phones/${id}/observe`)
  }

  /** Runs 1–20 actions. Throws on the first failed action; returns the new screen. */
  async act(id: string, actions: Action[]): Promise<Screen> {
    const result = await this.call<{ results: ActionResult[]; screen: Screen }>('POST', `/v1/phones/${id}/actions`, { actions })
    const failed = result.results.find(item => !item.ok) // HTTP 200 can still carry a failed action
    if (failed) throw new Error(`${JSON.stringify(failed.error)}\n${result.screen.text}`)
    return result.screen
  }

  park(id: string): Promise<Phone> {
    return this.call('POST', `/v1/phones/${id}/park`)
  }

  async delete(id: string): Promise<void> {
    await this.call('DELETE', `/v1/phones/${id}`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mb = new Mobilebox()
  const phone = await mb.create({ name: 'typescript-example', idle_timeout: 120, max_duration: 300 })
  for (const signal of ['SIGINT', 'SIGTERM']) { // Ctrl-C or a cancelled job: delete before exiting
    process.once(signal, () => mb.delete(phone.id).finally(() => process.exit(130)))
  }
  try {
    await mb.waitReady(phone)
    console.log('ready:', phone.id)
    const screen = await mb.act(phone.id, [
      { type: 'open_app', package: 'com.android.settings' },
      { type: 'scroll_to', text: 'Display' },
      { type: 'tap', target: { text: 'Display' } },
      { type: 'wait_for', text: 'Brightness level' },
    ])
    console.log(screen.text)
    const row = screen.elements.find(e => e.text === 'Brightness level')
    if (!row) throw new Error("Expected a 'Brightness level' row on the Display screen")
    console.log('ok: brightness level is', row.summary)
  } finally {
    await mb.delete(phone.id) // always clean up; park() instead keeps apps and data
    console.log('deleted:', phone.id)
  }
}
