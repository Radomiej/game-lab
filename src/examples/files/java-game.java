// Gra Java — ten sam silnik co GameLab JS (Game/GameObject/Sprite/Component),
// kompilowany przez TeaVM do WASM w workerze. Kod z java-lab działa 1:1.
// Sterowanie: WASD / strzałki. Dźwięk: audio.playNote / audio.play.
// Assety: enum Assets (PLAYER, COIN, TREE, SLIME…) lub klucz String z zakładki Assety.

public class GameMain extends Game {
    int punkty;
    String msg = "WASD / strza\u0142ki — zbierz monet\u0119!";
    TopDownCharacterController2D ctrl;
    GameObject gracz;
    GameObject moneta;
    TextRenderer hudText;

    @Override public void onCreate() {
        GameObject p = createObject("Gracz");
        p.setPosition(300, 300);
        p.addComponent(new Sprite(Assets.PLAYER, 48, 48));
        ctrl = p.addComponent(new TopDownCharacterController2D());
        gracz = p;

        moneta = createObject("Moneta");
        moneta.setPosition(140, 140);
        moneta.addComponent(new Sprite(Assets.COIN, 28, 28));

        GameObject drzewo = createObject("Drzewo");
        drzewo.setPosition(460, 160);
        drzewo.addComponent(new Sprite(Assets.TREE, 64, 64));

        GameObject hud = createObject("HUD");
        hud.setPosition(320, 24);
        hudText = hud.addComponent(new TextRenderer("", 15, "#e8f4f8"));
        hudText.space = "screen";
    }

    @Override public void onUpdate(double delta) {
        int x = (input.isKeyDown("d") || input.isKeyDown("ArrowRight") ? 1 : 0)
              - (input.isKeyDown("a") || input.isKeyDown("ArrowLeft") ? 1 : 0);
        int y = (input.isKeyDown("s") || input.isKeyDown("ArrowDown") ? 1 : 0)
              - (input.isKeyDown("w") || input.isKeyDown("ArrowUp") ? 1 : 0);
        if (x != 0 || y != 0) ctrl.walk(x, y); else ctrl.stop();

        double dx = gracz.transform.x - moneta.transform.x;
        double dy = gracz.transform.y - moneta.transform.y;
        if (Math.hypot(dx, dy) < 34) {
            moneta.setPosition(60 + Math.random() * 480, 60 + Math.random() * 480);
            punkty += 1;
            msg = "Moneta zebrana!";
            audio.playNote("C5", 0.25);
        }

        if (hudText != null) hudText.text = msg + "   punkty: " + punkty;
    }
}
