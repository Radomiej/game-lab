import assert from "node:assert/strict";
import { test } from "node:test";
import { strFromU8, unzipSync } from "fflate";
import { bytesToHex } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import { buildOrbitPackage } from "../src/orbit-export.ts";

test("exports a hashed Orbit v0 package from the supported Game Lab LRP subset", () => {
  const packageBytes = buildOrbitPackage(
    { "main.js": "function init() {}\nfunction update(dt) {}", "assets/palette.json": "{}" },
    "main.js",
    { id: "com.orbit.test", version: "0.1.0", name: "Test game" },
  );
  const archive = unzipSync(packageBytes);
  const manifest = JSON.parse(strFromU8(archive["orbit.json"]));
  assert.equal(manifest.format, "orbit-game");
  assert.equal(manifest.runtime, "quickjs-lrp");
  assert.equal(manifest.apiVersion, "game-lab-lrp/1");
  assert.equal(manifest.entrypoint, "main.js");
  assert.equal(manifest.files.length, 2);
  const source = archive["main.js"];
  assert.equal(manifest.files.find(file => file.path === "main.js").sha256, bytesToHex(sha256(source)));
  assert.equal(manifest.signature, null);
});

test("rejects incompatible runtimes, Game Lab engine-only calls, and binary assets", () => {
  assert.throws(() => buildOrbitPackage({ "main.lua": "print('no')" }, "main.lua", { id: "game", version: "1", name: "Bad" }));
  assert.throws(() => buildOrbitPackage({ "main.js": "GameLab.run(MyGame)" }, "main.js", { id: "game", version: "1", name: "Bad" }));
  assert.throws(() => buildOrbitPackage({ "main.js": "data:image/png;base64,AA==" }, "main.js", { id: "game", version: "1", name: "Bad" }));
});
