// Silnik labów w natarciu: GameLab.Game + GameObject + Component/Sprite —
// to samo API co w web-learning-lab i java-lab (kod stamtąd działa 1:1).
// run() montuje konsolę LAB·BOY wokół canvasu: D-pad, ABXY, stats.
// Assety silnika: GameLab.Assets.PLAYER01 … lub klucze z zakładki Assety
// (własna grafika: new GameLab.Sprite("moja.png", w, h)).
// Dźwięki: this.sound.playSound("plik.wav"|"C5") — zakładka Dźwięki.

class MojaGra extends GameLab.Game {
  onCreate() {
    this.punkty = 0;
    this.msg = "WASD / strzałki / D-pad — zbierz monetę!";

    const p = this.createObject("Gracz").setPosition(300, 300);
    p.addComponent(new GameLab.Sprite(GameLab.Assets.PLAYER01, 48, 48));
    this.ctrl = p.addComponent(new GameLab.TopDownCharacterController2D());
    this.gracz = p;

    const m = this.createObject("Moneta").setPosition(140, 140);
    m.addComponent(new GameLab.Sprite(GameLab.Assets.COIN, 28, 28));
    this.moneta = m;

    const drzewo = this.createObject("Drzewo").setPosition(460, 160);
    drzewo.addComponent(new GameLab.Sprite(GameLab.Assets.TREE, 64, 64));

    const hud = this.createObject("HUD").setPosition(300, 24);
    const t = hud.addComponent(new GameLab.TextRenderer(() => `${this.msg}   punkty: ${this.punkty}`, 15, "#e8f4f8"));
    t.space = "screen";
  }

  onUpdate() {
    const i = this.input;
    const x = (i.isKeyDown("d") || i.isKeyDown("ArrowRight") ? 1 : 0) - (i.isKeyDown("a") || i.isKeyDown("ArrowLeft") ? 1 : 0);
    const y = (i.isKeyDown("s") || i.isKeyDown("ArrowDown") ? 1 : 0) - (i.isKeyDown("w") || i.isKeyDown("ArrowUp") ? 1 : 0);
    if (x || y) this.ctrl.walk(x, y);
    else this.ctrl.stop();

    const gp = this.gracz.transform;
    const mp = this.moneta.transform;
    if (Math.hypot(gp.x - mp.x, gp.y - mp.y) < 34) {
      this.moneta.setPosition(60 + Math.random() * 480, 60 + Math.random() * 480);
      this.punkty += 1;
      this.msg = "Moneta zebrana!";
      this.sound.playSound("C5", { beats: 0.25 });
    }
  }
}

GameLab.run(MojaGra);
