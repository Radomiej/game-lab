# lab-core — jeden engine labowy, wiele języków

Prototyp: bazowa konsola + canvas jako wspólny rdzeń, a języki jako
wymienne nakładki ("overlays") wpięte przez **Lab Runtime Protocol (LRP)**
plus **World Registry** — wspólny świat GameObject/Component, który
umożliwia interop między językami na poziomie publicznych pól i metod.

Wzorzec wzięty z `java-lab` (`shared/lab-game-v2/contract.json`) — tu
protokół jest formalnie wydzielony i niezależny od języka.

```powershell
cd C:\Nauka\lab-core
npm install
npm run dev        # http://127.0.0.1:5191
```

## Warstwy

```
UI (main.ts)           — edytor, konsola, canvas, wybór języka
LabHost (core/host.ts)  — stdout/stderr, draw(), input, stdin, pętla gry
LRP (core/protocol.ts)  — DrawCmd, RunRequest, LabHost, LabRuntime
WorldRegistry           — handle GameObject/Component + get/set/invoke
  (core/world.ts)         marshalowane przez host (hub-and-spoke)
Renderer (core/engine.ts) — canvas 2D + InputTracker
Nakładki (src/runtimes/*) — po jednej na język
```

Nakładka **nie dotyka DOM**. Dostaje `LabHost`, tłumaczy natywne
wywołania (`print`, `lab.drawRect`, `cin >>`…) na LRP i zwraca
`RunResult`. Renderer/konsola/wejście/świat są współdzielone.

## Kontrakt dla kodu ucznia (identyczny we wszystkich językach)

- `print(...)` → konsola; stdin czytane `lab.input()` / `input()`.
- Gra: skrypt definiuje `init()` i/lub `update(dt)` — host odpala
  pętlę rAF, `dt` w sekundach z clamp 0.1 s (jak java-lab).
- Fasada `lab.*`: `drawRect/Circle/Line/Text`, `clear`,
  `isKeyDown(code)`, `isKeyPressed(code)`, `width()`, `height()`.
- **Interop**: `lab.spawn(name?)`, `lab.attachComponent(obj, kind, impl)`,
  `lab.getComponent(obj, kind)`, `lab.findComponent(kind)`,
  `lab.getProp(id, k)`, `lab.setProp(id, k, v)`, `lab.call(id, m, ...)`,
  `lab.worldInfo()`. Host tickuje `update(dt)` każdego komponentu
  co klatkę — niezależnie od języka, w którym został napisany.
- **Hierarchia** (panel pod podglądem, jak Unity Hierarchy + Inspector):
  GameObject → komponenty → publiczne pola z wartościami na żywo
  i metody; węzły zwijane, badge pokazuje język komponentu.
- **Project** (lewy panel, jak Unity Project): pliki projektu
  pogrupowane w foldery (`assets/…` → sekcja Assets), nowy/usuń/
  zmień nazwę/★ plik startowy; sekcja "Assets silnika" z wbudowanymi
  assetami — klik wstawia `lab.asset("klucz")` do edytora.
- **Playground**: projekt = wiele plików. W JS/TS pliki nie-startowe
  doklejane są przed startowy (helpers → main), więc funkcje/klasy
  pomocnicze są widoczne w entry. `lab.readFile(name)` czyta pliki
  projektu (np. `assets/palette.json`), `lab.asset/drawSprite`
  używają wbudowanych tekstur z palety labów (player, coin…).
- **Konsola** (API jak RuntimeConsole z labów): linie `> `/`⚠ `/`Błąd: `,
  pill Czeka/Ładuję/Działa/Gotowe/Błąd; przyciski: kopiuj wynik
  (wzorzec CopyCodeButton), "Pokaż białe znaki" (· ⇥ ↵ jak
  ConsoleOutput z java-lab), wyczyść, zwijanie. `console.log/info/
  warn/error` mapowane jak w labach — kod skopiowany z web-lab
  wypisuje się identycznie.

## Interop w praktyce (zweryfikowane)

1. Wybierz Lua → "Interop: komponent Chaser" → RUN (rejestruje
   komponent z tabeli Lua: publiczne `x, y, speed` + metody
   `setTarget`, `update`).
2. Wybierz Python → "Interop: komponent Wanderer" → RUN.
3. Wybierz JavaScript → "Gra: interop" → RUN: kod JS iteruje
   `lab.worldInfo()`, czyta publiczne pola, woła metody — a host
   tickuje `update(dt)` napisane w Lua/Pythonie co klatkę.
   "Wyczyść świat" resetuje rejestr.

Wywołania są synchroniczne, bo JS/TS/Lua/Python żyją w jednym wątku.
Dla WASM-runów (C++/Java) ta sama ścieżka działa przez eksport WASM
lub jako async marshaling — interfejs `ComponentBridge` już toleruje
Promise w `invoke`.

## Status nakładek

| Język | Runtime | Pobieranie | Stan |
|---|---|---|---|
| JavaScript | natywny (`new Function`) | 0 | działa: konsola + gra + interop |
| TypeScript | sucrase (strip types) | ~1 MB | działa: gra |
| Lua | **wasmoon** (Lua 5.4→WASM) | ~0.5 MB | działa: konsola + gra + interop |
| Luau (Roblox) | **slot** — patrz niżej | ~1–2 MB | opis niżej |
| Python | Pyodide (CPython→WASM, lazy CDN) | ~10–30 MB | działa: konsola + gra + interop |
| C++ | JSCPP (interpreter podzbioru) | ~0.5 MB | konsola; gra wymaga clang→WASM |
| C# | **@wasmsharp/core** (.NET WASM + Roslyn) | ~41 MB lazy | działa: konsola (prawdziwa kompilacja) |
| Java | **slot** — TeaVM z java-lab | ~7 MB | opis niżej |

## Sloty

### Luau (Roblox)

Realna opcja, bo Luau jest projektowany do osadzania i ma **oficjalny
target `Luau.Web`** w `luau-lang/luau` (budowa przez Emscripten; napędza
demo na luau-lang.org). Ścieżka: skompilować raz → `vendor/luau/` +
nakładka jak `lua.ts`. Bonus: `Luau.Analyze` w WASM daje w przeglądarce
typowy typecheck (wartość pedagogiczna: uczniowie Robloxa znają składnię).
Alternatywa: transpiler podzbioru Luau→Lua 5.4 (strip typów, `+=`→`=`,
`continue`→`goto`, interpolacja→`string.format`, iteracja uogólniona→
`pairs`) — pokrywa większość kodu szkolnego, ale bez pełnej zgodności.
Roblox-specific API (`game`, `Instance`, `Vector3`) — mapowalne na
`lab.*`/`WorldRegistry`, analogicznie do fasady silnika.

### Java (TeaVM) — do podpięcia

Assety i know-how już istnieją: `C:\Nauka\java-lab\public\vendor\teavm`
(`compiler.wasm` ~4 MB, classlib `.bin`, `teavm.worker.js`) oraz
`src/services/teavmRunner.js`. Nakładka: worker ładuje compiler.wasm,
Java→WASM, komendy draw z silnika mapować 1:1 na `DrawCmd`.

### C# (@wasmsharp/core) — vendored

Prawdziwy .NET runtime (`dotnet.native.wasm`) + **Roslyn kompilujący kod
ucznia do IL w przeglądarce** — dokładny odpowiednik architektury TeaVM
dla C# (tak działa "Try C#" Microsoftu). Zweryfikowane w przeglądarce:
top-level statements, `Console.WriteLine`, interpolacja, LINQ/lambda.

Pakiet jest **vendored** do `public/vendor/wasmsharp` skryptem
`scripts/vendor-wasmsharp.mjs` (uruchamiany raz po `npm install`), bo
upstream wymaga patchy: (a) ~153 importów assetów `import x from
"./x.dll|wasm|dat"` → `new URL(...)` (runtime oczekuje string-URLi);
(b) comlink z unpkg → lokalna kopia; (c) importy bez rozszerzenia.
Adapter ładuje moduł przez absolutny URL — zero udziału bundlera,
assemblie resolve'owane względem `import.meta.url`.

Limity POC: pierwszy load ~41 MB (lazy, potem cache przeglądarki);
`disableWebWorker: true` (worker wymaga HTTPS i `new URL(worker)` w
bundlerze); entry point = **top-level statements** (klasyczne
`static void Main()` rzuca `TargetParameterCountException` —
`CodeSession.RunAsync` woła bezargumentowe entry); kod ucznia bez mostu
do `lab.*` — gamedev/interop C# wymaga własnego host-assembly z
`[JSExport]` (roadmapa v2); `Console.ReadLine` bez stdin.

## Ograniczenia POC (świadome)

- Student code jedzie w main thread — nieskończona pętla w JS zamraża
  UI (wasmoon ma `functionTimeout`, inne runtime nie). Docelowo
  Web Workery jak w java-lab; wtedy sync interop wymaga
  SharedArrayBuffer+Atomics → COOP/COEP (zakomentowane w vite.config).
- stdin: kolejka linii, nie blokująca. Blokujący `cin`/`input()`
  = Atomics.wait + izolacja cross-origin.
- Marshal interopu = prymitywy (number/string/bool/handle-id). Obiekty
  zagnieżdżone i klasy — warstwa v2 (CBOR/pointer handles).
- Brak Monaco, przykłady jednoplikowe; brak sprite'ów/atlasu.
- Testy zadań (porównanie stdout) nie zaimplementowane — wzorzec
  `java-lab/src/services/lessonChecker.js`.

## Zależności / licencje

wasmoon MIT (Lua 5.4/WASM), sucrase MIT, Pyodide Apache-2.0 (CDN),
JSCPP MIT, @wasmsharp/core MIT (.NET WASM + Roslyn), comlink Apache-2.0.
Ścieżka docelowa C++: `BertalanD/browsercc`,
`msorvig/llvm-wasi`, `debugger-sh` (Stanford) — prawdziwy clang→WASM.
