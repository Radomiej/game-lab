-- Konsola Lua. print() pisze do panelu, lab.input() czyta stdin.
print("Witaj z Lua!")
local n = 0
for i = 1, 10 do n = n + i end
print("Suma 1..10 = " .. n)
local imie = lab.input()
if imie then print("Cześć, " .. imie .. "!") end
