// Interop C# -> wspolna scena (WorldRegistry) przez Lab.*.
// Odczyty (FindComponent/GetNum/GetStr) — snapshot z chwili RUN.
// Zapisy (Spawn/SetNum/Call/...) — aplikowane po skrypcie w kolejnosci.
// Odpal najpierw lua-ai (Chaser), STOP, potem ten plik.
using System;

var chaser = Lab.FindComponent("Chaser");
Console.WriteLine($"[cs] findComponent(Chaser) = {chaser}");

if (chaser != 0)
{
    var x = Lab.GetNum(chaser, "x");
    Console.WriteLine($"[cs] Chaser.x = {x}");
    Lab.SetNum(chaser, "speed", 260);
    Lab.Call(chaser, "setTarget", "[560, 400]");
    Console.WriteLine("[cs] SetNum speed=260 + setTarget(560,400) wyslane");
}

var enemy = Lab.Spawn("EnemyCs2");
Lab.AttachRenderer(enemy, "slime", 48, 48);
Lab.SetPosition(enemy, 240, 240);
Console.WriteLine("[cs] spawn -> EnemyCs2 (token)");
Console.WriteLine("[cs] koniec — ops zostana zaaplikowane po skrypcie");
