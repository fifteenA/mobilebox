# Framework integrations

One runnable file per agent framework. Each one creates a Mobilebox phone, gives the agent the Mobilebox MCP tools (browser-use: two REST actions), asks for one task on the phone, prints the answer and deletes the phone, also when the run fails.

| Framework | File | Install | Connects over |
|---|---|---|---|
| OpenAI Agents SDK | [openai-agents/agent.py](openai-agents/agent.py) | `pip install openai-agents` | MCP, `MCPServerStreamableHttp` |
| LangGraph | [langgraph/agent.py](langgraph/agent.py) | `pip install langgraph langchain langchain-mcp-adapters langchain-openai` | MCP, `MultiServerMCPClient` |
| CrewAI | [crewai/agent.py](crewai/agent.py) | `pip install crewai "crewai-tools[mcp]"` | MCP, `MCPServerHTTP` |
| browser-use | [browser-use/agent.py](browser-use/agent.py) | `pip install browser-use && uvx browser-use install` | REST, two custom actions |
| Mastra | [mastra/agent.ts](mastra/agent.ts) | `npm i @mastra/core @mastra/mcp` | MCP, `MCPClient` |
| Vercel AI SDK | [vercel-ai-sdk/agent.ts](vercel-ai-sdk/agent.ts) | `npm i ai @ai-sdk/mcp @ai-sdk/openai` | MCP, `createMCPClient` |
| Claude Agent SDK | [claude-agent-sdk/agent.ts](claude-agent-sdk/agent.ts) | `npm i @anthropic-ai/claude-agent-sdk` | MCP, `mcpServers` |

Run one:

```bash
export MOBILESANDBOX_API_KEY=...   # from https://mobilebox.dev/dashboard
export OPENAI_API_KEY=...          # or ANTHROPIC_API_KEY for the Claude Agent SDK
python openai-agents/agent.py      # Node 24 runs the .ts files directly: node mastra/agent.ts
```

`MODEL` picks another model where the framework takes a model id (LangGraph `provider:model`, CrewAI and Mastra `provider/model`). The OpenAI SDKs also read `OPENAI_BASE_URL`, so any OpenAI-compatible endpoint works.

**The pattern.** Your code owns the phone's lifecycle: it creates the phone over REST, passes the id to the agent and deletes the phone in `finally`. The agent only drives it: `observe`, `act`, `screenshot`, `install_app`. One phone per task keeps runs independent and the bill bounded. Guides for each framework: https://mobilebox.dev/integrations
