export const gameControllersRuntimeFiles = {
  'TopDownCharacterController2D.java': `package engine;
/** Ruch po obu osiach bez grawitacji. Nie odczytuje klawiszy. */
public class TopDownCharacterController2D extends CharacterController2D {
    public double walkSpeed = 120;
    public double runSpeed = 240;
    protected boolean running;
    @Override public void move(double x, double y) { move(x,y,running?runSpeed:walkSpeed); }
    @Override public void move(double x, double y, double speed) {
        if (!Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(speed) || speed<0)
            throw new IllegalArgumentException("Niepoprawny ruch postaci");
        super.move(x,y,speed);
        running = speed>walkSpeed;
        Sprite sprite=getComponent(Sprite.class);
        if (sprite!=null && velocity.x!=0) sprite.flipX=velocity.x<0;
    }
    public void walk(double x,double y) { move(x,y,walkSpeed); }
    public void run(double x,double y) { move(x,y,runSpeed); }
    public void stop() { move(0,0,0); }
    public void setRunning(boolean value) {
        double x=velocity.x,y=velocity.y;
        move(x,y,value?runSpeed:walkSpeed);
        running=value;
    }
    public boolean isWalk() { return enabled && !running && (velocity.x!=0 || velocity.y!=0); }
    public boolean isRunning() { return enabled && running && (velocity.x!=0 || velocity.y!=0); }
}
`,
  'PlatformerCharacterController2D.java': `package engine;
/** Ruch poziomy, grawitacja i skok. Najlepiej używać prostokątnych colliderów. */
public class PlatformerCharacterController2D extends TopDownCharacterController2D {
    public double gravity = 900;
    public double jumpSpeed = 340;
    public double maxFallSpeed = 600;
    private double verticalSpeed;
    private boolean grounded;
    @Override public void onCreate() { onAfterMove(0); }
    @Override public void move(double x,double y,double speed) {
        super.move(x,0,speed);
        velocity.y=verticalSpeed;
    }
    public void walk(double x) { move(x,0,walkSpeed); }
    public void run(double x) { move(x,0,runSpeed); }
    @Override public void onUpdate(double delta) {
        if(!Double.isFinite(gravity)||gravity<0||!Double.isFinite(jumpSpeed)||jumpSpeed<=0||!Double.isFinite(maxFallSpeed)||maxFallSpeed<=0)
            throw new IllegalArgumentException("Niepoprawne parametry platformera");
        verticalSpeed=Math.min(maxFallSpeed,verticalSpeed+gravity*delta);
        velocity.y=verticalSpeed;
    }
    public boolean jump() {
        if (!enabled || !isGrounded()) return false;
        verticalSpeed=-jumpSpeed;velocity.y=verticalSpeed;grounded=false;return true;
    }
    public boolean isGrounded() { if(created&&gameObject!=null&&gameObject.active&&!gameObject.destroyed)onAfterMove(0);return grounded; }
    @Override public boolean isWalk() { return enabled && !running && velocity.x!=0; }
    @Override public boolean isRunning() { return enabled && running && velocity.x!=0; }
    private boolean solidAt(double offset) {
        double original=gameObject.transform.y;
        gameObject.transform.y+=offset;
        try {
            if(getGame()==null)return false;
            double radius=Math.hypot(Physics2D.extent(gameObject,true),Physics2D.extent(gameObject,false))+Math.abs(offset);
            for(GameObject other:getGame().physics.queryRadius(gameObject.transform.x,gameObject.transform.y,radius,0x7fffffff)) {
                Collider2D collider=other.getComponent(Collider2D.class);
                if(other!=gameObject && other.active && !other.destroyed && collider!=null && collider.enabled
                    && !collider.isTrigger && !(collider instanceof Trigger2D) && Physics2D.overlaps(gameObject,other)) return true;
            }
            return false;
        } finally { gameObject.transform.y=original; }
    }
    @Override public void onAfterMove(double delta) {
        double extent=Physics2D.extent(gameObject,false);
        double[] bounds=getGame().worldBounds;
        grounded=verticalSpeed>=0 && (solidAt(0.01) || constrainToBounds && bounds!=null && gameObject.transform.y>=bounds[1]+bounds[3]-extent-0.01);
        boolean ceiling=verticalSpeed<0 && (solidAt(-0.01) || constrainToBounds && bounds!=null && gameObject.transform.y<=bounds[1]+extent+0.01);
        if(grounded || ceiling){verticalSpeed=0;velocity.y=0;}
    }
}
`,
};
