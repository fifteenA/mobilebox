// Mastra + Mobilebox: a Mastra agent drives a cloud Android phone over MCP.
//   npm i @mastra/core @mastra/mcp
//   MOBILESANDBOX_API_KEY=... OPENAI_API_KEY=... node agent.ts
import { Agent } from '@mastra/core/agent'
import { MCPClient } from '@mastra/mcp'

const API = 'https://mobilebox.dev'
const AUTH = { Authorization: `Bearer ${process.env.MOBILESANDBOX_API_KEY}` }

async function phones(method: string, path = '') { // your code owns the phone: create it, and always delete it
  const res = await fetch(`${API}/v1/phones${path}`, { method, headers: AUTH })
  if (!res.ok) throw new Error(`${method} /v1/phones${path}: ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

const phone = (await phones('POST', '?wait=ready')).id
const mcp = new MCPClient({ servers: { mobilebox: { url: new URL(`${API}/mcp`), requestInit: { headers: AUTH } } } })
try {
  const agent = new Agent({
    id: 'phone-operator',
    name: 'Phone operator',
    instructions: `You operate the Android phone ${phone} with the Mobilebox tools. ` +
      'Observe, act, and check each result on the returned screen. Don\'t create or delete phones.',
    model: process.env.MODEL ?? 'openai/gpt-5.4-mini', // any Mastra model id
    tools: await mcp.listTools(),
  })
  const result = await agent.generate('Open Settings > Display and tell me the brightness level.', { maxSteps: 20 })
  console.log(result.text)
} finally {
  await mcp.disconnect()
  await phones('DELETE', `/${phone}`)
}
