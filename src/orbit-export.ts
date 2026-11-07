import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { strToU8, zipSync } from "fflate";

const FILE_LIMIT = 8 * 1024 * 1024;
const TOTAL_LIMIT = 64 * 1024 * 1024;

function safePath(path: string): boolean {
  return path.length > 0 && path.length <= 240 && !path.startsWith("/") && !path.endsWith("/") &&
    path.split("/").every(part => part !== "" && part !== "." && part !== ".." && /^[A-Za-z0-9_.@ -]+$/.test(part));
}

export function buildOrbitPackage(
  projectFiles: Record<string, string>,
  entrypoint: string,
  metadata: { id: string; version: string; name: string; description?: string },
): Uint8Array {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/.test(metadata.id) || metadata.id === "." || metadata.id === "..") {
    throw new Error("ID musi zawierać do 48 liter, cyfr, kropek, myślników lub podkreśleń.");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(metadata.version)) throw new Error("Nieprawidłowy numer wersji.");
  const name = metadata.name.trim();
  if (!name || name.length > 128) throw new Error("Nazwa gry musi mieć od 1 do 128 znaków.");
  if (!/\.m?js$/i.test(entrypoint) || !projectFiles[entrypoint]) throw new Error("Wybierz plik startowy JavaScript (.js lub .mjs).");

  const names = Object.keys(projectFiles).sort();
  if (names.length === 0 || names.length > 256) throw new Error("Paczka musi mieć od 1 do 256 plików.");
  if (names.some(path => !safePath(path) || path === "orbit.json")) throw new Error("Projekt zawiera ścieżkę niedozwoloną w paczce Orbit.");
  if (names.some(path => /\.(ts|tsx|lua|luau|py|cpp|cc|cxx|cs|java|php)$/i.test(path))) {
    throw new Error("Orbit v0 uruchamia JavaScript. Usuń pliki innych języków z eksportu lub przygotuj osobny build.");
  }
  if (names.some(path => /\bGameLab\s*\.|\bthis\.sound\s*\./.test(projectFiles[path]))) {
    throw new Error("Ten projekt używa pełnego silnika lub dźwięku Game Lab. Eksporter Orbit v0 obsługuje na razie pętlę init/update i fasadę lab.* LRP.");
  }

  const zipFiles: Record<string, Uint8Array> = {};
  const files: Array<{ path: string; size: number; sha256: string }> = [];
  let total = 0;
  for (const path of names) {
    const source = projectFiles[path];
    if (source.startsWith("data:")) {
      throw new Error(`Paczka Orbit v0 nie może osadzić assetu binarnego: ${path}.`);
    }
    const bytes = strToU8(source);
    if (bytes.length > FILE_LIMIT) throw new Error(`Plik ${path} przekracza limit 8 MiB.`);
    total += bytes.length;
    if (total > TOTAL_LIMIT) throw new Error("Pliki przekraczają łączny limit 64 MiB.");
    zipFiles[path] = bytes;
    files.push({ path, size: bytes.length, sha256: bytesToHex(sha256(bytes)) });
  }
  const manifest = {
    format: "orbit-game",
    formatVersion: 0,
    id: metadata.id,
    version: metadata.version,
    name,
    description: (metadata.description || "Gra wyeksportowana z Game Lab").slice(0, 4000),
    runtime: "quickjs-lrp",
    apiVersion: "game-lab-lrp/1",
    entrypoint,
    orientation: "landscape",
    kind: "game",
    files,
    signature: null,
  };
  zipFiles["orbit.json"] = strToU8(JSON.stringify(manifest, null, 2));
  return zipSync(zipFiles, { level: 6 });
}
