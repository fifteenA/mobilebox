# GitHub Actions: APK smoke test

Upload the build to a fresh cloud phone, open it, wait for one label that proves launch, delete the phone. No emulator on the runner.

1. Copy [smoke.mjs](smoke.mjs) to your repo root and [android-smoke.yml](android-smoke.yml) to `.github/workflows/`.
2. Add the repository secret `MOBILESANDBOX_API_KEY`.
3. Set `APK_FILE`, `EXPECTED_PACKAGE` and `EXPECTED_LABEL` in the workflow. The APK path is the Gradle default for a module named `app` without flavors; adjust it for yours. Use a build that runs on its own: a React Native debug APK waits for a Metro server the phone can't reach.

Try it locally first, so a key problem doesn't look like an app problem:

```bash
MOBILESANDBOX_API_KEY=... APK_FILE=app-debug.apk EXPECTED_PACKAGE=com.example.app EXPECTED_LABEL=Welcome \
  node smoke.mjs
```

`smoke.mjs` exits non-zero on a wrong package, a failed action or a failed cleanup. It deletes the phone on success, on failure and when the job is cancelled (SIGINT/SIGTERM), and retries a lost create with the same `Idempotency-Key`, so it never makes a second phone. Only a hard kill skips cleanup; `idle_timeout` (120 s) then parks the phone, which still counts toward your 10 kept phones. A run costs about $0.01: one phone, one-minute minimum.

| Output | Next step |
|---|---|
| `unsupported_abi` | Build an arm64-v8a or universal variant |
| `Installed X, expected Y` | Fix `APK_FILE` or the build variant |
| `wait_timeout` + screen text | Read the printed screen: a dialog, a crash, a splash screen or another language |
| `Cleanup failed` | Delete the phone from the dashboard |

The printed screen lands in the CI log, so keep real accounts off the first screen.

This repository runs the same script on every push to `main` against a public F-Droid APK when the `MOBILESANDBOX_API_KEY` secret is set ([ci.yml](../../.github/workflows/ci.yml), job `smoke`). A pass proves one arm64 build installed on Android 14, launched and showed one label; nothing about later screens.
