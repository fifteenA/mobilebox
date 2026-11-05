# CrewAI + Mobilebox: a crew agent drives a cloud Android phone over MCP.
#   pip install crewai "crewai-tools[mcp]"
#   MOBILESANDBOX_API_KEY=... OPENAI_API_KEY=... python agent.py
import json, os, urllib.request

from crewai import Agent, Crew, Task
from crewai.mcp import MCPServerHTTP

API = "https://mobilebox.dev"
AUTH = {"Authorization": f"Bearer {os.environ['MOBILESANDBOX_API_KEY']}"}


def phones(method, path=""):  # your code owns the phone: create it, and always delete it
    req = urllib.request.Request(f"{API}/v1/phones{path}", method=method, headers=AUTH)
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read() or "null")


phone = phones("POST", "?wait=ready")["id"]
try:
    operator = Agent(
        role="Android phone operator",
        goal=f"Complete tasks on the Android phone {phone} and report what the screen shows",
        backstory="You use the Mobilebox tools: observe, act, and check each result on the returned screen. "
        "You never create or delete phones.",
        llm=os.environ.get("MODEL", "gpt-5.4-mini"),
        mcps=[MCPServerHTTP(url=f"{API}/mcp", headers=AUTH)],
    )
    task = Task(
        description="Open Settings > Display and find the brightness level.",
        expected_output="The brightness level, as shown on the phone",
        agent=operator,
    )
    print(Crew(agents=[operator], tasks=[task]).kickoff())
finally:
    phones("DELETE", f"/{phone}")
