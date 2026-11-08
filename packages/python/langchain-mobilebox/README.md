# langchain-mobilebox

**LangChain tools for [Mobilebox](https://mobilebox.dev): cloud Android phones your agent creates, reads, taps and types on.** Works with any LangChain or LangGraph agent and any tool-calling model. Built on the [`mobilebox`](https://pypi.org/project/mobilebox/) client.

```bash
pip install langchain-mobilebox
export MOBILESANDBOX_API_KEY=...   # from https://mobilebox.dev/dashboard; never in a prompt or a commit
```

```python
from langchain.agents import create_agent
from langchain_mobilebox import MobileboxToolkit

agent = create_agent(
    "openai:gpt-5.4-mini",  # any tool-calling chat model
    tools=MobileboxToolkit().get_tools(),
    system_prompt="Use the Mobilebox phone tools. Delete every phone you create when you are done, also on failure.",
)
state = agent.invoke({"messages": [("user", "Create a phone, open Settings and tell me which Android version it runs.")]})
print(state["messages"][-1].content)
```

## Tools

| Tool | Class | Does |
|---|---|---|
| `mobilebox_create_phone` | `MobileboxCreatePhone` | Create a phone, wait until ready, return its id and first screen |
| `mobilebox_observe` | `MobileboxObserve` | The screen as numbered elements: `[ref] Type "text" — secondary [state] (x,y)` |
| `mobilebox_act` | `MobileboxAct` | Run 1–20 actions (tap, type, swipe, scroll_to, open_app, wait_for…), return results and the new screen |
| `mobilebox_screenshot` | `MobileboxScreenshot` | A PNG image block, for what the element list cannot show |
| `mobilebox_install_app` | `MobileboxInstallApp` | Install an APK, `.apks` or `.xapk` from a public URL |
| `mobilebox_park_phone` | `MobileboxParkPhone` | Shut down and stop billing, keeping apps and logins |
| `mobilebox_delete_phone` | `MobileboxDeletePhone` | Delete the phone and everything on it |

API errors don't crash the run: the tool returns an error message with the `code` and `next` step, and the model recovers from it. A failed action inside `mobilebox_act` is reported with its reason next to the current screen.

## Let your code own the phone

For a bounded bill and independent runs, create the phone yourself, give the agent only the tools that drive it, and delete the phone in `finally`:

```python
from mobilebox import Mobilebox
from langchain_mobilebox import MobileboxAct, MobileboxObserve, MobileboxScreenshot

mb = Mobilebox()
phone = mb.create_phone(idle_timeout=120, max_duration=600)
try:
    tools = [cls(client=mb) for cls in (MobileboxObserve, MobileboxAct, MobileboxScreenshot)]
    agent = create_agent("openai:gpt-5.4-mini", tools=tools,
                         system_prompt=f"You operate the Android phone {phone.id}. Observe, act, and check each result.")
    agent.invoke({"messages": [("user", "Open Settings > Display and tell me the brightness level.")]})
finally:
    mb.delete_phone(phone.id)
```

A cloud phone costs $0.01 per minute while ready, billed per second; parked phones are free. New accounts start with $2 of credit. Prefer MCP? Any LangChain agent can load the same tools from `https://mobilebox.dev/mcp` with `langchain-mcp-adapters` ([example](https://github.com/fifteenA/mobilebox/blob/main/examples/integrations/langgraph/agent.py)).

## Development

```bash
pip install -e ../mobilebox -e . pytest pytest-asyncio langchain-tests==1.1.9
pytest                                          # offline: LangChain standard tests + each tool
MOBILEBOX_LIVE=1 MOBILESANDBOX_API_KEY=... pytest tests/integration_tests   # one real phone, deleted at the end
```

MIT © fifteenA, Inc.
