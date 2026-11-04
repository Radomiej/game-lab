-- Mózg zombie + fabryka (Lua 5.4). Moduł ładowany przez lab.evalFile
-- z main.js — rejestruje komponent ZombieFactory współdzielony
-- ze wszystkimi językami. Zombie gonią gracza, gryzą przy dotyku
-- (onTrigger z collidera) i umierają od trafień pocisków (damage).

local function newBrain(oid)
  return {
    objectId = oid,
    hp = 60,
    speed = 42 + math.random(38),
    dmgCd = 0,
    x = 0, y = 0,

    update = function(self, dt)
      self.dmgCd = math.max(0, self.dmgCd - dt)
      local pc = lab.findComponent("PlayerBrain")
      if not pc then return end
      local poid = lab.getProp(pc, "objectId")
      local tp = lab.getPosition(poid)
      local me = lab.getPosition(self.objectId)
      if not tp or not me then return end
      local dx, dy = tp.x - me.x, tp.y - me.y
      local d = math.sqrt(dx * dx + dy * dy)
      if d > 4 then
        local nx = me.x + dx / d * self.speed * dt
        local ny = me.y + dy / d * self.speed * dt
        lab.setPosition(self.objectId, nx, ny)
        self.x, self.y = nx, ny
      end
    end,

    -- collider zombie = trigger: kontakt z graczem gryzie, z pociskiem
    -- nic (pocisk sam obsługuje trafienie przez Bullet.onTrigger).
    onTrigger = function(self, otherId)
      local pc = lab.getComponent(otherId, "PlayerBrain")
      if pc and self.dmgCd <= 0 then
        lab.call(pc, "hurt", 8)
        self.dmgCd = 0.7
      end
    end,

    damage = function(self, n)
      self.hp = self.hp - n
      if self.hp <= 0 then
        local wd = lab.findComponent("WaveDirector")
        lab.destroyObject(self.objectId)
        if wd then lab.call(wd, "onKill") end
      end
    end,
  }
end

local factory = {
  spawned = 0,
  spawn = function(self, x, y)
    local oid = lab.spawn("Zombie")
    lab.setPosition(oid, x, y)
    lab.attachRenderer(oid, { type = "sprite", texture = "slime", width = 26, height = 26 })
    lab.attachCollider(oid, { shape = "circle", radius = 11, isTrigger = true })
    lab.attachComponent(oid, "ZombieBrain", newBrain(oid))
    self.spawned = self.spawned + 1
    return oid
  end,
}

lab.attachComponent(lab.spawn("ZombieFactory"), "ZombieFactory", factory)
lab.print("zombies.lua: ZombieFactory gotowa")
