#!/usr/bin/env bash
# Local Android emulator baseline on a CI runner: cold boot → first screenshot, tap → screenshot, APK install.
#   ACCEL=on|off RUNS=5 CLIENT="GitHub Actions ubuntu-latest" benchmarks/emulator.sh
# ACCEL=on needs /dev/kvm (the workflow adds the udev rule); ACCEL=off is pure software emulation.
set -uo pipefail
OUT=$(realpath -m "${OUT:-$(dirname "$0")/results/samples.csv}") # before the cd, so a relative OUT means the caller's directory
cd "$(dirname "$0")"
ACCEL=${ACCEL:-on} RUNS=${RUNS:-5} TAPS=${TAPS:-10} BOOT_LIMIT=${BOOT_LIMIT:-900}
IMAGE=${IMAGE:-"system-images;android-34;google_apis;x86_64"}
CLIENT=${CLIENT:-unknown client}
P="Local emulator, KVM $ACCEL" REGION=${REGION:-runner}
SDK=${ANDROID_HOME:?set ANDROID_HOME}
export PATH="$SDK/cmdline-tools/latest/bin:$SDK/emulator:$SDK/platform-tools:$PATH"
export ANDROID_AVD_HOME=${ANDROID_AVD_HOME:-$HOME/.android/avd} # avdmanager and emulator must agree on it
mkdir -p "$ANDROID_AVD_HOME"
mkdir -p results "$(dirname "$OUT")"
[ -f "$OUT" ] || echo 'date,provider,region,client,metric,run,ms,note' > "$OUT"
ms() { echo $(( $(date +%s%N) / 1000000 )); }
record() { # metric run ms [note]
  local note=${4:-}
  printf '%s,%s,%s,"%s",%s,%s,%s,"%s"\n' "$(date -u +%FT%TZ)" "$P" "$REGION" "$CLIENT" "$1" "$2" "$3" "${note//\"/\'}" >> "$OUT"
  echo "$P run $2 $1: ${3:-FAILED} ms $note"
}

ls -l /dev/kvm 2>&1 || true
APK=results/org.fossify.math_10.apk
[ -f "$APK" ] || curl -fsSL -o "$APK" https://f-droid.org/repo/org.fossify.math_10.apk

# One-time setup a CI job pays on every cold cache: image download + AVD creation.
t=$(ms)
yes | sdkmanager --licenses > /dev/null
sdkmanager --install emulator platform-tools "$IMAGE" > /dev/null
echo no | avdmanager create avd -n bench -k "$IMAGE" -d pixel_6 --force
emulator -list-avds | grep -qx bench || { echo "AVD not created" >&2; exit 1; }
record setup_image_and_avd 0 $(( $(ms) - t )) "$IMAGE"

for run in $(seq 1 "$RUNS"); do
  adb kill-server > /dev/null 2>&1; adb start-server > /dev/null 2>&1
  t0=$(ms)
  emulator -avd bench -no-window -no-audio -no-boot-anim -no-snapshot -wipe-data -gpu swiftshader_indirect -accel "$ACCEL" > results/emulator-$ACCEL-$run.log 2>&1 &
  pid=$!
  booted=
  while [ $(( ($(ms) - t0) / 1000 )) -lt "$BOOT_LIMIT" ] && kill -0 $pid 2>/dev/null; do
    [ "$(timeout 10 adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ] && { booted=1; break; }
    sleep 2
  done
  if [ -z "$booted" ]; then
    why=$(kill -0 $pid 2>/dev/null && echo "not booted after ${BOOT_LIMIT}s" || grep -m1 -iE 'error|fatal|requires' results/emulator-$ACCEL-$run.log)
    record error "$run" '' "$why"
    kill $pid 2>/dev/null; wait $pid 2>/dev/null
    [ "$ACCEL" = off ] && break # a software boot that fails once fails the same way; don't burn 5 × the limit
    continue
  fi
  record ready "$run" $(( $(ms) - t0 ))
  adb exec-out screencap -p > /dev/null
  record cold_start_to_screenshot "$run" $(( $(ms) - t0 ))
  for i in $(seq 1 "$TAPS"); do
    t=$(ms); adb shell input tap $(( i % 2 ? 300 : 780 )) 1200; tapped=$(ms)
    adb exec-out screencap -p > /dev/null
    record tap "$run.$i" $(( tapped - t )); record tap_to_screenshot "$run.$i" $(( $(ms) - t ))
  done
  t=$(ms)
  adb install -r "$APK" > /dev/null && record apk_install "$run" $(( $(ms) - t )) || record apk_install "$run" '' 'adb install failed'
  adb emu kill > /dev/null 2>&1; wait $pid 2>/dev/null
done
