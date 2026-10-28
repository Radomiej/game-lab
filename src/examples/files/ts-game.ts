// TypeScript — typy są sprawdzane składniowo przez sucrase (strip types).
// Ten sam kontrakt: init() + update(dt), fasada lab.*.
interface Vec { x: number; y: number }

const pos: Vec = { x: 320, y: 180 };
let vx = 120;
let vy = 90;
const R = 20;

function update(dt: number): void {
  pos.x += vx * dt;
  pos.y += vy * dt;
  if (pos.x < R || pos.x > lab.width() - R) vx = -vx;
  if (pos.y < R || pos.y > lab.height() - R) vy = -vy;
  pos.x = Math.max(R, Math.min(lab.width() - R, pos.x));
  pos.y = Math.max(R, Math.min(lab.height() - R, pos.y));

  lab.clear();
  lab.drawCircle(pos.x, pos.y, R, "#4fd1a5");
  lab.drawText(10, 20, `odbicia: vx=${vx.toFixed(0)} vy=${vy.toFixed(0)}`, "#ffffff", 14);
}
