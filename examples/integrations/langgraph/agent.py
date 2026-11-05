# LangGraph + Mobilebox: a LangGraph agent drives a cloud Android phone over MCP.
#   pip install langgraph langchain langchain-mcp-adapters langchain-openai
#   MOBILESANDBOX_API_KEY=... OPENAI_API_KEY=... python agent.py
import asyncio, json, os, urllib.request

from langchain.agents import create_agent
from langchain_mcp_adapters.client import MultiServerMCPClient

API = "https://mobilebox.dev"
AUTH = {"Authorization": f"Bearer {os.environ['MOBILESANDBOX_API_KEY']}"}
MODEL = os.environ.get("MODEL", "openai:gpt-5.4-mini")  # any LangChain chat model


def phones(method, path=""):  # your code owns the phone: create it, and always delete it
    req = urllib.request.Request(f"{API}/v1/phones{path}", method=method, headers=AUTH)
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read() or "null")


async def main():
    phone = phones("POST", "?wait=ready")["id"]
    try:
        client = MultiServerMCPClient({"mobilebox": {"transport": "streamable_http", "url": f"{API}/mcp", "headers": AUTH}})
        agent = create_agent(  # a compiled LangGraph graph: use it alone or as a node in yours
            MODEL,
            tools=await client.get_tools(),
            system_prompt=f"You operate the Android phone {phone} with the Mobilebox tools. "
            "Observe, act, and check each result on the returned screen. Don't create or delete phones.",
        )
        state = await agent.ainvoke({"messages": [("user", "Open Settings > Display and tell me the brightness level.")]})
        print(state["messages"][-1].content)
    finally:
        phones("DELETE", f"/{phone}")


asyncio.run(main())
