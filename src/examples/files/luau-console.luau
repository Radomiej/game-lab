-- Luau (Roblox) — test cech jezyka
-- adnotacje typow, +=, continue, string interpolation
local name: string = "Luau"
local version: number = 0.739
print(`Witaj z {name} {version}!`)

local sum: number = 0
for i = 1, 10 do
	if i % 2 == 0 then continue end
	sum += i
end
print(`suma nieparzystych 1..10 = {sum}`)

type Vec = { x: number, y: number }
local v: Vec = { x = 3, y = 4 }
print(`|v| = {math.sqrt(v.x * v.x + v.y * v.y)}`)

local function fib(n: number): number
	if n < 2 then return n end
	return fib(n - 1) + fib(n - 2)
end
print(`fib(15) = {fib(15)}`)
