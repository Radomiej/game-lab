// Interop C# -> wspolna scena (WorldRegistry) przez synchroniczny Lab.*.
// Odpal najpierw lua-ai (Chaser), STOP, potem ten plik.
using System;

var chaser = Lab.FindComponent("Chaser");
Console.WriteLine($"[cs] findComponent(Chaser) = {chaser}");

if (chaser != 0)
{
    var x = Lab.GetNum(chaser, "x");
    Console.WriteLine($"[cs] Chaser.x = {x}");
    Lab.SetNum(chaser, "x", x + 1);
    Console.WriteLine($"[cs] read-after-write x = {Lab.GetNum(chaser, "x")}");
    Lab.SetNum(chaser, "speed", 260);
    Lab.Call(chaser, "setTarget", 560, 400);
    Console.WriteLine($"[cs] cross-language call -> tx={Lab.GetNum(chaser, "tx")}, ty={Lab.GetNum(chaser, "ty")}");
}

var enemy = Lab.Spawn("EnemyCs2");
Lab.AttachRenderer(enemy, "slime", 48, 48);
Lab.SetPosition(enemy, 240, 240);
Console.WriteLine($"[cs] spawn -> EnemyCs2 #{enemy}, x={Lab.GetPosition(enemy)?.X}");
Lab.Print("[cs] string z separatorem | i nowa linia\npozostaje jednym wywolaniem");
