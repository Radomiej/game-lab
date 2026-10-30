// Interop Java ↔ wspólna scena (WorldRegistry) — wywołania Lab.* są
// SYNCHRONICZNE (worker czeka na SharedArrayBuffer, host odpowiada od razu).
// Scenariusz testowy: najpierw odpal lua-ai (komponent Chaser w Lua),
// potem STOP i odpal ten plik — Java czyta pola komponentu z Lua.

public class GameMain extends Game {
    int enemyObj;
    int marker;
    int chaser;
    int frames;
    TextRenderer hudText;

    @Override public void onCreate() {
        // Wspólny GameObject — widoczny w hierarchii i dla innych języków.
        enemyObj = Lab.spawn("EnemyJava");
        Lab.attachRenderer(enemyObj, "{\"type\":\"sprite\",\"texture\":\"slime\",\"width\":48,\"height\":48}");
        Lab.setPosition(enemyObj, 120, 360);

        // Komponent Java w rejestrze — pola publikowane przez pushProp.
        marker = Lab.attachComponent(enemyObj, "JavaMarker");
        Lab.pushProp(marker, "team", "red");
        Lab.pushProp(marker, "hp", "100");

        // Odszukanie Chasera dopiero w onUpdate — snapshot świata
        // dociera po pierwszej klatce (Lab.findComponent czyta go lokalnie).

        GameObject hud = createObject("HUD");
        hud.setPosition(320, 24);
        hudText = hud.addComponent(new TextRenderer("", 15, "#e8f4f8"));
        hudText.space = "screen";
    }

    @Override public void onUpdate(double delta) {
        frames++;
        if (chaser == 0) {
            chaser = Lab.findComponent("Chaser");
            if (chaser != 0) {
                System.out.println("[java] findComponent(Chaser) = " + chaser);
                System.out.println("[java] Chaser.x = " + Lab.getNum(chaser, "x"));
                // zapis pola komponentu Lua + wywołanie jego metody
                Lab.setNum(chaser, "speed", 260);
                Lab.call(chaser, "setTarget", "[200, 200]");
            }
        }
        if (chaser != 0) {
            double cx = Lab.getNum(chaser, "x");
            double cy = Lab.getNum(chaser, "y");
            // EnemyJava (sprite slime w dzielonej scenie) podąża za Chaserem.
            Lab.setPosition(enemyObj, cx + 60, cy);
            if (hudText != null) hudText.text = "Java czyta Chaser: x=" + (int) cx + " y=" + (int) cy;
        }
        Lab.pushProp(marker, "hp", String.valueOf(100 - (frames % 50)));
    }
}
