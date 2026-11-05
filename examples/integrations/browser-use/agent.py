# browser-use + Mobilebox: one agent with a browser and a cloud Android phone (two custom actions over REST).
#   pip install browser-use && uvx browser-use install
#   MOBILESANDBOX_API_KEY=... OPENAI_API_KEY=... python agent.py
import asyncio, json, os, urllib.error, urllib.request

from browser_use import Agent, ChatOpenAI, Tools

API = "https://mobilebox.dev/v1/phones"
AUTH = {"Authorization": f"Bearer {os.environ['MOBILESANDBOX_API_KEY']}", "Content-Type": "application/json"}


def phones(method, path="", body=None):
    req = urllib.request.Request(API + path, method=method, headers=AUTH, data=body and json.dumps(body).encode())
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read() or "null")


phone = phones("POST", "?wait=ready")["id"]  # your code owns the phone: create it, and always delete it
tools = Tools()


@tools.action('Read the phone screen as numbered elements: [ref] Type "text" (x,y)')
def phone_screen() -> str:
    return phones("GET", f"/{phone}/observe")["text"]


@tools.action('Run phone actions, a JSON list such as [{"type":"open_app","package":"com.android.settings"},'
              '{"type":"tap","target":{"text":"Display"}}]. Returns each result and the new screen.')
def phone_act(actions: str) -> str:
    try:
        done = phones("POST", f"/{phone}/actions", {"actions": json.loads(actions)})
    except urllib.error.HTTPError as error:
        return error.read().decode()  # code, message and next: what to do instead
    return json.dumps(done["results"]) + "\n" + done["screen"]["text"]


async def main():
    try:
        task = ("You have a cloud Android phone: drive it with phone_screen and phone_act. On it, open Settings > About phone "
                "and read the Android version. Then find that version's release date on en.wikipedia.org.")
        agent = Agent(task=task, llm=ChatOpenAI(model=os.environ.get("MODEL", "gpt-5.4-mini")), tools=tools)
        print((await agent.run(max_steps=25)).final_result())
    finally:
        phones("DELETE", f"/{phone}")


asyncio.run(main())
