export const gameInputRuntimeFiles = {
  'KeyPressed.java': `package engine;
/** Callback raz na początek naciśnięcia, bez powtarzania podczas trzymania. */
public class KeyPressed extends Component {
    public final String key;
    public final Runnable action;
    public KeyPressed(String key,Runnable action) {
        if(key==null || key.isEmpty() || action==null)throw new IllegalArgumentException("Wymagany klawisz i callback");
        this.key=key;this.action=action;
    }
    @Override public void onUpdate(double delta) {if(getGame().input.isKeyPressed(key))action.run();}
}
`,
  'KeyDoublePressed.java': `package engine;
/** Dwa początki naciśnięcia w oknie czasu gry; pomiędzy nimi trzeba puścić klawisz. */
public class KeyDoublePressed extends KeyPressed {
    public double maxDelaySeconds=0.3;
    private double elapsed;
    private boolean armed;
    public KeyDoublePressed(String key,Runnable action) {super(key,action);}
    @Override public void onUpdate(double delta) {
        if(!Double.isFinite(maxDelaySeconds)||maxDelaySeconds<=0)throw new IllegalArgumentException("Niepoprawne okno podwojnego nacisniecia");
        elapsed+=delta;
        if(!getGame().input.isKeyPressed(key))return;
        if(armed && elapsed<=maxDelaySeconds){armed=false;action.run();}
        else {armed=true;elapsed=0;}
    }
}
`,
  'NoneOfKeysPressed.java': `package engine;
/** Callback w każdej klatce, w której żaden z klawiszy nie jest trzymany. */
public class NoneOfKeysPressed extends Component {
    public final String[] keys;
    public final Runnable action;
    public NoneOfKeysPressed(String[] keys,Runnable action) {
        if(keys==null || keys.length==0 || action==null)throw new IllegalArgumentException("Wymagane klawisze i callback");
        this.keys=keys.clone();this.action=action;
        for(String key:this.keys)if(key==null || key.isEmpty())throw new IllegalArgumentException("Niepoprawny klawisz");
    }
    @Override public void onUpdate(double delta) {
        for(String key:keys)if(getGame().input.isKeyDown(key))return;
        action.run();
    }
}
`,
  'Keys.java': `package engine;
/** Stałe nazwy klawiszy dla input.isKeyDown/isKeyPressed/isKeyReleased/consumeKey. Te same wartości co GameLab.Keys w JavaScript. */
public final class Keys {
    private Keys() {}
    public static final String UP="ArrowUp"; public static final String DOWN="ArrowDown"; public static final String LEFT="ArrowLeft"; public static final String RIGHT="ArrowRight";
    public static final String W="w"; public static final String A="a"; public static final String S="s"; public static final String D="d";
    public static final String X="x"; public static final String Y="y"; public static final String Z="z";
    public static final String DIGIT_1="1"; public static final String DIGIT_2="2"; public static final String DIGIT_3="3";
    public static final String SPACE="Space"; public static final String ENTER="Enter"; public static final String SHIFT="Shift"; public static final String TAB="Tab"; public static final String ESCAPE="Escape";
    public static final String ACTION_A="ACTION_A"; public static final String ACTION_B="ACTION_B"; public static final String ACTION_X="ACTION_X"; public static final String ACTION_Y="ACTION_Y"; public static final String ACTION_START="ACTION_START"; public static final String ACTION_SELECT="ACTION_SELECT";
}
`,
};
