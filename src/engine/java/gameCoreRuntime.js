export const gameCoreRuntimeFiles = {
  "Vector2.java": `package engine;
public final class Vector2 {
    public double x, y;
    public Vector2() { this(0, 0); }
    public Vector2(double x, double y) { this.x = x; this.y = y; }
    public Vector2 set(double x,double y){this.x=x;this.y=y;return this;}
    public Vector2 copy(){return new Vector2(x,y);}
    public double lengthSquared(){return x*x+y*y;}
    public double length(){return Math.sqrt(lengthSquared());}
    public Vector2 normalized(){double n=length();return n==0?new Vector2():new Vector2(x/n,y/n);}
}
`,
  "Sprite.java": `package engine;
public class Sprite extends Component {
    public String texture;
    public double width, height;
    /** Odbicie poziome (flipX) lub pionowe (flipY), bez zmiany collidera. */
    public boolean flipX, flipY;
    public String space="world";public int layer,order;
    public Sprite() { this("player", 32, 32); }
    public Sprite(String texture) { this(texture, 32, 32); }
    public Sprite(Assets asset) { this(asset.key(),32,32); }
    public Sprite(Assets asset,double width,double height) { this(asset.key(),width,height); }
    public Sprite(String texture, double width, double height) {
        this.texture = texture; this.width = width; this.height = height;
    }
}
`,
  "Collider2D.java": `package engine;
public class Collider2D extends Component {
    private static final class ContactListener {final Class<?> type;final java.util.function.Consumer<GameObject> callback;ContactListener(Class<?> type,java.util.function.Consumer<GameObject> callback){this.type=type;this.callback=callback;}}
    private final java.util.ArrayList<ContactListener> contactListeners=new java.util.ArrayList<>();
    public Runnable onContactEnter(Class<?> type,Runnable callback){if(callback==null)throw new IllegalArgumentException("Brak callback");return onContactEnter(type,other->callback.run());}
    public Runnable onContactEnter(Class<?> type,java.util.function.Consumer<GameObject> callback){if(type==null||!Component.class.isAssignableFrom(type)||callback==null)throw new IllegalArgumentException("Oczekiwano typu komponentu i callback");ContactListener listener=new ContactListener(type,callback);contactListeners.add(listener);return ()->contactListeners.remove(listener);}
    void fireContactEnter(GameObject other){for(ContactListener listener:new java.util.ArrayList<>(contactListeners)){if(removed||gameObject.destroyed||other.destroyed)break;if(other.hasComponent(listener.type))listener.callback.accept(other);}}
    public boolean isTrigger;
    public double width,height;
    public int layer=1,mask=0x7fffffff;
    public Collider2D() { this(32,32); }
    public Collider2D(double width,double height) { if(!Double.isFinite(width)||!Double.isFinite(height)||width<=0||height<=0)throw new IllegalArgumentException("Niepoprawny collider");this.width=width;this.height=height; }
}
`,
  "Trigger2D.java": `package engine;
public class Trigger2D extends Collider2D {
    public Trigger2D() { this(32,32); }
    public Trigger2D(double width,double height) { super(width,height);isTrigger=true; }
}
`,
  "CharacterController2D.java": `package engine;
public class CharacterController2D extends Component {
    public final Vector2 velocity = new Vector2();
    private final Vector2 direction = new Vector2(1,0);
    public Vector2 getDirection() { return direction.copy(); }
    public boolean constrainToBounds = true;
    /** Hook silnika wykonywany po ruchu i kolizjach. */
    public void onAfterMove(double delta) {}
    public void move(double x, double y) { move(x, y, 120); }
    public void move(double x, double y, double speed) {
        if(!Double.isFinite(x)||!Double.isFinite(y)||!Double.isFinite(speed)||speed<0)throw new IllegalArgumentException("Niepoprawny ruch");
        double length = Math.sqrt(x * x + y * y);
        if(length>0)direction.set(x/length,y/length);
        velocity.x = length == 0 ? 0 : x / length * speed;
        velocity.y = length == 0 ? 0 : y / length * speed;
    }
}
`,
  "Component.java": `package engine;

public abstract class Component {
    public GameObject gameObject;
    public Transform transform;
    public boolean enabled = true;
    public String updateMode="WORLD";
    boolean created;
    boolean removed;
    boolean destroyed;
    public final void attach(GameObject owner) { gameObject = owner;transform=owner.transform; }
    public void setEnabled(boolean value){if(enabled==value)return;enabled=value;if(!value&&this instanceof Button)((Button)this).blur();if(gameObject!=null)gameObject.game.spatialRevision++;}
    public void onCreate() {}
    public void onLateUpdate(double delta) {}
    public void onUpdate(double delta) {}
    public void onDestroy() {}
    public void onCollision(GameObject other) {}
    public void onTrigger(GameObject other) {}
    public void onComponentChange(ComponentChange change) {}
    public void onDrawBackground() {}
    public void onDrawUI() {}
    public final Game getGame() { return gameObject == null ? null : gameObject.game; }
    public final <T extends Component> T getComponent(Class<T> type) { return gameObject.getComponent(type); }
    public final java.util.ArrayList<Component> getComponents() { return gameObject.getComponents(); }
    public final <T extends Component> java.util.ArrayList<T> getComponents(Class<T> type) { return gameObject.getComponents(type); }
    public final boolean hasComponent(Class<?> type) { return gameObject.hasComponent(type); }
    public final int removeComponents(Class<?> type) { return gameObject.removeComponents(type); }
    public final <T extends Component> T requireComponent(Class<T> type) {
        T component = getComponent(type);
        if (component == null) throw new IllegalArgumentException("Brak wymaganego komponentu");
        return component;
    }
    final void initialize() { if (!created && !removed) { created = true; onCreate(); } }
    final void disposeComponent() { if (!destroyed) { destroyed = true; if(created)onDestroy(); } }
}
`,
  "ComponentChange.java": `package engine;
public final class ComponentChange {
    public final String type;
    public final Component component;
    public final GameObject object;
    ComponentChange(String type, Component component, GameObject object) {
        this.type = type; this.component = component; this.object = object;
    }
}
`,
  "ComponentChangeListener.java": `package engine;
public interface ComponentChangeListener { void onChange(ComponentChange change); }
`,
  "Game.java": `package engine;
public class Game {
    private final java.util.ArrayList<GameObject> objects = new java.util.ArrayList<>();
    private final java.util.ArrayList<Component> removed = new java.util.ArrayList<>();
    private boolean started;
    private boolean disposed;
    private boolean paused;
    private int nextObjectId=1;
    long spatialRevision;
    private boolean stepping;
    boolean isStepping(){return stepping;}
    private final java.util.HashMap<Class<?>,java.util.LinkedHashSet<GameObject>> componentIndex=new java.util.HashMap<>();
    private final java.util.HashMap<String,java.util.LinkedHashSet<GameObject>> tagIndex=new java.util.HashMap<>();
    void updateComponentIndex(GameObject object){for(Class<?> type:componentIndex.keySet()){java.util.LinkedHashSet<GameObject> set=componentIndex.get(type);if(!object.destroyed&&object.hasComponent(type))set.add(object);else set.remove(object);}}
    void updateTagIndex(GameObject object,String tag,boolean added){if(added&&!object.destroyed)tagIndex.computeIfAbsent(tag,key->new java.util.LinkedHashSet<>()).add(object);else{java.util.LinkedHashSet<GameObject> set=tagIndex.get(tag);if(set!=null){set.remove(object);if(set.isEmpty())tagIndex.remove(tag);}}}
    public final java.util.ArrayList<GameObject> getObjectsWith(Class<?>... types){
        if(types==null)throw new IllegalArgumentException("Brak typow komponentow");
        java.util.LinkedHashSet<GameObject> smallest=null;
        for(Class<?> type:types){if(type==null||!Component.class.isAssignableFrom(type))throw new IllegalArgumentException("Oczekiwano klasy komponentu");java.util.LinkedHashSet<GameObject> set=componentIndex.get(type);if(set==null){set=new java.util.LinkedHashSet<>();for(GameObject o:getObjects())if(!o.destroyed&&o.hasComponent(type))set.add(o);componentIndex.put(type,set);}if(smallest==null||set.size()<smallest.size())smallest=set;}
        java.util.ArrayList<GameObject> result=new java.util.ArrayList<>();for(GameObject o:smallest==null?getObjects():smallest){if(o.destroyed)continue;boolean all=true;for(Class<?> type:types)if(!componentIndex.get(type).contains(o)){all=false;break;}if(all)result.add(o);}result.sort((a,b)->Integer.compare(a.id,b.id));return result;
    }
    public final java.util.ArrayList<GameObject> getObjectsWithTag(String tag){java.util.ArrayList<GameObject> result=new java.util.ArrayList<>();java.util.LinkedHashSet<GameObject> set=tagIndex.get(tag);if(set!=null)for(GameObject o:set)if(!o.destroyed)result.add(o);result.sort((a,b)->Integer.compare(a.id,b.id));return result;}
    public final Time time=new Time();
    public final InputManager input=new InputManager();
    public final Canvas canvas=new Canvas();
    public final Audio audio=new Audio();
    public final Vector2 getCameraView(){for(GameObject o:getObjects()){Camera2D c=o.getComponent(Camera2D.class);if(o.active&&!o.destroyed&&c!=null&&c.enabled)return c.getView();}return new Vector2();}
    public final Physics2D physics=new Physics2D(this);
    public final Random random=new Random(1);
    public double[] worldBounds;
    public final int allocateObjectId(){return nextObjectId++;}
    public final void pause(){paused=true;}
    public final void resume(){paused=false;}
    public final boolean isPaused(){return paused;}
    private void navigateUI(){java.util.ArrayList<Button> buttons=new java.util.ArrayList<>();for(GameObject o:getObjects())if(o.active&&!o.destroyed)for(Button b:o.getComponents(Button.class))if(b.enabled&&b.created)buttons.add(b);if(!input.isKeyPressed("Tab")||buttons.isEmpty())return;int current=-1;for(int i=0;i<buttons.size();i++)if(buttons.get(i).isFocused())current=i;int direction=input.isKeyDown("Shift")?-1:1;int next=current<0?(direction>0?0:buttons.size()-1):(current+direction+buttons.size())%buttons.size();buttons.get(next).focus();input.consumeKey("Tab");}
    public final double getViewportWidth(){return GameCanvas.getWidth();}
    public final double getViewportHeight(){return GameCanvas.getHeight();}
    public void onDrawUI() {}
    public final GameObject find(String name){for(GameObject o:getObjects())if(!o.destroyed&&o.name.equals(name))return o;return null;}
    public final void setWorldBounds(double x,double y,double width,double height){if(!Double.isFinite(x)||!Double.isFinite(y)||!Double.isFinite(width)||!Double.isFinite(height)||width<=0||height<=0)throw new IllegalArgumentException("Niepoprawne granice");worldBounds=new double[]{x,y,width,height};}
    public final void clearWorldBounds(){worldBounds=null;}
    public String background = "#0b2033";
    public boolean debug;
    public void onCreate() {}
    public void onUpdate(double delta) {}
    public void onDestroy() {}
    public final GameObject createObject(String name) {
        if (disposed) throw new IllegalArgumentException("Gra jest zamknieta");
        GameObject object = new GameObject(this, name);
        objects.add(object); return object;
    }
    public final GameObject createObject() { return createObject("Obiekt"); }
    public final java.util.ArrayList<GameObject> getObjects() { return new java.util.ArrayList<>(objects); }
    public final boolean isDisposed() { return disposed; }
    public final void start() {
        if (started || disposed) throw new IllegalArgumentException("Gre mozna uruchomic tylko raz");
        started = true; Input.bind(input); onCreate(); initialize(); flush();
    }
    private void initialize() {
        for (int pass = 0; pass < 1000; pass++) {
            boolean pending = false;
            for (GameObject object : getObjects()) {
                if (object.destroyed) continue;
                for (Component component : object.getComponents()) {
                    if (disposed || object.destroyed) break;
                    if (!component.created && !component.removed) { pending = true; component.initialize(); }
                }
            }
            if (!pending) return;
        }
        throw new IllegalArgumentException("onCreate tworzy komponenty bez konca");
    }
    public final void step(double delta) {
        if (!started || disposed) return;
        if (delta != delta || delta < 0 || delta == Double.POSITIVE_INFINITY) throw new IllegalArgumentException("Niepoprawny czas klatki");
        delta = Math.min(delta, 0.1);
        time.unscaledDeltaTime=delta;time.unscaledElapsed+=delta;time.deltaTime=paused?0:delta;
        initialize();
        java.util.ArrayList<GameObject> snapshot = getObjects();
        java.util.ArrayList<java.util.ArrayList<Component>> components = new java.util.ArrayList<>();
        for (GameObject object : snapshot) components.add(object.getComponents());
        stepping=true;physics.beginFrame();
        try {
            GameCanvas.clear(background);
            for (GameObject object : snapshot) {
                CharacterController2D controller = object.getComponent(CharacterController2D.class);
                if (controller != null) { controller.velocity.x = 0; controller.velocity.y = 0; }
            }
            for(GameObject o:snapshot)for(Button b:o.getComponents(Button.class))if(!b.enabled||!o.active||o.destroyed||b.removed)b.blur();
            navigateUI();
            for(String mode:new String[]{"UI","WORLD"}){
                if(mode.equals("WORLD")){time.deltaTime=paused?0:delta;time.elapsed+=time.deltaTime;}
                if(mode.equals("WORLD")&&paused)continue;
                if(mode.equals("WORLD"))onUpdate(delta);
                for(int i=0;i<snapshot.size()&&!disposed;i++){
                    GameObject o=snapshot.get(i);if(!o.active||o.destroyed)continue;
                    for(Component c:components.get(i))if(c.enabled&&c.created&&!c.removed&&!o.destroyed&&c.updateMode.equals(mode))c.onUpdate(delta);
                }
            }
            if (!disposed&&!paused) Physics2D.step(this, snapshot, delta);
            for(GameObject o:getObjects())if(o.active&&!o.destroyed)for(Component c:o.getComponents())if(c.enabled&&c.created&&!c.removed&&(c.updateMode.equals("UI")||!paused))c.onLateUpdate(c.updateMode.equals("UI")?delta:time.deltaTime);
            double cameraX=0,cameraY=0;
            for(GameObject object:getObjects()) {
                Camera2D camera=object.getComponent(Camera2D.class);
                if(object.active&&!object.destroyed&&camera!=null&&camera.enabled){Vector2 view=camera.getView();cameraX=view.x;cameraY=view.y;break;}
            }
            if(!disposed) GameCanvas.drawView(cameraX,cameraY);
            java.util.ArrayList<TileMap> tiles=new java.util.ArrayList<>();
            if(!disposed)for(GameObject o:getObjects())if(o.active&&!o.destroyed)for(Component c:o.getComponents())if(c.enabled&&c.created&&!c.removed){if(c instanceof TileMap)tiles.add((TileMap)c);else c.onDrawBackground();}
            tiles.sort((a,b)->{int n=Integer.compare(a.layer,b.layer);return n==0?Integer.compare(a.order,b.order):n;});for(TileMap tile:tiles)tile.onDrawBackground();
            java.util.ArrayList<Component> renderers=new java.util.ArrayList<>();
            for(GameObject o:getObjects())if(o.active&&!o.destroyed)for(Component c:o.getComponents())if(c.enabled&&c.created&&!c.removed&&(c instanceof Sprite||c instanceof ShapeRenderer||c instanceof TextRenderer))renderers.add(c);
            renderers.sort((a,b)->{int n=Integer.compare(renderSpace(a),renderSpace(b));if(n==0)n=Integer.compare(renderLayer(a),renderLayer(b));if(n==0)n=Integer.compare(renderOrder(a),renderOrder(b));return n;});
            if(!disposed)for(Component c:renderers){
                GameObject o=c.gameObject;boolean screen=renderSpace(c)==1;double x=o.transform.x+o.transform.visualOffset.x-(screen?0:cameraX),y=o.transform.y+o.transform.visualOffset.y-(screen?0:cameraY);
                UITransform ui=o.getComponent(UITransform.class);if(ui!=null&&ui.enabled){Vector2 center=ui.getCenter();x=center.x;y=center.y;}
                if(c instanceof Sprite){Sprite r=(Sprite)c;GameCanvas.drawSprite(r.texture,x,y,r.width,r.height,o.transform.rotation,o.transform.scale.x*(r.flipX?-1:1),o.transform.scale.y*(r.flipY?-1:1));}
                else if(c instanceof ShapeRenderer){ShapeRenderer r=(ShapeRenderer)c;if("circle".equals(r.shape))GameCanvas.drawCircle(x,y,r.radius,r.color,o.transform.rotation,o.transform.scale.x,o.transform.scale.y);else GameCanvas.drawShape(x,y,r.width,r.height,r.color,o.transform.rotation,o.transform.scale.x,o.transform.scale.y);}
                else c.onDrawUI();
            }
            if (!disposed) GameCanvas.drawDebugState(debug);
            if (!disposed) for (GameObject object : getObjects()) {
                Collider2D collider=object.getComponent(Collider2D.class);
                CharacterController2D controller=object.getComponent(CharacterController2D.class);
                if(object.active && !object.destroyed && (collider!=null && collider.enabled && collider.created || collider==null && controller!=null && controller.enabled && controller.created))
                    GameCanvas.drawCollider(collider instanceof CircleCollider2D ? "circle" : "rect",
                        object.transform.x-cameraX,object.transform.y-cameraY,Physics2D.extent(object,true)*2,Physics2D.extent(object,false)*2,
                        collider!=null && (collider.isTrigger || collider instanceof Trigger2D));
            }
            if(!disposed)onDrawUI();
            if (!disposed) for (GameObject object : getObjects()) for (Component component : object.getComponents())
                if(object.active&&!object.destroyed&&component.created&&component.enabled&&!component.removed&&!(component instanceof TextRenderer))component.onDrawUI();
        } finally { flush(); input.endFrame(); stepping=false; }
    }
    private static int renderSpace(Component c){UITransform ui=c.getComponent(UITransform.class);if(ui!=null&&ui.enabled)return 1;String space=c instanceof Sprite?((Sprite)c).space:c instanceof ShapeRenderer?((ShapeRenderer)c).space:((TextRenderer)c).space;return space.equals("screen")?1:0;}
    private static int renderLayer(Component c){return c instanceof Sprite?((Sprite)c).layer:c instanceof ShapeRenderer?((ShapeRenderer)c).layer:((TextRenderer)c).layer;}
    private static int renderOrder(Component c){return c instanceof Sprite?((Sprite)c).order:c instanceof ShapeRenderer?((ShapeRenderer)c).order:((TextRenderer)c).order;}
    void removed(Component component) { removed.add(component); }
    private void flush() {
        for (Component component : new java.util.ArrayList<>(removed)) { removed.remove(component); component.disposeComponent(); }
        for (GameObject object : getObjects()) if (object.destroyed) { objects.remove(object); object.cleanup(); }
    }
    public final void dispatchContact(GameObject first, GameObject second, boolean trigger) {
        if (disposed || first.game != this || second.game != this) return;
        first.contact(second, trigger); second.contact(first, trigger);
        flush();
    }
    public final void dispose() {
        if (disposed) return;
        disposed = true;
        for (GameObject object : getObjects()) object.destroy();
        flush(); onDestroy();
    }
}
`,
  "GameCanvas.java": `package engine;

public final class GameCanvas {
    private GameCanvas() {}
    private static final StringBuilder frame = new StringBuilder();
    private static final StringBuilder audio = new StringBuilder();
    private static double width = 640;
    private static double height = 480;
    public static double getWidth() { return width; }
    public static double getHeight() { return height; }
    public static void setSize(double nextWidth, double nextHeight) { width = nextWidth; height = nextHeight; }

    /** Komendy audio przeżywają clear(): są czyszczone dopiero przy odczycie ramki. */
    public static void emitAudio(String json) { audio.append("audio|").append(json.replace("|", "/").replace((char) 10, ' ')).append((char) 10); }

    public static void clear(String color) { frame.setLength(0); frame.append("clear|").append(color).append((char) 10); }
    public static void drawRect(double x, double y, double width, double height, String color) { frame.append("rect|").append(x).append('|').append(y).append('|').append(width).append('|').append(height).append('|').append(color).append((char) 10); }
    public static void drawText(String text, double x, double y, String color) { frame.append("text|").append(text.replace("|", "/").replace((char) 10, ' ')).append('|').append(x).append('|').append(y).append('|').append(color).append((char) 10); }
    public static void drawText(String text,double x,double y,double fontSize,String color,String align,String baseline){frame.append("text|").append(text.replace("|","/").replace((char)10,' ')).append('|').append(x).append('|').append(y).append('|').append(color).append('|').append(align).append('|').append(fontSize).append('|').append(baseline).append((char)10);}
    public static void drawCenteredText(String text, double x, double y, String color) { frame.append("text|").append(text.replace("|", "/").replace((char) 10, ' ')).append('|').append(x).append('|').append(y).append('|').append(color).append("|center").append((char) 10); }
    public static void drawShape(double x,double y,double width,double height,String color,double rotation,double scaleX,double scaleY){frame.append("rect|").append(x).append('|').append(y).append('|').append(width).append('|').append(height).append('|').append(color).append('|').append(rotation).append('|').append(scaleX).append('|').append(scaleY).append((char)10);}
    public static void drawCircle(double x,double y,double radius,String color,double rotation,double scaleX,double scaleY){if(!Double.isFinite(radius)||radius<0)throw new IllegalArgumentException("Niepoprawny promien");frame.append("circle|").append(x).append('|').append(y).append('|').append(radius).append('|').append(color).append('|').append(rotation).append('|').append(scaleX).append('|').append(scaleY).append((char)10);}
    public static String frame() { String out = frame.toString() + audio; audio.setLength(0); return out; }
    public static void drawProgressBar(double x,double y,double width,double height,double progress,String border,String track,String fill){frame.append("progress|").append(x).append('|').append(y).append('|').append(width).append('|').append(height).append('|').append(progress).append('|').append(border).append('|').append(track).append('|').append(fill).append((char)10);}
    public static void drawNinePatch(String asset,double x,double y,double width,double height,double border){frame.append("ninepatch|").append(asset).append('|').append(x).append('|').append(y).append('|').append(width).append('|').append(height).append('|').append(border).append((char)10);}
    public static void drawDebugState(boolean enabled) { frame.append("debug|").append(enabled).append((char)10); }
    /** Pozycja lewego górnego rogu widoku kamery — podgląd pokazuje ją jako nakładkę z współrzędnymi. */
    public static void drawView(double x,double y) { frame.append("view|").append(x).append('|').append(y).append((char)10); }
    /** Metadane debugowania: renderer wyświetla je po włączeniu Collidery. */
    public static void drawCollider(String shape,double x,double y,double width,double height,boolean trigger) {
        frame.append("collider|").append(shape).append('|').append(x).append('|').append(y).append('|').append(width).append('|').append(height).append('|').append(trigger).append((char)10);
    }
    public static void drawSprite(String texture, double x, double y, double width, double height) {
        drawSprite(texture, x, y, width, height, 0, 1, 1);
    }
    public static void drawSprite(String texture, double x, double y, double width, double height, double rotation, double scaleX, double scaleY) {
        frame.append("sprite|").append(texture).append('|').append(x).append('|').append(y).append('|').append(width).append('|').append(height)
            .append('|').append(rotation).append('|').append(scaleX).append('|').append(scaleY).append((char) 10);
    }
}
`,
  "Input.java": `package engine;
/** Browser transport facade. Gameplay reads getGame().input. */
public final class Input {
 private static InputManager current=new InputManager();
 private Input(){}
 public static void bind(InputManager input){current=input;}
 public static boolean isKeyDown(String key){return current.isKeyDown(key);}
 public static boolean isKeyPressed(String key){return current.isKeyPressed(key);}
 public static boolean isKeyReleased(String key){return current.isKeyReleased(key);}
 public static void setKey(String key,boolean pressed){current.setKey(key,pressed);}
 public static void endFrame(){current.endFrame();}
}
`,
  "Transform.java": `package engine;

public final class Transform {
    public double x;
    public double y;
    public double rotation;
    public final Vector2 scale = new Vector2(1, 1);
    public final Vector2 visualOffset = new Vector2();

    public Transform(double x, double y) {
        this.x = x;
        this.y = y;
    }
}
`,
  "GameObject.java": `package engine;

public class GameObject {
    public final int id;
    public final Transform transform;
    public String name;
    public boolean active = true;
    public boolean destroyed;
    public final Game game;
    private boolean updating;
    private final java.util.ArrayList<Component> components = new java.util.ArrayList<>();
    private final java.util.ArrayList<Component> removed = new java.util.ArrayList<>();
    private final java.util.ArrayList<ComponentChangeListener> listeners = new java.util.ArrayList<>();
    private final java.util.LinkedHashSet<String> tags=new java.util.LinkedHashSet<>();
    public GameObject addTag(String tag){if(tag==null||tag.trim().isEmpty())throw new IllegalArgumentException("Tag musi byc niepusty");tags.add(tag);if(game!=null)game.updateTagIndex(this,tag,true);return this;}
    public boolean removeTag(String tag){boolean removed=tags.remove(tag);if(removed&&game!=null)game.updateTagIndex(this,tag,false);return removed;}
    public boolean hasTag(String tag){return tags.contains(tag);}
    public java.util.ArrayList<String> getTags(){return new java.util.ArrayList<>(tags);}

    public GameObject(String name, double x, double y) {
        this.id=0;
        this.game = null;
        this.name = name;
        this.transform = new Transform(x, y);
    }
    GameObject(Game game, String name) { this.id=game.allocateObjectId();this.game = game; this.name = name; this.transform = new Transform(0, 0); }
    public GameObject setPosition(double x, double y) { if(!Double.isFinite(x)||!Double.isFinite(y))throw new IllegalArgumentException("Niepoprawna pozycja");if(game!=null&&(transform.x!=x||transform.y!=y))game.spatialRevision++;transform.x = x; transform.y = y; return this; }
    public GameObject setActive(boolean value){if(active!=value){active=value;if(game!=null)game.spatialRevision++;if(!value)for(Button b:getComponents(Button.class))b.blur();}return this;}

    public <T extends Component> T addComponent(T component) {
        if (destroyed) throw new IllegalArgumentException("Obiekt jest usuniety");
        if (component == null) throw new IllegalArgumentException("Komponent nie może być null");
        if (component.gameObject != null) throw new IllegalArgumentException("Komponent jest już podłączony");
        component.attach(this);
        components.add(component);
        if(game!=null)game.spatialRevision++;
        if(game!=null)game.updateComponentIndex(this);
        notifyChange("added", component);
        if (game == null) component.initialize();
        return component;
    }
    public <T extends Component> T getComponent(Class<T> type) {
        if (type == null) throw new IllegalArgumentException("Brak typu komponentu");
        for (Component component : components) if (type.isInstance(component)) return (T) component;
        return null;
    }
    public <T extends Component> T requireComponent(Class<T> type){T c=getComponent(type);if(c==null)throw new IllegalArgumentException(name+": brak "+type.getSimpleName());return c;}
    public java.util.ArrayList<Component> getComponents() { return new java.util.ArrayList<>(components); }
    public <T extends Component> java.util.ArrayList<T> getComponents(Class<T> type) {
        if (type == null) throw new IllegalArgumentException("Brak typu komponentu");
        java.util.ArrayList<T> result = new java.util.ArrayList<>();
        for (Component component : components) if (type.isInstance(component)) result.add((T) component);
        return result;
    }
    public boolean hasComponent(Class<?> type) {
        if (type == null) throw new IllegalArgumentException("Brak typu komponentu");
        for (Component component : components) if (type.isInstance(component)) return true;
        return false;
    }
    public boolean removeComponent(Component component) {
        if (!components.remove(component)) return false;
        component.removed = true;
        if(game!=null)game.spatialRevision++;
        if(game!=null)game.updateComponentIndex(this);
        if (game != null) game.removed(component); else removed.add(component);
        notifyChange("removed", component);
        if (game == null && !updating) flushRemoved();
        return true;
    }
    public boolean removeComponent(Class<?> type) {
        if (type == null) throw new IllegalArgumentException("Brak typu komponentu");
        for (Component component : getComponents()) if (type.isInstance(component)) return removeComponent(component);
        return false;
    }
    public int removeComponents(Class<?> type) {
        if (type == null) throw new IllegalArgumentException("Brak typu komponentu");
        int count = 0;
        for (Component component : getComponents()) if (type.isInstance(component) && removeComponent(component)) count++;
        return count;
    }
    public Runnable onComponentChange(ComponentChangeListener listener) {
        if (listener == null) throw new IllegalArgumentException("Brak listenera");
        listeners.add(listener); return () -> listeners.remove(listener);
    }
    private void notifyChange(String type, Component component) {
        ComponentChange change = new ComponentChange(type, component, this);
        for (ComponentChangeListener listener : new java.util.ArrayList<>(listeners)) listener.onChange(change);
        for (Component observer : getComponents()) if (observer.created && !observer.removed) observer.onComponentChange(change);
    }
    private void flushRemoved() {
        for (Component component : new java.util.ArrayList<>(removed)) { removed.remove(component); component.disposeComponent(); }
    }
    public void destroy() {
        if (destroyed) return;
        destroyed = true;
        if(game!=null)game.spatialRevision++;
        if(game!=null){game.updateComponentIndex(this);for(String tag:getTags())game.updateTagIndex(this,tag,false);}
        if (game == null && !updating) cleanup();
    }
    void cleanup() {
        for (Component component : getComponents()) { component.removed = true; component.disposeComponent(); }
        components.clear(); flushRemoved(); listeners.clear();
    }
    void contact(GameObject other, boolean trigger) {
        for (Component component : getComponents()) {
            if (destroyed || other.destroyed || !active || !other.active) return;
            if (component.created && !component.removed && component.enabled) {
                if (trigger) component.onTrigger(other); else component.onCollision(other);
            }
        }
    }

    public void update(double delta) {
        updateComponents(delta, getComponents());
    }
    void updateComponents(double delta, java.util.ArrayList<Component> snapshot) {
        updating = true;
        try {
            for (Component component : snapshot) {
                if (!active || destroyed || (game != null && game.isDisposed())) break;
                if (!component.removed && component.created && component.enabled) component.onUpdate(delta);
            }
        } finally { updating = false; if (game == null) { flushRemoved(); if (destroyed) cleanup(); } }
    }

    public void draw(String color) {
        if (!active || destroyed) return;
        GameCanvas.drawRect(transform.x, transform.y, 28, 28, color);
        GameCanvas.drawCenteredText(name, transform.x + 14, transform.y + 42, "#d9eff0");
    }
}
`,
};

export const gameCoreApiDescription = [
  { name: "Sprite", methods: "texture, width, height, flipX, flipY, enabled", description: "Tekstura z atlasu; pozycja obiektu oznacza środek sprite’a. flipX odbija lewo/prawo, flipY góra/dół, bez zmiany collidera." },
  { name: "Collider2D", methods: "width, height, layer, mask, isTrigger, onContactEnter, enabled", description: "Jawna prostokątna bryła, niezależna od grafiki. onContactEnter(Player.class, callback) reaguje raz na wejście w kontakt." },
  { name: "Trigger2D", methods: "onTrigger, enabled", description: "Kontakt bez blokowania ruchu; regułę kontaktu piszesz we własnym komponencie." },
  { name: "CharacterController2D", methods: "move, velocity, constrainToBounds, onAfterMove, enabled", description: "move normalizuje kierunek; prędkość w px/s. Granice świata ustawia game.setWorldBounds." },
  { name: "Transform", methods: "x, y, rotation, scale, visualOffset", description: "Pozycja środka świata, obrót w radianach i skala obrazu. Skala grafiki nie zmienia collidera." },
  { name: "Game", methods: "createObject, find, getObjects, getObjectsWith, getObjectsWithTag, pause, resume, isPaused, setWorldBounds, time, input, physics, canvas", description: "Scena i cykl życia onCreate/onUpdate/onDrawUI/onDestroy. getObjectsWith(Player.class, Collider2D.class) zwraca kopię wyników indeksu." },
  { name: "GameCanvas", methods: "clear, drawRect, drawText, drawCenteredText, drawSprite, getWidth, getHeight", description: "Rysowanie i rozmiar planszy. Stała rozdzielczość logiczna 640×480 px; ekran skaluje ją letterboxem." },
  { name: "Audio", methods: "game.audio.play(song, loop), game.audio.playNote(\"C4\", beats, wave), game.audio.stop()", description: "Syntezator. Nuty C4, C#4, Db4; pauza \"-\"; czas w taktach; fale square, triangle, sine, sawtooth, noise." },
  { name: "Song / Sequencer", methods: "new Song(tempo).sequencer(\"square\").notes(\"C4:1 E4:0.5 -:2\")", description: "Utwór z tempem BPM i równoległymi śladami. sequencer() zwraca ścieżkę: note, rest, notes, duration." },
  { name: "GameObject", methods: "id, setPosition, addComponent, getComponent, getComponents, hasComponent, requireComponent, removeComponent, removeComponents, onComponentChange, addTag, removeTag, hasTag, getTags, destroy", description: "Obiekt sceny ze stabilnym ID. Brak komponentu oznacza null; listy wyników są kopiami." },
  { name: "Component", methods: "onCreate, onUpdate, onLateUpdate, onDestroy, onCollision, onTrigger, onComponentChange, getComponent, getComponents, hasComponent, removeComponents, requireComponent, getGame, enabled, updateMode, gameObject, transform", description: "Własne zachowanie obiektu. updateMode WORLD zatrzymuje się przy pauzie, UI działa nadal." },
];
