export const gamePhysicsRuntimeFiles = {
  'Physics2D.java': `package engine;
public final class Physics2D {
    private final Game game;
    public int candidates,narrowPhaseTests;
    public static final class Stats {public int candidates,narrowPhaseTests;}
    public final Stats stats=new Stats();
    private java.util.HashSet<Long> previousContacts=new java.util.HashSet<>();
    private SpatialHash2D queryIndex;
    private long queryRevision=-1;
    void beginFrame(){queryIndex=null;}
    public void refresh(){queryIndex=build(game.getObjects());queryRevision=game.spatialRevision;}
    private SpatialHash2D queryIndex(){if(!game.isStepping()||queryIndex==null||queryRevision!=game.spatialRevision)refresh();return queryIndex;}
    public Physics2D(Game game) {this.game=game;}
    private static boolean live(GameObject o){return o.active&&!o.destroyed;}
    private static Collider2D collider(GameObject o){return o.getComponent(Collider2D.class);}
    public static double extent(GameObject o,boolean x) {
        Collider2D c=collider(o);
        if(c instanceof CircleCollider2D){double r=((CircleCollider2D)c).radius;if(!Double.isFinite(r)||r<=0)throw new IllegalArgumentException("Niepoprawny promien");return r;}
        return c==null?16:(x?c.width:c.height)/2;
    }
    private static boolean circle(GameObject o){return collider(o) instanceof CircleCollider2D;}
    private static double clamp(double x,double min,double max){return Math.max(min,Math.min(max,x));}
    public static boolean overlaps(GameObject a,GameObject b) {
        return overlaps(a,b,1e-6);
    }
    private static boolean overlaps(GameObject a,GameObject b,double margin) {
        double dx=a.transform.x-b.transform.x,dy=a.transform.y-b.transform.y;
        if(circle(a)&&circle(b)){double r=extent(a,true)+extent(b,true)+margin;return dx*dx+dy*dy<=r*r;}
        if(circle(a)||circle(b)) {
            GameObject c=circle(a)?a:b,box=circle(a)?b:a;double r=extent(c,true)+margin;
            double x=c.transform.x-clamp(c.transform.x,box.transform.x-extent(box,true),box.transform.x+extent(box,true));
            double y=c.transform.y-clamp(c.transform.y,box.transform.y-extent(box,false),box.transform.y+extent(box,false));
            return x*x+y*y<=r*r;
        }
        return Math.abs(dx)<=extent(a,true)+extent(b,true)+margin&&Math.abs(dy)<=extent(a,false)+extent(b,false)+margin;
    }
    /** Signed surface distance: positive = gap, negative = penetration depth. */
    private static double separation(GameObject a,GameObject b) {
        double dx=a.transform.x-b.transform.x,dy=a.transform.y-b.transform.y;
        if(circle(a)&&circle(b))return Math.hypot(dx,dy)-(extent(a,true)+extent(b,true));
        if(circle(a)||circle(b)) {
            GameObject c=circle(a)?a:b,box=circle(a)?b:a;
            double x=c.transform.x-clamp(c.transform.x,box.transform.x-extent(box,true),box.transform.x+extent(box,true));
            double y=c.transform.y-clamp(c.transform.y,box.transform.y-extent(box,false),box.transform.y+extent(box,false));
            return Math.hypot(x,y)-extent(c,true);
        }
        return Math.max(Math.abs(dx)-(extent(a,true)+extent(b,true)),Math.abs(dy)-(extent(a,false)+extent(b,false)));
    }
    private static boolean body(GameObject o) {
        Collider2D c=collider(o);CharacterController2D v=o.getComponent(CharacterController2D.class);
        return c!=null?c.enabled&&c.created:v!=null&&v.enabled&&v.created;
    }
    private static boolean trigger(GameObject o){Collider2D c=collider(o);return c!=null&&(c.isTrigger||c instanceof Trigger2D);}
    private static boolean ignored(GameObject a,GameObject b){Projectile2D p=a.getComponent(Projectile2D.class),q=b.getComponent(Projectile2D.class);return p!=null&&p.owner==b||q!=null&&q.owner==a;}
    private static double circleHit(double sx,double sy,double dx,double dy,double cx,double cy,double r) {
        double x=sx-cx,y=sy-cy,c=x*x+y*y-r*r;if(c<=0)return 0;
        double a=dx*dx+dy*dy,b=2*(x*dx+y*dy),disc=b*b-4*a*c;
        if(a==0||disc<0)return 2;double t=(-b-Math.sqrt(disc))/(2*a);return t>=0&&t<=1?t:2;
    }
    private static double rectHit(double sx,double sy,double dx,double dy,double x,double y,double w,double h) {
        double entry=0,exit=1;
        for(int axis=0;axis<2;axis++) {
            double p=axis==0?sx:sy,d=axis==0?dx:dy,lo=(axis==0?x:y)-(axis==0?w:h),hi=(axis==0?x:y)+(axis==0?w:h);
            if(d==0){if(p<lo||p>hi)return 2;continue;}
            double a=(lo-p)/d,b=(hi-p)/d;entry=Math.max(entry,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));if(entry>exit)return 2;
        }
        return entry;
    }
    private static double roundedRectHit(double sx,double sy,double dx,double dy,double x,double y,double w,double h,double r) {
        double t=Math.min(rectHit(sx,sy,dx,dy,x,y,w+r,h),rectHit(sx,sy,dx,dy,x,y,w,h+r));
        for(int i=-1;i<=1;i+=2)for(int j=-1;j<=1;j+=2)t=Math.min(t,circleHit(sx,sy,dx,dy,x+i*w,y+j*h,r));
        return t;
    }
    private static double hit(GameObject shot,GameObject other,double dx,double dy) {
        double sx=shot.transform.x,sy=shot.transform.y,x=other.transform.x,y=other.transform.y;
        if(circle(shot)&&circle(other))return circleHit(sx,sy,dx,dy,x,y,extent(shot,true)+extent(other,true));
        if(circle(shot))return roundedRectHit(sx,sy,dx,dy,x,y,extent(other,true),extent(other,false),extent(shot,true));
        if(circle(other))return roundedRectHit(sx,sy,dx,dy,x,y,extent(shot,true),extent(shot,false),extent(other,true));
        return rectHit(sx,sy,dx,dy,x,y,extent(shot,true)+extent(other,true),extent(shot,false)+extent(other,false));
    }
    private static double axisExtent(GameObject moving,GameObject other,boolean x) {
        double perpendicular=Math.abs(x?moving.transform.y-other.transform.y:moving.transform.x-other.transform.x);
        if(circle(moving)&&circle(other)) {double r=extent(moving,true)+extent(other,true);return Math.sqrt(Math.max(0,r*r-perpendicular*perpendicular));}
        if(circle(moving)||circle(other)) {
            GameObject c=circle(moving)?moving:other,box=circle(moving)?other:moving;
            double r=extent(c,true),gap=Math.max(0,perpendicular-extent(box,!x));
            return extent(box,x)+Math.sqrt(Math.max(0,r*r-gap*gap));
        }
        return extent(moving,x)+extent(other,x);
    }
    private static boolean masks(GameObject a,GameObject b){Collider2D x=collider(a),y=collider(b);return x!=null&&y!=null&&(x.mask&y.layer)!=0&&(y.mask&x.layer)!=0;}
    private static boolean ready(GameObject o){Collider2D c=collider(o);return live(o)&&c!=null&&c.created&&c.enabled;}
    private static SpatialHash2D build(java.util.ArrayList<GameObject> objects){SpatialHash2D grid=new SpatialHash2D();for(GameObject o:objects)if(ready(o))grid.update(o);return grid;}
    private static java.util.ArrayList<GameObject> around(SpatialHash2D grid,GameObject o,double dx,double dy){return grid.query(o.transform.x+Math.min(0,dx)-extent(o,true),o.transform.y+Math.min(0,dy)-extent(o,false),o.transform.x+Math.max(0,dx)+extent(o,true),o.transform.y+Math.max(0,dy)+extent(o,false));}
    public java.util.ArrayList<GameObject> queryRadius(double x,double y,double radius,int layer){
        if(!Double.isFinite(x)||!Double.isFinite(y)||!Double.isFinite(radius)||radius<0)throw new IllegalArgumentException("Niepoprawne zapytanie");
        SpatialHash2D grid=queryIndex();java.util.ArrayList<GameObject> result=new java.util.ArrayList<>();
        for(GameObject o:grid.query(x-radius,y-radius,x+radius,y+radius))if(ready(o)&&(collider(o).layer&layer)!=0){
            double dx=x-o.transform.x,dy=y-o.transform.y;
            if(circle(o)){double r=radius+extent(o,true)+1e-6;if(dx*dx+dy*dy<=r*r)result.add(o);}
            else{double rx=x-clamp(x,o.transform.x-extent(o,true),o.transform.x+extent(o,true)),ry=y-clamp(y,o.transform.y-extent(o,false),o.transform.y+extent(o,false));if(rx*rx+ry*ry<=(radius+1e-6)*(radius+1e-6))result.add(o);}
        }return result;
    }
    public GameObject findNearest(double x,double y,double radius,int layer){GameObject best=null;double distance=Double.POSITIVE_INFINITY;for(GameObject o:queryRadius(x,y,radius,layer)){double dx=o.transform.x-x,dy=o.transform.y-y,d=dx*dx+dy*dy;if(d<distance){distance=d;best=o;}}return best;}
    private static void dispatch(Game game,java.util.HashSet<Long> sent,GameObject a,GameObject b,boolean sensor){long key=((long)Math.min(a.id,b.id)<<32)|(Math.max(a.id,b.id)&0xffffffffL);if(ready(a)&&ready(b)&&sent.add(key)){if(!game.physics.previousContacts.contains(key)){collider(a).fireContactEnter(b);if(ready(a)&&ready(b))collider(b).fireContactEnter(a);}if(ready(a)&&ready(b))game.dispatchContact(a,b,sensor);}}
    static void step(Game game,java.util.ArrayList<GameObject> objects,double delta) {
        SpatialHash2D grid=build(objects);game.physics.queryIndex=grid;game.physics.queryRevision=game.spatialRevision;java.util.HashSet<Long> sent=new java.util.HashSet<>();game.physics.candidates=game.physics.narrowPhaseTests=0;game.physics.stats.candidates=game.physics.stats.narrowPhaseTests=0;
        for(GameObject o:objects){
            CharacterController2D v=o.getComponent(CharacterController2D.class);if(!ready(o)||v==null||!v.enabled||!v.created)continue;
            double dx=v.velocity.x*delta,dy=v.velocity.y*delta;
            Projectile2D p=o.getComponent(Projectile2D.class);
            if(p!=null&&p.enabled){
                double sx=o.transform.x,sy=o.transform.y;java.util.ArrayList<GameObject> targets=new java.util.ArrayList<>();java.util.HashMap<GameObject,Double> times=new java.util.HashMap<>();
                for(GameObject other:around(grid,o,dx,dy)){game.physics.candidates++;game.physics.stats.candidates++;if(other==o||!ready(other)||!masks(o,other)||ignored(o,other)||(collider(other).layer&p.hitLayers)==0||p.hitObjects.contains(other.id))continue;game.physics.narrowPhaseTests++;game.physics.stats.narrowPhaseTests++;double t=hit(o,other,dx,dy);if(t<=1){targets.add(other);times.put(other,t);}}
                targets.sort((a,b)->{int n=Double.compare(times.get(a),times.get(b));return n==0?Integer.compare(a.id,b.id):n;});
                for(GameObject target:targets){if(!ready(o)||!ready(target))continue;double t=times.get(target);o.setPosition(sx+dx*t,sy+dy*t);dispatch(game,sent,o,target,true);p.hitObjects.add(target.id);p.hits++;if(p.hits>=p.maxHits)o.destroy();}
                if(live(o)){o.setPosition(sx+dx,sy+dy);p.finishFrame(delta);}
            }else for(int axis=0;axis<2&&live(o);axis++){
                double movement=axis==0?dx:dy;if(movement==0)continue;double mx=axis==0?movement:0,my=axis==1?movement:0,travel=1;
                java.util.ArrayList<GameObject> targets=new java.util.ArrayList<>();java.util.HashMap<GameObject,Double> times=new java.util.HashMap<>();
                for(GameObject other:around(grid,o,mx,my)){game.physics.candidates++;game.physics.stats.candidates++;if(other==o||!ready(other)||!masks(o,other)||ignored(o,other))continue;Projectile2D q=other.getComponent(Projectile2D.class);if(q!=null&&q.enabled)continue;
                    game.physics.narrowPhaseTests++;game.physics.stats.narrowPhaseTests++;double origin=axis==0?o.transform.x:o.transform.y,before=separation(o,other);if(axis==0)o.transform.x+=Math.signum(movement)*4e-6;else o.transform.y+=Math.signum(movement)*4e-6;boolean entering=overlaps(o,other,-1e-6)&&separation(o,other)<before-1e-9;if(axis==0)o.transform.x=origin;else o.transform.y=origin;
                    double t=hit(o,other,mx,my);if(t>1||t==0&&!entering)continue;targets.add(other);times.put(other,t);if(!trigger(o)&&!trigger(other))travel=Math.min(travel,t);
                }
                if(axis==0)o.transform.x+=movement*travel;else o.transform.y+=movement*travel;
                targets.sort((a,b)->{int n=Double.compare(times.get(a),times.get(b));return n==0?Integer.compare(a.id,b.id):n;});
                for(GameObject target:targets)if(times.get(target)<=travel+1e-6)dispatch(game,sent,o,target,trigger(o)||trigger(target));
            }
            if(live(o)&&v.constrainToBounds&&game.worldBounds!=null){double[] b=game.worldBounds;double w=Math.min(extent(o,true),b[2]/2),h=Math.min(extent(o,false),b[3]/2);o.transform.x=clamp(o.transform.x,b[0]+w,b[0]+b[2]-w);o.transform.y=clamp(o.transform.y,b[1]+h,b[1]+b[3]-h);}
            if(ready(o))grid.update(o);else grid.remove(o);game.physics.queryRevision=game.spatialRevision;if(live(o)&&v.enabled)v.onAfterMove(delta);if(game.isDisposed())return;
        }
        for(GameObject a:objects)if(ready(a)&&a.getComponent(Projectile2D.class)==null)for(GameObject b:around(grid,a,0,0)){
            if(!ready(a)||b.id<=a.id||!ready(b)||!masks(a,b)||ignored(a,b)||b.getComponent(Projectile2D.class)!=null)continue;game.physics.candidates++;game.physics.stats.candidates++;game.physics.narrowPhaseTests++;game.physics.stats.narrowPhaseTests++;if(overlaps(a,b))dispatch(game,sent,a,b,trigger(a)||trigger(b));if(game.isDisposed())return;
        }
        game.physics.previousContacts=new java.util.HashSet<>(sent);
    }
}
`,
};
