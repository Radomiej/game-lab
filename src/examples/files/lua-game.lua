-- Gra w Lua: ten sam protokół co JS — update(dt) + lab.*
local px, py = 320, 180
local speed = 180

function init()
  lab.clear("#101216")
  print("start!")
end

function update(dt)
  if lab.isKeyDown("ArrowLeft") or lab.isKeyDown("KeyA") then px = px - speed * dt end
  if lab.isKeyDown("ArrowRight") or lab.isKeyDown("KeyD") then px = px + speed * dt end
  if lab.isKeyDown("ArrowUp") or lab.isKeyDown("KeyW") then py = py - speed * dt end
  if lab.isKeyDown("ArrowDown") or lab.isKeyDown("KeyS") then py = py + speed * dt end
  px = math.max(15, math.min(lab.width() - 15, px))
  py = math.max(15, math.min(lab.height() - 15, py))

  lab.clear()
  lab.drawCircle(px, py, 14, "#e06c75")
  lab.drawText(10, 20, "Lua: strzałki/WASD", "#ffffff", 14)
end
