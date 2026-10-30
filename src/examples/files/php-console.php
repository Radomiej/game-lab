<?php
// PHP 8.4 w przegladarce (php-wasm). Wypisuje na konsole.
echo "Witaj z PHP ", PHP_VERSION, "!\n";

$sum = 0;
for ($i = 1; $i <= 10; $i++) $sum += $i;
echo "Suma 1..10 = {$sum}\n";

$imiona = ["Ada", "Bartek", "Celina"];
foreach ($imiona as $k => $v) echo "  {$k}: {$v}\n";

class Punkt {
    public function __construct(public float $x, public float $y) {}
    public function len(): float { return hypot($this->x, $this->y); }
}
$p = new Punkt(3, 4);
echo "Dlugosc wektora = {$p->len()}\n";

// lab.h-style facade jest w pliku Lab.php (auto-dolaczany):
$info = Lab::worldInfo();
echo "Komponentow na scenie: " . count($info ?? []) . "\n";
