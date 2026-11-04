# Claude Code: test the APK you just built

Claude Code builds your app, puts it on a cloud phone, opens it, checks the first screen and deletes the phone. No local emulator.

**1. Connect once** (from a shell where `MOBILESANDBOX_API_KEY` is set):

```bash
claude mcp add --transport http mobilebox https://mobilebox.dev/mcp \
  --header "Authorization: Bearer $MOBILESANDBOX_API_KEY"
```

Start Claude Code from that same shell, so its Bash tool also sees the key for the upload in step 2.

**2. Ask** (replace the package, label and APK path with yours):

> Use Mobilebox to test my debug build.
> 1. Run `./gradlew assembleDebug`.
> 2. Create a phone named `apk-check` with `idle_timeout` 300.
> 3. Upload the APK over REST (MCP `install_app` only takes a public URL):
>    `curl --fail-with-body -X POST "https://mobilebox.dev/v1/phones/PHONE_ID/apps?grant_permissions=true" -H "Authorization: Bearer $MOBILESANDBOX_API_KEY" -H 'Content-Type: application/octet-stream' --data-binary @app/build/outputs/apk/debug/app-debug.apk`
> 4. Open `com.example.app`. If a permission or onboarding dialog appears, answer it like a new user would.
> 5. Check that the text "Welcome" is visible. Report every screen you saw and whether the check passed.
> 6. Delete the phone at the end, even if a step fails.

The build must be arm64-v8a or universal (an app without native code is universal). An x86-only build fails with `unsupported_abi`.

If your APK is already at a public direct-download URL (a release asset, a public bucket), skip the upload and say "install it from URL"; Claude then uses `install_app` alone.

## What Claude calls

[replay.sh](replay.sh) sends the same calls by hand, so you can check your key, build, package and label without Claude. It exits 1 if an action fails or the label never appears, and deletes the phone either way:

```bash
./replay.sh app/build/outputs/apk/debug/app-debug.apk com.example.app Welcome
```

Recorded against production with [Editor 1.98 from F-Droid](https://f-droid.org/packages/org.billthefarmer.editor/) standing in for a fresh build; timings in [RUNS.md](../RUNS.md):

```text
ph_p6vstm657aw4 "apk-check" ready
{"package":"org.billthefarmer.editor","version_code":198,"version_name":"1.98"}
1. open_app ok
2. wait_for ok

app: org.billthefarmer.editor
[1] Text "Access all files" (540,923)
[2] Text "In order to have access to the Documents and other folders Editor must use ..." (540,1155)
[3] Button "CANCEL" (501,1413)
[4] Button "ACCESS ALL FILES" (790,1413)
PASS: "Access all files" is on screen
ph_p6vstm657aw4 deleted
```

The app opened on a file-access dialog, so the replay checks for its label. Given the prompt above, Claude reads that screen, taps `CANCEL` or `ACCESS ALL FILES` like a user would, and checks the next screen. That decision is Claude's; the replay only proves the phone side.

## What this can and cannot test

Can: install APKs and arm64 split bundles, drive the UI by text, resource id or coordinates, take screenshots, set locale, timezone, GPS and a SOCKS5 proxy, park the phone to keep a logged-in state for the next run.

Cannot: ADB, logcat, a shell, instrumented (Espresso) tests, Google Play services, SMS, iOS, physical-device behaviour. For those, use a local emulator.
