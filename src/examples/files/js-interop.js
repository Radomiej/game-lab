// Interop demo: TEN skrypt jest w JavaScript.
// Najpierw RUN lua-ai.lua i/lub py-ai.py — ich komponenty zostają
// w świecie hosta. Host tickuje ich update(dt) co klatkę,
// a my czytamy publiczne pola i wołamy publiczne metody.
let px = 320, py = 180;
const SPEED = 220;
const COLORS = { lua: "#e06c75", python: "#61afef", javascript: "#98c379" };

function update(dt) {
  if (lab.isKeyDown("ArrowLeft") || lab.isKeyDown("KeyA")) px -= SPEED * dt;
  if (lab.isKeyDown("ArrowRight") || lab.isKeyDown("KeyD")) px += SPEED * dt;
  if (lab.isKeyDown("ArrowUp") || lab.isKeyDown("KeyW")) py -= SPEED * dt;
  if (lab.isKeyDown("ArrowDown") || lab.isKeyDown("KeyS")) py += SPEED * dt;
  px = Math.max(12, Math.min(lab.width() - 12, px));
  py = Math.max(12, Math.min(lab.height() - 12, py));

  // Komponenty napisane w innych językach dostają cel = pozycja gracza.
  const comps = lab.worldInfo();
  for (const c of comps) lab.call(c.id, "setTarget", px, py);

  lab.clear();
  for (const c of comps) {
    // publiczne pola komponentu — niezależnie od języka pochodzenia
    const x = lab.getProp(c.id, "x");
    const y = lab.getProp(c.id, "y");
    const sp = lab.getProp(c.id, "speed");
    if (typeof x === "number" && typeof y === "number") {
      lab.drawCircle(x, y, 12, COLORS[c.lang] ?? "#cccccc");
      lab.drawText(x + 16, y, `${c.kind}(${c.lang}) v=${sp}`, "#aaaaaa", 12);
    }
  }
  lab.drawRect(px - 12, py - 12, 24, 24, "#4f9cf9");
  lab.drawText(10, 20, "JS steruje komponentami z Lua/Pythona", "#ffffff", 14);
  if (!comps.length) {
    lab.drawText(10, 44, "Świat pusty — najpierw RUN lua-ai.lua lub py-ai.py", "#ff8888", 14);
  }
}
