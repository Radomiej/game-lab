// Interop C# -> wspolna scena (WorldRegistry) przez Lab.* (kanal stdout).
// Ops sa aplikowane w kolejnosci po zakonczeniu skryptu.
// Odpal najpierw lua-ai (Chaser), STOP, potem ten plik.
using System;

var enemy = Lab.Spawn("EnemyCs");
Console.WriteLine($"[cs] spawn -> EnemyCs");
Lab.AttachRenderer(enemy, "slime", 48, 48);
Lab.SetPosition(enemy, 160, 200);

// Adresowanie po nazwie komponentu (id nieznane z wyprzedzeniem)
Lab.SetNumByKind("Chaser", "speed", 280);
Lab.CallByKind("Chaser", "setTarget", "[480, 120]");
Console.WriteLine("[cs] SetNumByKind speed=280 + setTarget(480,120) wyslane");
Console.WriteLine("[cs] koniec — ops zostana zaaplikowane po skrypcie");
