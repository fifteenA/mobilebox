# OpenAI Agents SDK + Mobilebox: an agent drives a cloud Android phone over MCP.
#   pip install openai-agents
#   MOBILESANDBOX_API_KEY=... OPENAI_API_KEY=... python agent.py
import asyncio, json, os, urllib.request

from agents import Agent, Runner
from agents.mcp import MCPServerStreamableHttp

API = "https://mobilebox.dev"
AUTH = {"Authorization": f"Bearer {os.environ['MOBILESANDBOX_API_KEY']}"}


def phones(method, path=""):  # your code owns the phone: create it, and always delete it
    req = urllib.request.Request(f"{API}/v1/phones{path}", method=method, headers=AUTH)
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read() or "null")


async def main():
    phone = phones("POST", "?wait=ready")["id"]
    try:
        async with MCPServerStreamableHttp(name="mobilebox", params={"url": f"{API}/mcp", "headers": AUTH, "timeout": 60}) as mobilebox:
            agent = Agent(
                name="Phone operator",
                instructions=f"You operate the Android phone {phone} with the Mobilebox tools. "
                "Observe, act, and check each result on the returned screen. Don't create or delete phones.",
                mcp_servers=[mobilebox],
            )
            result = await Runner.run(agent, "Open Settings > Display and tell me the brightness level.", max_turns=20)
            print(result.final_output)
    finally:
        phones("DELETE", f"/{phone}")


asyncio.run(main())
