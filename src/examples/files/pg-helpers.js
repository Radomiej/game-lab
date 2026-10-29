// helpers.js — plik pomocniczy playgroundu. Definicje stąd są widoczne
// w main.js (pliki nie-startowe doklejane są przed plikiem startowym).
function rand(min, max) {
  return min + Math.random() * (max - min);
}

function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
