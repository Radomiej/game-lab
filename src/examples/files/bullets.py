# GunFactory + Bullet (Python/Pyodide). lab.evalFile z main.js.
# Pocisk to Projectile2D silnika (attachProjectile) — fizyka sama go
# przesuwa i wykrywa trafienia; Bullet.onTrigger dostaje worldId
# trafionego obiektu i woła damage() na ZombieBrain (Lua).

class Bullet:
    def __init__(self, oid, dmg):
        self.objectId = oid
        self.dmg = dmg
        self.hits = 0

    def onTrigger(self, otherId):
        zb = lab.getComponent(otherId, "ZombieBrain")
        if zb is None:
            return
        lab.call(zb, "damage", self.dmg)
        self.hits += 1
        lab.destroyObject(self.objectId)


class GunFactory:
    def __init__(self):
        self.fired = 0

    def fire(self, x, y, dx, dy, owner=None):
        oid = lab.spawn("Bullet")
        lab.setPosition(oid, x, y)
        lab.attachRenderer(oid, {"type": "circle", "radius": 4, "color": "#ffd166"})
        spec = {
            "dx": dx, "dy": dy,
            "speed": 420, "lifetime": 1.2,
            "maxHits": 1,
        }
        # owner = worldId strzelca — pocisk spawnuje się w jego colliderze,
        # bez wykluczenia trafiałby go w pierwszej klatce i ginął.
        if owner is not None:
            spec["owner"] = owner
        lab.attachProjectile(oid, spec)
        lab.attachComponent(oid, "Bullet", Bullet(oid, 34))
        self.fired += 1


factory = GunFactory()
lab.attachComponent(lab.spawn("GunFactory"), "GunFactory", factory)
lab.print("bullets.py: GunFactory gotowa")
