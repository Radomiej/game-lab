// Konsola — podstawa. print() i input() działają jak stdout/stdin.
print("Witaj w lab-core!");
const imie = input();
if (imie) print("Cześć, " + imie + "!");

let suma = 0;
for (let i = 1; i <= 10; i++) suma += i;
print("Suma 1..10 =", suma);
