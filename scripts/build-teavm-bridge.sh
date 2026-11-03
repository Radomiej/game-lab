#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
JAVA_HOME_DIR="${JAVA_HOME:?Set JAVA_HOME to a JDK 25 installation}"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

curl -fsSL \
  https://repo.maven.apache.org/maven2/org/teavm/teavm-jso/0.16.0/teavm-jso-0.16.0.jar \
  -o "$WORK_DIR/teavm-jso.jar"
"$JAVA_HOME_DIR/bin/javac" --release 8 -Xlint:-options \
  -cp "$WORK_DIR/teavm-jso.jar" \
  -d "$WORK_DIR/classes" \
  "$ROOT_DIR/src/engine/java/Lab.java"
mkdir -p "$ROOT_DIR/public/vendor/teavm/bridge"
cp "$WORK_DIR/classes/engine/Lab.class" "$ROOT_DIR/public/vendor/teavm/bridge/Lab.class"
