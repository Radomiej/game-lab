# Gra w Pythonie — identyczny kontrakt: init() + update(dt), fasada lab.*
px, py = 320.0, 180.0
speed = 200.0

def init():
    lab.clear("#101216")
    print("start!")

def update(dt):
    global px, py
    if lab.isKeyDown("ArrowLeft") or lab.isKeyDown("KeyA"):
        px -= speed * dt
    if lab.isKeyDown("ArrowRight") or lab.isKeyDown("KeyD"):
        px += speed * dt
    if lab.isKeyDown("ArrowUp") or lab.isKeyDown("KeyW"):
        py -= speed * dt
    if lab.isKeyDown("ArrowDown") or lab.isKeyDown("KeyS"):
        py += speed * dt
    px = max(15, min(lab.width() - 15, px))
    py = max(15, min(lab.height() - 15, py))

    lab.clear()
    lab.drawRect(px - 14, py - 14, 28, 28, "#61afef")
    lab.drawText(10, 20, "Python: strzałki/WASD", "#ffffff", 14)
