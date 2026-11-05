// Vercel AI SDK + Mobilebox: generateText drives a cloud Android phone with the Mobilebox MCP tools.
//   npm i ai @ai-sdk/mcp @ai-sdk/openai
//   MOBILESANDBOX_API_KEY=... OPENAI_API_KEY=... node agent.ts
import { generateText, stepCountIs } from 'ai'
import { createMCPClient } from '@ai-sdk/mcp'
import { openai } from '@ai-sdk/openai'

const API = 'https://mobilebox.dev'
const AUTH = { Authorization: `Bearer ${process.env.MOBILESANDBOX_API_KEY}` }

async function phones(method: string, path = '') { // your code owns the phone: create it, and always delete it
  const res = await fetch(`${API}/v1/phones${path}`, { method, headers: AUTH })
  if (!res.ok) throw new Error(`${method} /v1/phones${path}: ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

const phone = (await phones('POST', '?wait=ready')).id
const mcp = await createMCPClient({ transport: { type: 'http', url: `${API}/mcp`, headers: AUTH } })
try {
  const { text } = await generateText({
    model: openai.chat(process.env.MODEL ?? 'gpt-5.4-mini'), // or any AI SDK provider
    tools: await mcp.tools(),
    stopWhen: stepCountIs(20),
    system: `You operate the Android phone ${phone} with the Mobilebox tools. ` +
      'Observe, act, and check each result on the returned screen. Don\'t create or delete phones.',
    prompt: 'Open Settings > Display and tell me the brightness level.',
  })
  console.log(text)
} finally {
  await mcp.close()
  await phones('DELETE', `/${phone}`)
}
