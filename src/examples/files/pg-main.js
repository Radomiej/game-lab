// Playground à la laby: projekt wieloplikowy.
// helpers.js (funkcje rand/dist/clamp) doklejony jest PRZED tym plikiem,
// assets/palette.json czytamy przez lab.readFile, sprite'y przez
// lab.drawSprite — assety silnika to te same klucze co w labach
// (player, coin, slime…). Kliknij "Assets silnika" w panelu Project,
// by wstawić lab.asset("klucz") do kodu.
const pal = JSON.parse(lab.readFile("assets/palette.json"));
let px = 320, py = 180, score = 0;
let coin = { x: rand(60, 580), y: rand(60, 300) };

function update(dt) {
  const step = 220 * dt;
  if (lab.isKeyDown("ArrowLeft") || lab.isKeyDown("KeyA")) px -= step;
  if (lab.isKeyDown("ArrowRight") || lab.isKeyDown("KeyD")) px += step;
  if (lab.isKeyDown("ArrowUp") || lab.isKeyDown("KeyW")) py -= step;
  if (lab.isKeyDown("ArrowDown") || lab.isKeyDown("KeyS")) py += step;
  px = clamp(px, 16, lab.width() - 16);
  py = clamp(py, 16, lab.height() - 16);

  if (dist(px, py, coin.x, coin.y) < 30) {
    score++;
    coin.x = rand(40, lab.width() - 40);
    coin.y = rand(40, lab.height() - 40);
  }

  lab.clear(pal.bg);
  lab.drawSprite("coin", coin.x - 14, coin.y - 14, 28, 28);
  lab.drawSprite("player", px - 16, py - 16, 32, 32);
  lab.drawText(10, 22, `Wynik: ${score}`, pal.primary, 16);
  lab.drawText(10, lab.height() - 12,
    `playground · pliki: ${lab.listFiles().length} · assety: ${lab.listAssets().length}`,
    "#6e8b9e", 12);
}
