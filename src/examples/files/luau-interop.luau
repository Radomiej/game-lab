-- Interop Luau -> wspolna scena (lab.*, WorldRegistry)
-- Odpal najpierw lua-ai (Chaser), STOP, potem ten plik.
-- Adnotacje typow + string interpolation + += z Luau.
local enemyId: number = lab.spawn("EnemyLuau")
print(`spawn -> obiekt {enemyId}`)

lab.attachRenderer(enemyId, { type = "sprite", texture = "slime", width = 48, height = 48 })
lab.setPosition(enemyId, 100, 200)

local chaser: number = lab.findComponent("Chaser")
print(`findComponent(Chaser) = {chaser}`)

if chaser ~= 0 then
	local x: number = lab.getProp(chaser, "x")
	print(`Chaser.x = {x}`)
	lab.setProp(chaser, "speed", 240)
	lab.call(chaser, "setTarget", 320, 80)
	print("setProp speed=240 + setTarget(320,80) wyslane")
end

-- Wlasny komponent Luau z metoda update() — tickowany przez host
lab.attachComponent(enemyId, "LuauMarker", {
	team = "blue",
	hp = 99,
	update = function(self, dt)
		self.hp -= dt -- pole dryfuje w czasie — widać tick w inspektorze
	end,
})
