# Interop: komponent "Wanderer" w Pythonie — wędruje losowo,
# publiczne pola x/y/speed widoczne i zmieniane z innych języków.
import random

obj = lab.spawn("Scout")

class Wanderer:
    def __init__(self):
        self.x = 400.0
        self.y = 250.0
        self.speed = 90.0
        self.tx = self.x
        self.ty = self.y

    def setTarget(self, x, y):
        self.tx, self.ty = x, y

    def update(self, dt):
        dx, dy = self.tx - self.x, self.ty - self.y
        d = (dx * dx + dy * dy) ** 0.5
        if d < 8:
            self.tx = random.uniform(30, lab.width() - 30)
            self.ty = random.uniform(30, lab.height() - 30)
        else:
            step = min(d, self.speed * dt)
            self.x += dx / d * step
            self.y += dy / d * step

wanderer = Wanderer()
comp_id = lab.attachComponent(obj, "Wanderer", wanderer)
print(f"Wanderer (Python) -> obiekt {obj}, komponent {comp_id}")
