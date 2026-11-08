# Benchmarks

The scripts and raw data behind [mobilebox.dev/benchmarks](https://mobilebox.dev/benchmarks): how fast cloud Android phones for agents start, react and install an app, measured the same way for every service.

## What each run does

1. **Cold start**: clock starts before the create request, stops when the first screenshot's bytes arrive.
2. **Tap to screenshot**: 10 taps at two fixed home-screen points, each followed by a full screenshot.
3. **Install**: [Fossify Calculator 1.4.0](https://f-droid.org/packages/org.fossify.math/) (`org.fossify.math`, ~4 MB): from its F-Droid URL where the API takes a URL, uploaded over ADB where it doesn't.
4. **Park and resume** (where the service has it): park, start again, screenshot, check the app is still installed.
5. **Cleanup**: every phone deleted in `finally`; failures are written to the CSV, never dropped.

Medians and p90 use the nearest rank. No outliers are removed.

## Run

Node 24. `npm install` here pulls only the Limrun SDK.

```bash
npm install
MOBILESANDBOX_API_KEY=... CLIENT="Berlin, home fibre" node mobilebox.mjs
LIM_API_KEY=... CLIENT="..." node limrun.mjs
PHONE_HARNESS_API_KEY=... ADB=$(which adb) CLIENT="..." node phoneharness.mjs
ACCEL=on ./emulator.sh       # needs ANDROID_HOME; ACCEL=off for software emulation
node summarize.mjs           # results/*.csv → results/summary.csv
node chart.mjs               # results/summary.csv → results/cold-start.svg (+ -narrow.svg)
```

`RUNS` (default 5) and `TAPS` (default 10) change the counts. `CLIENT` labels where the script ran; network distance is part of every number.

The [benchmarks workflow](../.github/workflows/benchmarks.yml) runs the emulator with and without KVM and Mobilebox from the same `ubuntu-latest` runner.

## Results, 2026-11-08

| File | What |
|---|---|
| `results/summary.csv` | n, failures, median and p90 per service, client and metric |
| `results/mobilebox.csv`, `limrun.csv`, `phoneharness.csv` | one row per measurement, client in Nuremberg, Germany |
| `results/emulator-on.csv`, `emulator-off.csv`, `mobilebox-ci.csv` | the GitHub Actions run ([42517634798](https://github.com/fifteenA/mobilebox/actions/runs/42517634798)), rebuilt from its job log because that run wrote its CSVs to the wrong folder (fixed since); timestamps are log times |
| `results/excluded-mobilebox-deploy-overlap.csv` | an earlier Mobilebox batch that overlapped a production deploy (3 of 10 runs failed with 502) and used APK upload instead of URL install. Kept for the record, left out of the summary |
| `results/cold-start.svg`, `cold-start-narrow.svg` | the chart on the page, desktop and phone widths |

Vendor terms were read before measuring. BrowserStack, Genymotion SaaS and LambdaTest restrict publishing performance results or use by competitors, so there are no scripts for them.
