-- Dyrektor fal (Luau — +=, adnotacje typów, interpolacja stringów).
-- Co falę woła ZombieFactory.spawn (Lua) na losowej krawędzi mapy.
-- lab.evalFile z main.js.

type Dir = {
	wave: number,
	kills: number,
	timer: number,
	enabled: boolean,
	update: (Dir, number) -> (),
	onKill: (Dir) -> (),
}

local director: Dir = {
	wave = 0,
	kills = 0,
	timer = 1.5,
	enabled = true,

	update = function(self: Dir, dt: number)
		if not self.enabled then
			return
		end
		self.timer -= dt
		if self.timer > 0 then
			return
		end
		self.wave += 1
		local count = 2 + self.wave
		local f = lab.findComponent("ZombieFactory")
		if f then
			for _ = 1, count do
				local edge = math.random(4)
				local x, y
				if edge == 1 then
					x, y = math.random(24, 616), -12
				elseif edge == 2 then
					x, y = math.random(24, 616), 492
				elseif edge == 3 then
					x, y = -12, math.random(24, 456)
				else
					x, y = 652, math.random(24, 456)
				end
				lab.call(f, "spawn", x, y)
			end
		end
		self.timer = math.max(3, 9 - self.wave * 0.6)
		lab.print(`[luau] fala {self.wave}: {count} zombie`)
	end,

	onKill = function(self: Dir)
		self.kills += 1
	end,
}

lab.attachComponent(lab.spawn("WaveDirector"), "WaveDirector", director)
lab.print("waves.luau: WaveDirector gotowy")
