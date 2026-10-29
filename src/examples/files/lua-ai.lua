-- Interop: rejestruje komponent "Chaser" w świecie hosta.
-- Uruchom ten plik, a potem js-interop.js — gra w JS będzie
-- czytać pola i wołać metody TEGO komponentu napisanego w Lua.
local obj = lab.spawn("Enemy")

local chaser = {
  x = 80, y = 80,
  speed = 140,
  tx = 0, ty = 0,
}

function chaser:setTarget(x, y)
  self.tx, self.ty = x, y
end

function chaser:update(dt)
  local dx, dy = self.tx - self.x, self.ty - self.y
  local d = math.sqrt(dx * dx + dy * dy)
  if d > 4 then
    local step = math.min(d, self.speed * dt)
    self.x = self.x + dx / d * step
    self.y = self.y + dy / d * step
  end
end

local id = lab.attachComponent(obj, "Chaser", chaser)
print("Chaser (Lua) -> obiekt " .. obj .. ", komponent " .. id)
