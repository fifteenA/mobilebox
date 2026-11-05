// Claude Agent SDK + Mobilebox: Claude drives a cloud Android phone with the Mobilebox MCP tools.
//   npm i @anthropic-ai/claude-agent-sdk
//   MOBILESANDBOX_API_KEY=... ANTHROPIC_API_KEY=... node agent.ts
import { query } from '@anthropic-ai/claude-agent-sdk'

const API = 'https://mobilebox.dev'
const AUTH = { Authorization: `Bearer ${process.env.MOBILESANDBOX_API_KEY}` }

async function phones(method: string, path = '') { // your code owns the phone: create it, and always delete it
  const res = await fetch(`${API}/v1/phones${path}`, { method, headers: AUTH })
  if (!res.ok) throw new Error(`${method} /v1/phones${path}: ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

const phone = (await phones('POST', '?wait=ready')).id
try {
  for await (const message of query({
    prompt: 'Open Settings > Display and tell me the brightness level.',
    options: {
      systemPrompt: `You operate the Android phone ${phone} with the Mobilebox tools. ` +
        'Observe, act, and check each result on the returned screen. Don\'t create or delete phones.',
      mcpServers: { mobilebox: { type: 'http', url: `${API}/mcp`, headers: AUTH } },
      tools: [], // no built-in file or shell tools: only the phone
      allowedTools: ['mcp__mobilebox'], // every Mobilebox tool, without a permission prompt
      maxTurns: 20,
    },
  })) {
    if (message.type === 'result') console.log(message.subtype === 'success' ? message.result : message.subtype)
  }
} finally {
  await phones('DELETE', `/${phone}`)
}
