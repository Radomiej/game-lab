// Self-contained factory: the same function is serialized into the editor iframe.
export function createAddons(types) {
  const {Component,GameObject,Vector2,CharacterController2D,Sprite,Collider2D,CircleCollider2D,Trigger2D}=types;
  for(const type of [Component,GameObject,Vector2,CharacterController2D,Sprite,Collider2D,CircleCollider2D,Trigger2D])if(typeof type!=='function')throw new Error('Missing addon engine type');
  const finite=(value,label,min=0)=>{if(!Number.isFinite(value)||value<min)throw new Error(`Invalid ${label}`);return value;};
  const extent=(object,x)=>{const c=object.getComponent(Collider2D);return c instanceof CircleCollider2D?c.radius:(c?(x?c.width:c.height)/2:16);};
  const keyValid=key=>typeof key==='string'&&key.length>0;
  class Steering2D extends Component {
    constructor(target){super();if(new.target===Steering2D)throw new Error('Steering2D requires a direction implementation');if(target!==null&&!(target instanceof GameObject))throw new Error('Target must be a GameObject or null');this.target=target;this.speed=100;}
    direction(){throw new Error('Steering2D.direction must be implemented');}
    onUpdate(){
      if(this.getComponents(Steering2D).filter(c=>c.enabled).length>1)throw new Error('Multiple active AI generators');
      const controller=this.requireComponent(CharacterController2D),target=this.target;
      if(target!==null&&!(target instanceof GameObject))throw new Error('Target must be a GameObject or null');
      if(target===null||target.destroyed||!target.active||target.game!==this.game){controller.move(0,0);return;}
      finite(this.speed,'AI speed');const x=target.transform.x-this.transform.x,y=target.transform.y-this.transform.y;
      let direction=this.direction(x,y,Math.hypot(x,y));const avoidance=this.getComponent(ObstacleAvoidance2D);
      if(avoidance?.enabled)direction=avoidance.steer(direction.x,direction.y);
      controller.move(direction.x,direction.y,this.speed);const sprite=this.getComponent(Sprite);if(sprite&&direction.x!==0)sprite.flipX=direction.x<0;
    }
  }
  class FollowTarget2D extends Steering2D {
    constructor(target){super(target);this.stopDistance=32;}
    direction(x,y,distance){finite(this.stopDistance,'stop distance');return distance<=this.stopDistance?new Vector2():new Vector2(x,y);}
  }
  class FleeTarget2D extends Steering2D {
    constructor(target){super(target);this.safeDistance=200;}
    direction(x,y,distance){finite(this.safeDistance,'safe distance');return distance>=this.safeDistance?new Vector2():distance===0?new Vector2(1,0):new Vector2(-x,-y);}
  }
  class FlankTarget2D extends Steering2D {
    constructor(target){super(target);this.radius=100;this.clockwise=true;}
    direction(x,y,distance){finite(this.radius,'flank radius');if(typeof this.clockwise!=='boolean')throw new Error('clockwise must be boolean');if(distance===0)return new Vector2(1,0);const radial=(distance-this.radius)/Math.max(1,this.radius),side=this.clockwise?1:-1;return new Vector2(x/distance*radial-y/distance*side,y/distance*radial+x/distance*side);}
  }
  class ObstacleAvoidance2D extends Component {
    constructor(){super();this.lookAhead=80;this.weight=2;}
    steer(x,y){
      if(!Number.isFinite(x)||!Number.isFinite(y))throw new Error('Invalid steering direction');finite(this.lookAhead,'look ahead',Number.MIN_VALUE);finite(this.weight,'avoidance weight');
      const length=Math.hypot(x,y);if(!length)return new Vector2();const dx=x/length,dy=y/length;
      const radius=this.lookAhead+Math.max(extent(this.gameObject,true),extent(this.gameObject,false))+8;
      for(const other of this.game.physics.queryRadius(this.transform.x,this.transform.y,radius,0x7fffffff)){
        const collider=other.getComponent(Collider2D);if(other===this.gameObject||!other.active||other.destroyed||!collider?.enabled||collider.isTrigger||collider instanceof Trigger2D)continue;
        const ox=other.transform.x-this.transform.x,oy=other.transform.y-this.transform.y,ahead=ox*dx+oy*dy,side=ox*(-dy)+oy*dx;
        const clearance=Math.abs(dy)*(extent(other,true)+extent(this.gameObject,true))+Math.abs(dx)*(extent(other,false)+extent(this.gameObject,false))+8;
        const forward=Math.abs(dx)*extent(other,true)+Math.abs(dy)*extent(other,false);
        if(ahead>=0&&ahead<this.lookAhead+forward&&Math.abs(side)<clearance){const sign=side>=0?-1:1;return new Vector2(dx-dy*sign*this.weight,dy+dx*sign*this.weight);}
      }return new Vector2(dx,dy);
    }
  }
  class TopDownCharacterController2D extends CharacterController2D {
    constructor(){super();this.walkSpeed=120;this.runSpeed=240;this.running=false;}
    move(x,y,speed=this.running?this.runSpeed:this.walkSpeed){if(!Number.isFinite(x)||!Number.isFinite(y))throw new Error('Invalid movement direction');finite(speed,'movement speed');super.move(x,y,speed);this.running=speed>this.walkSpeed;const sprite=this.getComponent(Sprite);if(sprite&&this.velocity.x!==0)sprite.flipX=this.velocity.x<0;}
    walk(x,y){this.move(x,y,this.walkSpeed);}
    run(x,y){this.move(x,y,this.runSpeed);}
    stop(){this.move(0,0,0);}
    setRunning(value){if(typeof value!=='boolean')throw new Error('running must be boolean');const {x,y}=this.velocity;this.move(x,y,value?this.runSpeed:this.walkSpeed);this.running=value;}
    isWalk(){return this.enabled&&!this.running&&(this.velocity.x!==0||this.velocity.y!==0);}
    isRunning(){return this.enabled&&this.running&&(this.velocity.x!==0||this.velocity.y!==0);}
  }
  class PlatformerCharacterController2D extends TopDownCharacterController2D {
    constructor(){super();this.gravity=900;this.jumpSpeed=340;this.maxFallSpeed=600;this.verticalSpeed=0;this.grounded=false;}
    onCreate(){this.onAfterMove(0);}
    move(x,y,speed=this.running?this.runSpeed:this.walkSpeed){super.move(x,0,speed);this.velocity.y=this.verticalSpeed;}
    walk(x){this.move(x,0,this.walkSpeed);}
    run(x){this.move(x,0,this.runSpeed);}
    onUpdate(delta){finite(this.gravity,'gravity');finite(this.jumpSpeed,'jump speed',Number.MIN_VALUE);finite(this.maxFallSpeed,'fall speed',Number.MIN_VALUE);this.verticalSpeed=Math.min(this.maxFallSpeed,this.verticalSpeed+this.gravity*delta);this.velocity.y=this.verticalSpeed;}
    jump(){if(!this.enabled||!this.isGrounded())return false;this.verticalSpeed=-this.jumpSpeed;this.velocity.y=this.verticalSpeed;this.grounded=false;return true;}
    isGrounded(){if(this.created&&this.gameObject.active&&!this.gameObject.destroyed)this.onAfterMove(0);return this.grounded;}
    isWalk(){return this.enabled&&!this.running&&this.velocity.x!==0;}
    isRunning(){return this.enabled&&this.running&&this.velocity.x!==0;}
    solidAt(offset){const original=this.transform.y;this.transform.y+=offset;try{const radius=Math.hypot(extent(this.gameObject,true),extent(this.gameObject,false))+Math.abs(offset);for(const other of this.game.physics.queryRadius(this.transform.x,this.transform.y,radius,0x7fffffff)){const collider=other.getComponent(Collider2D);if(other!==this.gameObject&&other.active&&!other.destroyed&&collider?.enabled&&!collider.isTrigger&&!(collider instanceof Trigger2D)&&this.game.physics.overlaps(this.gameObject,other))return true;}return false;}finally{this.transform.y=original;}}
    onAfterMove(){const height=extent(this.gameObject,false),bounds=this.game.worldBounds;this.grounded=this.verticalSpeed>=0&&(this.solidAt(.01)||this.constrainToBounds&&bounds!==null&&this.transform.y>=bounds.y+bounds.height-height-.01);const ceiling=this.verticalSpeed<0&&(this.solidAt(-.01)||this.constrainToBounds&&bounds!==null&&this.transform.y<=bounds.y+height+.01);if(this.grounded||ceiling){this.verticalSpeed=0;this.velocity.y=0;}}
  }
  class KeyPressed extends Component {
    constructor(key,action){super();if(!keyValid(key)||typeof action!=='function')throw new Error('Key and callback required');this.key=key;this.action=action;}
    onUpdate(){if(this.game.input.isKeyPressed(this.key))this.action();}
  }
  class KeyDoublePressed extends KeyPressed {
    constructor(key,action){super(key,action);this.maxDelaySeconds=.3;this.elapsed=0;this.armed=false;}
    onUpdate(delta){finite(this.maxDelaySeconds,'double press window',Number.MIN_VALUE);this.elapsed+=delta;if(!this.game.input.isKeyPressed(this.key))return;if(this.armed&&this.elapsed<=this.maxDelaySeconds){this.armed=false;this.action();}else{this.armed=true;this.elapsed=0;}}
  }
  class NoneOfKeysPressed extends Component {
    constructor(keys,action){super();if(!Array.isArray(keys)||!keys.length||!keys.every(keyValid)||typeof action!=='function')throw new Error('Keys and callback required');this.keys=[...keys];this.action=action;}
    onUpdate(){if(!this.keys.some(key=>this.game.input.isKeyDown(key)))this.action();}
  }
  return {Steering2D,FollowTarget2D,FleeTarget2D,FlankTarget2D,ObstacleAvoidance2D,TopDownCharacterController2D,PlatformerCharacterController2D,KeyPressed,KeyDoublePressed,NoneOfKeysPressed};
}
