// Zombie Survival — gra wielojęzyczna.
//   main.js      (JS)   — gracz, ruch WASD, strzelanie, HUD, orkiestracja
//   zombies.lua  (Lua)  — ZombieFactory + ZombieBrain (AI, obrażenia)
//   bullets.py   (Py)   — GunFactory + Bullet.onTrigger (trafienia)
//   waves.luau   (Luau) — WaveDirector (fale, licznik zabójstw)
//
// lab.evalFile wykonuje moduły w ich własnych runtime'ach NA TEJ SAMEJ
// scenie — komponenty są współdzielone i woływane synchronicznie
// między językami. Kolizje: collidery/triggery silnika fizyki.

class ZombieGame extends GameLab.Game {
  onCreate() {
    this.worldBounds = { x: 0, y: 0, width: 640, height: 480 };
    this.ready = false;
    this.dead = false;
    this.hp = 100;
    this.reload = 0;
    this.faceX = 1;
    this.faceY = 0;
    this.msg = "ładowanie modułów językowych…";

    // Gracz = obiekt świata — Lua/Python widzą go przez interop.
    const pid = lab.spawn("Player");
    this.playerId = pid;
    lab.setPosition(pid, 320, 240);
    lab.attachRenderer(pid, { type: "sprite", texture: "player", width: 28, height: 28 });
    lab.attachCollider(pid, { shape: "circle", radius: 12 });
    lab.attachComponent(pid, "PlayerBrain", {
      objectId: pid,
      hp: 100,
      game: this,
      hurt(d) {
        if (this.game.dead) return;
        this.hp -= d;
        this.game.hp = this.hp;
      },
    });

    const hud = this.createObject("HUD").setPosition(320, 18);
    this.hudText = hud.addComponent(new GameLab.TextRenderer(() => this.msg, 14, "#e8f4f8"));
    this.hudText.space = "screen";

    Promise.all([
      lab.evalFile("zombies.lua"),
      lab.evalFile("bullets.py"),
      lab.evalFile("waves.luau"),
    ])
      .then(() => {
        this.gunId = lab.findComponent("GunFactory");
        this.wavesId = lab.findComponent("WaveDirector");
        this.factoryId = lab.findComponent("ZombieFactory");
        this.ready = true;
        this.msg = "start";
        lab.print("interop: JS+Lua+Luau+Python na jednej scenie");
      })
      .catch((e) => {
        this.msg = "evalFile: " + e.message;
        lab.print("eval error:", e.message);
      });
  }

  onUpdate(dt) {
    if (!this.ready) return;
    const i = this.input;
    const pos = lab.getPosition(this.playerId);
    if (!pos) return;

    if (!this.dead) {
      // ruch: WASD / strzałki — pozycja przez lab.* żeby wszystkie
      // języki widziały tę samą transformację (synchronicznie)
      const x = (i.isKeyDown("d") || i.isKeyDown("ArrowRight") ? 1 : 0)
        - (i.isKeyDown("a") || i.isKeyDown("ArrowLeft") ? 1 : 0);
      const y = (i.isKeyDown("s") || i.isKeyDown("ArrowDown") ? 1 : 0)
        - (i.isKeyDown("w") || i.isKeyDown("ArrowUp") ? 1 : 0);
      if (x || y) {
        const l = Math.hypot(x, y);
        this.faceX = x / l;
        this.faceY = y / l;
        const nx = Math.max(14, Math.min(626, pos.x + (x / l) * 160 * dt));
        const ny = Math.max(14, Math.min(466, pos.y + (y / l) * 160 * dt));
        lab.setPosition(this.playerId, nx, ny);
        pos.x = nx;
        pos.y = ny;
      }

      // strzał: SPACJA / lewy przycisk myszy — cel = kursor albo facing
      this.reload -= dt;
      const ptr = i.getPointerPosition();
      if ((i.isKeyDown(" ") || i.isKeyDown("Space") || i.isMouseDown(0)) && this.reload <= 0) {
        let dx = this.faceX, dy = this.faceY;
        if (ptr) {
          const l = Math.hypot(ptr.x - pos.x, ptr.y - pos.y) || 1;
          dx = (ptr.x - pos.x) / l;
          dy = (ptr.y - pos.y) / l;
        }
        lab.call(this.gunId, "fire", pos.x, pos.y, dx, dy, this.playerId); // JS→Python
        this.reload = 0.3;
        this.sound.playSfx({ wave: "square", freq: 880, slide: -640, dur: 0.08, attack: 0.002, noise: 0.06, volume: 0.3 });
      }
    }

    const kills = this.wavesId ? lab.getProp(this.wavesId, "kills") : 0;
    const wave = this.wavesId ? lab.getProp(this.wavesId, "wave") : 0;
    const fired = this.gunId ? lab.getProp(this.gunId, "fired") : 0;
    this.hudText.text = this.dead
      ? `KONIEC GRY — fala ${wave} · zabójstwa ${kills} · restart: przycisk Restart`
      : `HP ${this.hp}   fala ${wave}   zabójstwa ${kills}   strzały ${fired}   [WASD + mysz/spacja]`;

    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      if (this.wavesId) lab.setProp(this.wavesId, "enabled", false);
      this.sound.playSfx({ wave: "sawtooth", freq: 200, slide: -160, dur: 0.7, attack: 0.01, noise: 0.5, filterFreq: 1200, volume: 0.8 });
    }
  }
}

GameLab.run(ZombieGame);
