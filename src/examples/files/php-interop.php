<?php
// Interop PHP -> wspolna scena (WorldRegistry). Lab.php laduje sie
// automatycznie (auto_prepend_file). Odpal najpierw lua-ai (Chaser), STOP.

// PHP moze spawnowac obiekty, czytac/pisac pola komponentow innych jezykow
// i wolac ich metody — synchronicznie w trakcie skryptu (plik odpowiedzi).
$enemy = Lab::spawn('EnemyPhp');
echo "[php] spawn -> obiekt {$enemy}\n";
Lab::attachRenderer($enemy, ['type' => 'sprite', 'texture' => 'slime', 'width' => 48, 'height' => 48]);
Lab::setPosition($enemy, 200, 160);

$chaser = Lab::findComponent('Chaser');
echo "[php] findComponent(Chaser) = {$chaser}\n";
if ($chaser) {
    echo "[php] Chaser.x = " . Lab::getProp($chaser, 'x') . "\n";
    Lab::setProp($chaser, 'speed', 300);
    Lab::callMethod($chaser, 'setTarget', [320, 240]);
    echo "[php] setProp speed=300 + setTarget(320,240) wyslane\n";
}
echo "[php] koniec skryptu — obiekty zostaja na scenie\n";
