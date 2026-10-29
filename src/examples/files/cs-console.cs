using System;

Console.WriteLine("Witaj z C#!");
int suma = 0;
for (int i = 1; i <= 10; i++) suma += i;
Console.WriteLine($"Suma 1..10 = {suma}");

int[] tab = { 3, 1, 4, 1, 5 };
Array.Sort(tab);
Console.WriteLine(string.Join(", ", tab));

var pow = new Func<int, int>(x => x * x);
Console.WriteLine($"7^2 = {pow(7)}");
