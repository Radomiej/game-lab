export const gameExtrasRuntimeFiles = {
  'CircleCollider2D.java': `package engine;
/** Koło o promieniu w pikselach świata, niezależnym od skali sprite'a. */
public class CircleCollider2D extends Collider2D {
    public double radius;
    public CircleCollider2D(double radius) {
        if (!Double.isFinite(radius) || radius <= 0) throw new IllegalArgumentException("Promien musi byc dodatni i skonczony");
        this.radius = radius;
    }
}
`,
  'TileMap.java': `package engine;
/** Kafelki tła. Nie tworzy colliderów; przeszkody dodajesz osobno. */
public class TileMap extends Component {
    public TileMap(Assets asset,double tileSize){this(asset.key(),tileSize);}
    public String texture;
    public double tileSize;
    public int layer=-100,order=0;
    public TileMap(String texture, double tileSize) { this.texture = texture; this.tileSize = tileSize; }
    @Override public void onDrawBackground() {
        if (!Double.isFinite(tileSize) || tileSize < 8) throw new IllegalArgumentException("Rozmiar kafelka musi wynosic co najmniej 8");
        Vector2 view=getGame().getCameraView();int firstRow=(int)Math.floor(view.y/tileSize),firstColumn=(int)Math.floor(view.x/tileSize);
        int rows=(int)Math.ceil(GameCanvas.getHeight()/tileSize)+1,columns=(int)Math.ceil(GameCanvas.getWidth()/tileSize)+1;
        for (int row=firstRow; row<=firstRow+rows; row++)
            for (int column=firstColumn; column<=firstColumn+columns; column++) {
                int variant=(column*31+row*17+column*row*7)&3;
                boolean grass=texture.equals("grass");
                GameCanvas.drawSprite(texture,(column+0.5)*tileSize-view.x,(row+0.5)*tileSize-view.y,tileSize,tileSize,
                    0,grass&&(variant&1)!=0?-1:1,grass&&(variant&2)!=0?-1:1);
            }
    }
}
`,
  'Steering2D.java': `package engine;
/** Bazowy generator kierunku AI. Jeden aktywny na obiekt. */
public abstract class Steering2D extends Component {
    public GameObject target;
    public double speed = 100;
    protected Steering2D(GameObject target) { this.target = target; }
    protected abstract Vector2 direction(double x, double y, double distance);
    @Override public void onUpdate(double delta) {
        int generators=0;
        for (Steering2D steering : getComponents(Steering2D.class)) if (steering.enabled) generators++;
        if (generators>1) throw new IllegalArgumentException("Obiekt ma kilka aktywnych zachowan AI");
        CharacterController2D controller=requireComponent(CharacterController2D.class);
        if (target==null || target.destroyed || !target.active || target.game!=getGame()) { controller.move(0,0); return; }
        if (!Double.isFinite(speed) || speed<0) throw new IllegalArgumentException("Niepoprawna predkosc AI");
        double x=target.transform.x-gameObject.transform.x,y=target.transform.y-gameObject.transform.y;
        Vector2 d=direction(x,y,Math.sqrt(x*x+y*y));
        ObstacleAvoidance2D avoidance=getComponent(ObstacleAvoidance2D.class);
        if (avoidance!=null && avoidance.enabled) d=avoidance.steer(d.x,d.y);
        controller.move(d.x,d.y,speed);
        Sprite sprite=getComponent(Sprite.class);
        if (sprite!=null && d.x!=0) sprite.flipX=d.x<0;
    }
}
`,
  'FollowTarget2D.java': `package engine;
public class FollowTarget2D extends Steering2D {
    public double stopDistance = 32;
    public FollowTarget2D(GameObject target) { super(target); }
    @Override protected Vector2 direction(double x,double y,double distance) {
        if(!Double.isFinite(stopDistance)||stopDistance<0)throw new IllegalArgumentException("Niepoprawny dystans");
        return distance<=stopDistance ? new Vector2() : new Vector2(x,y);
    }
}
`,
  'FleeTarget2D.java': `package engine;
public class FleeTarget2D extends Steering2D {
    public double safeDistance = 200;
    public FleeTarget2D(GameObject target) { super(target); }
    @Override protected Vector2 direction(double x,double y,double distance) {
        if(!Double.isFinite(safeDistance)||safeDistance<0)throw new IllegalArgumentException("Niepoprawny dystans");
        return distance>=safeDistance ? new Vector2() : distance==0 ? new Vector2(1,0) : new Vector2(-x,-y);
    }
}
`,
  'FlankTarget2D.java': `package engine;
public class FlankTarget2D extends Steering2D {
    public double radius = 100;
    public boolean clockwise = true;
    public FlankTarget2D(GameObject target) { super(target); }
    @Override protected Vector2 direction(double x,double y,double distance) {
        if(!Double.isFinite(radius)||radius<0)throw new IllegalArgumentException("Niepoprawny dystans");
        if (distance==0) return new Vector2(1,0);
        double radial=(distance-radius)/Math.max(1,radius),side=clockwise?1:-1;
        return new Vector2(x/distance*radial-y/distance*side,y/distance*radial+x/distance*side);
    }
}
`,
  'ObstacleAvoidance2D.java': `package engine;
/** Lokalne omijanie colliderów. Nie wyszukuje drogi w labiryncie. */
public class ObstacleAvoidance2D extends Component {
    public double lookAhead = 80;
    public double weight = 2;
    public Vector2 steer(double x,double y) {
        if(!Double.isFinite(x)||!Double.isFinite(y))throw new IllegalArgumentException("Niepoprawny kierunek");
        if (!Double.isFinite(lookAhead) || lookAhead<=0 || !Double.isFinite(weight) || weight<0)
            throw new IllegalArgumentException("Niepoprawne parametry omijania");
        double length=Math.sqrt(x*x+y*y); if(length==0) return new Vector2();
        double dx=x/length,dy=y/length;
        double radius=lookAhead+Math.max(Physics2D.extent(gameObject,true),Physics2D.extent(gameObject,false))+8;
        for(GameObject other:getGame().physics.queryRadius(gameObject.transform.x,gameObject.transform.y,radius,0x7fffffff)) {
            Collider2D collider=other.getComponent(Collider2D.class);
            if(other==gameObject || !other.active || other.destroyed || collider==null || !collider.enabled || collider.isTrigger || collider instanceof Trigger2D) continue;
            double ox=other.transform.x-gameObject.transform.x,oy=other.transform.y-gameObject.transform.y;
            double ahead=ox*dx+oy*dy,side=ox*(-dy)+oy*dx;
            double clearance=Math.abs(dy)*(Physics2D.extent(other,true)+Physics2D.extent(gameObject,true))
                +Math.abs(dx)*(Physics2D.extent(other,false)+Physics2D.extent(gameObject,false))+8;
            double forward=Math.abs(dx)*Physics2D.extent(other,true)+Math.abs(dy)*Physics2D.extent(other,false);
            if(ahead>=0 && ahead<lookAhead+forward && Math.abs(side)<clearance) {
                double sign=side>=0?-1:1;
                return new Vector2(dx-dy*sign*weight,dy+dx*sign*weight);
            }
        }
        return new Vector2(dx,dy);
    }
}
`,
  'Projectile2D.java': `package engine;
/** Lot i czas życia; skutki trafienia piszesz w onTrigger swojej klasy. */
public class Projectile2D extends Component {
    public int maxHits=1,hits,hitLayers=0x7fffffff;
    final java.util.HashSet<Integer> hitObjects=new java.util.HashSet<>();
    public final Vector2 direction;
    public double speed, remainingLifetime;
    public final GameObject owner;
    public Projectile2D(double x,double y,double speed,double lifetime,GameObject owner) {
        if(!Double.isFinite(x)||!Double.isFinite(y)||!Double.isFinite(speed)||speed<0||!Double.isFinite(lifetime)||lifetime<0)
            throw new IllegalArgumentException("Niepoprawne parametry pocisku");
        direction=new Vector2(x,y).normalized();this.speed=speed;this.remainingLifetime=lifetime;this.owner=owner;
    }
    @Override public void onCreate() {
        if(!hasComponent(CharacterController2D.class)) gameObject.addComponent(new CharacterController2D());
        requireComponent(CharacterController2D.class).constrainToBounds=false;
        if(!hasComponent(Collider2D.class)) { CircleCollider2D collider=gameObject.addComponent(new CircleCollider2D(4));collider.isTrigger=true; }
    }
    @Override public void onUpdate(double delta) {
        if(!Double.isFinite(speed)||speed<0||!Double.isFinite(remainingLifetime)||remainingLifetime<0) throw new IllegalArgumentException("Niepoprawny pocisk");
        if(remainingLifetime==0) {gameObject.destroy();return;}
        // A final fractional frame travels only for the remaining lifetime.
        requireComponent(CharacterController2D.class).move(direction.x,direction.y,delta==0?speed:speed*Math.min(delta,remainingLifetime)/delta);
    }
    void finishFrame(double delta) { remainingLifetime=Math.max(0,remainingLifetime-delta);if(remainingLifetime==0)gameObject.destroy(); }
}
`,
  'Tween.java': `package engine;
/** Animacja kontrolowana przez Game.step; cancel zatrzymuje ją w aktualnej pozycji. */
public class Tween extends Component {
    public final String property;
    public String easing = "linear";
    public boolean completed;
    public boolean cancelled;
    private final java.util.ArrayList<Runnable> callbacks=new java.util.ArrayList<>();
    public Tween onComplete(Runnable callback){if(callback==null)throw new IllegalArgumentException("Brak callback");if(completed)callback.run();else if(!cancelled)callbacks.add(callback);return this;}
    private double elapsed, duration, fromX, fromY, toX, toY, offsetX, offsetY;
    Tween(GameObject object,String property,double x,double y,double duration) {
        if(!Double.isFinite(duration)||duration<0||!Double.isFinite(x)||!Double.isFinite(y))throw new IllegalArgumentException("Niepoprawny tween");
        this.property=property;this.duration=duration;toX=x;toY=y;
        if(property.equals("scale")){fromX=object.transform.scale.x;fromY=object.transform.scale.y;}
        else if(property.equals("rotation")){fromX=object.transform.rotation;}
        else {fromX=object.transform.x;fromY=object.transform.y;}
    }
    private void clearOffset() {gameObject.transform.visualOffset.x-=offsetX;gameObject.transform.visualOffset.y-=offsetY;offsetX=offsetY=0;}
    @Override public void onUpdate(double delta) {
        if(completed||cancelled)return;
        elapsed=Math.min(duration,elapsed+delta);
        double t=duration==0?1:elapsed/duration;
        if(!easing.equals("linear")&&!easing.equals("smooth"))throw new IllegalArgumentException("Easing: linear lub smooth");
        double p=easing.equals("smooth")?t*t*(3-2*t):t;
        if(property.equals("shake")) {
            clearOffset();offsetX=t==1?0:Math.sin(elapsed*47)*toX*(1-t);offsetY=t==1?0:Math.cos(elapsed*39)*toX*(1-t);
            gameObject.transform.visualOffset.x+=offsetX;gameObject.transform.visualOffset.y+=offsetY;
        } else if(property.equals("position")){gameObject.transform.x=fromX+(toX-fromX)*p;gameObject.transform.y=fromY+(toY-fromY)*p;}
        else if(property.equals("scale")){gameObject.transform.scale.x=fromX+(toX-fromX)*p;gameObject.transform.scale.y=fromY+(toY-fromY)*p;}
        else gameObject.transform.rotation=fromX+(toX-fromX)*p;
        if(t==1){completed=true;java.util.ArrayList<Runnable> ready=new java.util.ArrayList<>(callbacks);callbacks.clear();gameObject.removeComponent(this);for(Runnable callback:ready)callback.run();}
    }
    public void cancel() {if(completed||cancelled)return;cancelled=true;callbacks.clear();clearOffset();gameObject.removeComponent(this);}
    @Override public void onDestroy() {clearOffset();if(!completed){cancelled=true;callbacks.clear();}}
}
`,
  'Tweens.java': `package engine;
public final class Tweens {
    private Tweens() {}
    private static Tween add(GameObject object,String property,double x,double y,double seconds) {
        if(object==null||object.destroyed)throw new IllegalArgumentException("Brak aktywnego obiektu tweena");
        Tween next=new Tween(object,property,x,y,seconds);
        for(Tween old:object.getComponents(Tween.class))if(old.property.equals(property))old.cancel();
        object.addComponent(next);if(seconds==0)next.onUpdate(0);return next;
    }
    public static Tween position(GameObject object,double x,double y,double seconds){return add(object,"position",x,y,seconds);}
    public static Tween scale(GameObject object,double x,double y,double seconds){return add(object,"scale",x,y,seconds);}
    public static Tween rotation(GameObject object,double radians,double seconds){return add(object,"rotation",radians,0,seconds);}
    public static Tween shake(GameObject object,double strength,double seconds){return add(object,"shake",strength,0,seconds);}
}
`,
  'Camera2D.java': `package engine;
/** Kamera zmienia tylko renderowanie świata. HUD pozostaje nieruchomy. */
public class Camera2D extends Component {
    public double offsetX, offsetY;
    private double remaining,strength,time;
    private GameObject target;
    public void follow(GameObject target){if(target==null||target.destroyed||target.game!=getGame())throw new IllegalArgumentException("Cel kamery z innej sceny");this.target=target;}
    public void stopFollowing(){target=null;}
    public Vector2 getView(){boolean live=target!=null&&target.active&&!target.destroyed;return new Vector2((live?target.transform.x-getGame().getViewportWidth()/2:0)+offsetX+(remaining>0?Math.sin(time*47)*strength:0),(live?target.transform.y-getGame().getViewportHeight()/2:0)+offsetY+(remaining>0?Math.cos(time*39)*strength:0));}
    public Vector2 worldToScreen(Vector2 p){Vector2 v=getView();return new Vector2(p.x-v.x,p.y-v.y);}
    public Vector2 screenToWorld(Vector2 p){Vector2 v=getView();return new Vector2(p.x+v.x,p.y+v.y);}
    public void shake(double strength,double seconds) {
        if(!Double.isFinite(strength)||strength<0||!Double.isFinite(seconds)||seconds<0)throw new IllegalArgumentException("Niepoprawny shake kamery");
        this.strength=strength;remaining=seconds;time=0;
    }
    @Override public void onUpdate(double delta) {
        remaining=Math.max(0,remaining-delta);time+=delta;
    }
    public void stopShake(){remaining=0;}
}
`,
};
