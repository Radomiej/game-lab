// Gra: zdefiniuj update(dt) — host sam odpala pętlę klatek.
// Sterowanie: strzałki / WASD. Zbieraj kręgi!
let px = 320, py = 180;
let coinX = 500, coinY = 100;
let score = 0;
const SPEED = 160;

function init() {
  lab.clear("#101216");
}

function update(dt) {
  const step = SPEED * dt;
  if (lab.isKeyDown("ArrowLeft") || lab.isKeyDown("KeyA")) px -= step;
  if (lab.isKeyDown("ArrowRight") || lab.isKeyDown("KeyD")) px += step;
  if (lab.isKeyDown("ArrowUp") || lab.isKeyDown("KeyW")) py -= step;
  if (lab.isKeyDown("ArrowDown") || lab.isKeyDown("KeyS")) py += step;
  px = Math.max(12, Math.min(lab.width() - 12, px));
  py = Math.max(12, Math.min(lab.height() - 12, py));

  const dx = px - coinX, dy = py - coinY;
  if (dx * dx + dy * dy < 24 * 24) {
    score++;
    print("Moneta! wynik =", score);
    coinX = 40 + Math.random() * (lab.width() - 80);
    coinY = 40 + Math.random() * (lab.height() - 80);
  }

  lab.clear();
  lab.drawCircle(coinX, coinY, 10, "#ffd54f");
  lab.drawRect(px - 12, py - 12, 24, 24, "#4f9cf9");
  lab.drawText(10, 20, "Wynik: " + score, "#ffffff", 14);
}
