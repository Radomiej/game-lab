import { Assets, assetManifest } from './assets/Assets.js';
import { SpatialHash } from './spatialHash.js';
import { createPhysics } from './physics.js';
import { createRenderer } from './renderer.js';
import { createAddons } from './addons.js';
import { createLabAudio } from './audio.js';
import { createFrameStats } from './stats.js';
import { Keys as defaultKeys } from './keys.js';
// Dependencies are passed explicitly when serialized into the iframe.
export const CONSOLE_STYLE = `
.lab-console{display:flex;justify-content:center;width:100%;min-height:100%;padding:12px 8px;box-sizing:border-box}
.lab-console-shell{width:480px;max-width:100%;padding:16px 16px 20px;border-radius:20px 20px 56px 20px;background:linear-gradient(165deg,#4d587f,#333a5e 55%,#252a48);box-shadow:inset 0 2px 0 rgba(255,255,255,.14),inset 0 -3px 0 rgba(0,0,0,.35),0 14px 32px rgba(6,10,24,.5);color:#c6cdec}
.lab-console-brand{display:flex;align-items:center;gap:8px;margin-bottom:10px;color:#8e99c9;font:700 10px/1 ui-monospace,Consolas,monospace;letter-spacing:.32em;text-transform:uppercase}
.lab-console-brand::before,.lab-console-brand::after{content:'';flex:1;border-top:1px solid rgba(255,255,255,.12)}
.lab-console-screen{position:relative;aspect-ratio:4/3;border:5px solid #10142a;border-radius:12px;background:#0a1524;overflow:hidden;box-shadow:inset 0 0 0 2px rgba(124,226,214,.12),0 2px 8px rgba(0,0,0,.45)}
.lab-console-screen>canvas{display:block;width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges;outline:none}
.lab-console-screen>canvas:focus{box-shadow:inset 0 0 0 3px rgba(124,226,214,.55)}
.lab-console-stats{display:flex;align-items:center;gap:12px;margin:12px 4px 0;padding:6px 10px;border-radius:8px;background:#141a33;color:#7d8abc;font:10px ui-monospace,Consolas,monospace;letter-spacing:.04em}
.lab-console-stats b{color:#e9edff;font-weight:700}
.lab-console-keys{margin-left:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#ffd166;font-weight:700}
.lab-console-pad{display:flex;flex-direction:column;gap:12px;margin-top:14px}
.lab-pad-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px}
.lab-pad-row>*{flex:0 0 auto}
.lab-console-pad button{user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;font-family:inherit}
.lab-console-pad button:focus-visible{outline:2px solid #7ce2d6;outline-offset:2px}
.lab-dpad{display:grid;grid-template:repeat(3,1fr)/repeat(3,1fr);width:104px;height:104px;filter:drop-shadow(0 4px 4px rgba(0,0,0,.35))}
.lab-dpad button{border:0;background:#1c2240;color:#4a5580;font-size:11px;cursor:pointer;touch-action:none}
.lab-dpad button[data-dir=up]{grid-area:1/2;border-radius:8px 8px 0 0}
.lab-dpad button[data-dir=left]{grid-area:2/1;border-radius:8px 0 0 8px}
.lab-dpad button[data-dir=right]{grid-area:2/3;border-radius:0 8px 8px 0}
.lab-dpad button[data-dir=down]{grid-area:3/2;border-radius:0 0 8px 8px}
.lab-dpad .lab-dpad-hub{grid-area:2/2;display:grid;place-items:center;background:#1c2240}
.lab-dpad .lab-dpad-hub::after{content:'';width:14px;height:14px;border-radius:50%;background:#161b33;box-shadow:inset 0 1px 2px rgba(0,0,0,.6)}
.lab-dpad button.down,.lab-dpad button:active{background:#2b3462;color:#9fb0ff}
.lab-actions{display:grid;grid-template:repeat(2,1fr)/repeat(2,1fr);gap:8px;transform:rotate(-18deg)}
.lab-actions button{width:42px;height:42px;border:0;border-radius:50%;background:#b03a5b;color:#ffe3ec;font:700 13px/1 ui-monospace,monospace;cursor:pointer;box-shadow:0 4px 0 #7d2440,0 6px 8px rgba(0,0,0,.4);touch-action:none}
.lab-actions button>span{display:inline-block;transform:rotate(18deg)}
.lab-actions button[data-action=y],.lab-actions button[data-action=b]{transform:translateY(6px)}
.lab-actions button.down,.lab-actions button:active{background:#d04f74;box-shadow:0 1px 0 #7d2440;translate:0 3px}
.lab-sys{display:flex;align-items:center;justify-content:center;gap:10px}
.lab-pill{min-width:64px;padding:5px 12px;border:0;border-radius:999px;background:#1c2240;color:#8e99c9;font:700 9px/1 ui-monospace,monospace;letter-spacing:.14em;cursor:pointer;box-shadow:0 3px 0 #12172e;touch-action:none}
.lab-pill.down,.lab-pill:active{background:#2b3462;color:#e9edff}
.lab-boot{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#0a1524;color:#7ce2d6;transition:opacity .35s}
.lab-boot::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0 3px,rgba(124,226,214,.06) 3px 4px);pointer-events:none}
.lab-boot-logo{font:700 15px/1 ui-monospace,Consolas,monospace;letter-spacing:.3em;text-shadow:0 0 12px rgba(124,226,214,.5);animation:lab-boot-logo 1s ease-out}
@keyframes lab-boot-logo{0%{transform:translateY(-90px);opacity:0}60%{transform:translateY(4px);opacity:1}100%{transform:translateY(0)}}
.lab-boot-bar{width:130px;height:7px;border:1px solid #2b3462;border-radius:999px;overflow:hidden;background:#10142a}
.lab-boot-bar i{display:block;height:100%;background:#7ce2d6;transform-origin:left;animation:lab-boot-bar 1.2s ease-in-out infinite}
@keyframes lab-boot-bar{0%{transform:scaleX(0)}55%{transform:scaleX(1)}100%{transform:scaleX(1);opacity:.35}}
.lab-boot.hide{opacity:0;pointer-events:none}
.lab-view{position:absolute;inset:0;z-index:3;pointer-events:none;display:none;font:600 10px/1.2 ui-monospace,Consolas,monospace;color:#9ef5e8;text-shadow:0 1px 2px rgba(4,10,18,.9)}
.lab-view.on{display:block}
.lab-view span{position:absolute;padding:2px 5px;background:rgba(10,21,36,.72);border:1px solid rgba(124,226,214,.35);border-radius:4px;white-space:nowrap}
.lab-view-tl{top:4px;left:4px}
.lab-view-tr{top:4px;right:4px}
.lab-view-br{bottom:4px;right:4px}
`;
export function createGameLab(environment = {}, shared = { Assets, assetManifest, SpatialHash, createPhysics, createRenderer, createAddons, createLabAudio, createFrameStats, Keys: defaultKeys }) {
  const { Assets, assetManifest, SpatialHash, createPhysics, createRenderer, createAddons, Keys = defaultKeys } = shared;
  const audioKit = (shared.createLabAudio ?? createLabAudio)();
  const frameStatsFactory = shared.createFrameStats ?? createFrameStats;
  const win = environment.window || window;
  const doc = environment.document || win.document;
  const raf = environment.requestAnimationFrame || win.requestAnimationFrame.bind(win);
  const caf = environment.cancelAnimationFrame || win.cancelAnimationFrame.bind(win);
  const renderer = createRenderer(assetManifest);
  const assetsReady = environment.skipAssetLoading ? Promise.resolve() : renderer.load(win);
  assetsReady.catch(error => win.dispatchEvent(new win.ErrorEvent('error', { error, message: error.message })));
  const finite = (value, label) => {
    if (!Number.isFinite(value)) throw new Error(`${label}: oczekiwano skończonej liczby.`);
    return value;
  };
  const normalizeKey = key => key === ' ' || key === 'Spacebar' ? 'Space' : key.length === 1 ? key.toLowerCase() : key;
  const textures = {
    player: ['#76b9f2', '#17324d'], slime: ['#70c994', '#123c2c'],
    bat: ['#a98bd5', '#392c59'], ghost: ['#c3edf2', '#527783'], gem: ['#ffd166', '#9b631c'],
    coin: ['#ffd166', '#9b631c'], chest: ['#b77932', '#603b22'],
    projectile: ['#8be9fd', '#ffffff'], heart: ['#ef6a78', '#7d2938'],
    wall: ['#889aa9', '#405563'],
  };
  class Transform {
    constructor(invalidate = () => {}) {
      let x = 0, y = 0;
      Object.defineProperties(this, { x: { enumerable: true, get: () => x, set: value => { finite(value, 'Transform x'); if (x !== value) { x = value; invalidate(); } } }, y: { enumerable: true, get: () => y, set: value => { finite(value, 'Transform y'); if (y !== value) { y = value; invalidate(); } } } });
      this.rotation = 0; this.scale = new Vector2(1, 1); this.visualOffset = new Vector2();
    }
  }
  class Component {
    constructor() { let enabled = true; Object.defineProperty(this,'enabled',{ enumerable:true,get:()=>enabled,set:value=>{ if (enabled !== Boolean(value)) { enabled=Boolean(value); if(!enabled && this instanceof Button)this.blur(); if(this.gameObject)this.gameObject.game.spatialRevision++; } } }); this.gameObject = null; this.created = false; this.destroyed = false; this.updateMode = 'WORLD'; }
    get transform() { return this.gameObject.transform; }
    setEnabled(value) { this.enabled = Boolean(value); }
    get game() { return this.gameObject ? this.gameObject.game : null; }
    getComponent(type) { return this.gameObject.getComponent(type); }
    getComponents(type) { return this.gameObject.getComponents(type); }
    hasComponent(type) { return this.gameObject.hasComponent(type); }
    requireComponent(type) { return this.gameObject.requireComponent(type); }
    removeComponents(type) { return this.gameObject.removeComponents(type); }
    getGame() { return this.game; }
    onComponentChange() {}
    onCreate() {}
    onUpdate() {}
    onLateUpdate() {}
    onDrawBackground() {}
    onDrawUI() {}
    onDestroy() {}
    onCollision() {}
    onTrigger() {}
  }
  class ShapeRenderer extends Component {
    constructor(width = 32, height = 32, color = '#76b9f2') {
      if (typeof width === 'object') ({ width = 32, height = 32, color = '#76b9f2' } = width);
      super(); this.width = width; this.height = height; this.color = color;
      this.space = 'world'; this.layer = 0; this.order = 0;
      this.shape = 'rect'; this.radius = 16;
    }
    static circle(radius = 16, color = '#76b9f2') {
      finite(radius, 'Promień'); if (radius < 0) throw new Error('Promień nie może być ujemny.');
      const result = new ShapeRenderer(radius * 2, radius * 2, color);
      result.shape = 'circle'; result.radius = radius; return result;
    }
  }
  class Sprite extends ShapeRenderer {
    constructor(texture = 'player', width = 32, height = 32) {
      if (!assetManifest.assets.some(a => a.key === texture) && !textures[texture]) throw new Error(`Brak tekstury: ${texture}.`);
      super({ width, height }); this.texture = texture;
      this.flipX = false; this.flipY = false;
    }
  }
  class TextRenderer extends Component {
    constructor(text = '', fontSize = 16, color = '#ffffff') {
      super(); this.text = text; this.fontSize = fontSize; this.color = color; this.space = 'world'; this.align = 'center'; this.baseline = 'middle'; this.layer = 0; this.order = 0;
    }
    onDrawUI() {
      const text = typeof this.text === 'function' ? this.text() : this.text;
      const ui=this.getComponent(UITransform), center=ui?.enabled?ui.getCenter():this.transform;
      const view = ui?.enabled || this.space === 'screen' ? { x: 0, y: 0 } : this.game.cameraView;
      if (text !== null && text !== undefined) this.game.canvas.drawText(text, center.x-view.x, center.y-view.y, this.fontSize, this.color, this.align, this.baseline);
    }
  }
  class ControlsHint extends TextRenderer {
    constructor(text = 'Kliknij planszę, aby sterować.') { super(text); }
    onDrawUI() {
      if (doc.activeElement !== this.game.canvas.element) {
        this.game.canvas.drawText(this.text, this.game.canvas.width/2, this.game.canvas.height-12, 16, this.color);
      }
    }
  }
  const UIAnchor = Object.freeze(Object.fromEntries(['TOP_LEFT','TOP_CENTER','TOP_RIGHT','CENTER_LEFT','CENTER','CENTER_RIGHT','BOTTOM_LEFT','BOTTOM_CENTER','BOTTOM_RIGHT'].map(a => [a,a])));
  class UITransform extends Component {
    constructor(width = 100, height = 30) { super(); this.updateMode = 'UI'; this.width = width; this.height = height; this.anchor = 'CENTER'; this.pivot = null; }
    getBounds() {
      const x = this.anchor.endsWith('LEFT') ? 0 : this.anchor.endsWith('RIGHT') ? 1 : .5;
      const y = this.anchor.startsWith('TOP') ? 0 : this.anchor.startsWith('BOTTOM') ? 1 : .5;
      const p = this.pivot || { x, y };
      const left = this.game.getViewportWidth()*x + this.transform.x - this.width*p.x, top = this.game.getViewportHeight()*y + this.transform.y - this.height*p.y;
      return { left, top, right: left+this.width, bottom: top+this.height };
    }
    getCenter() { const b = this.getBounds(); return new Vector2((b.left+b.right)/2,(b.top+b.bottom)/2); }
  }
  function uiRect(component) { const ui = component.getComponent(UITransform); if (ui?.enabled) { const b = ui.getBounds(); return { x: (b.left+b.right)/2, y: (b.top+b.bottom)/2, width: b.right-b.left, height: b.bottom-b.top }; } return { x: component.transform.x, y: component.transform.y, width: component.width, height: component.height }; }
  class ProgressBar extends Component {
    constructor(width = 200, height = 20) { super(); this.updateMode = 'UI'; this.width = width; this.height = height; this.progress = 0; this.frame = Assets.UI_BAR_HEALTH_FRAME; this.track = Assets.UI_BAR_HEALTH_TRACK; this.fill = Assets.UI_BAR_HEALTH_FILL; }
    setProgress(percent) { finite(percent, 'Postęp'); this.progress = Math.max(0, Math.min(100, percent)); }
    getProgress() { return this.progress; }
    setValue(value, max) { finite(value, 'Wartość'); finite(max, 'Maksimum'); this.setProgress(max <= 0 ? 0 : value / max * 100); }
    onDrawUI() { const r = uiRect(this); this.game.canvas.drawProgressBar(r.x, r.y, r.width, r.height, this.progress, this.frame, this.track, this.fill); }
  }
  class Button extends Component {
    constructor(width = 160, height = 44) { super(); this.updateMode = 'UI'; this.width = width; this.height = height; this.texture = Assets.UI_BUTTON_BLUE; this.border = 8; this.text = ''; this.onClick = null; this.focused = false; }
    activate() { if (this.enabled && this.gameObject.active && !this.gameObject.destroyed) this.onClick?.(); }
    focus() { if(!this.created||!this.enabled||!this.gameObject?.active||this.gameObject.destroyed||this.destroyed)return false;for(const o of this.game.getObjects())for(const b of o.getComponents(Button))if(b!==this)b.blur();this.focused=true;return true; }
    blur() { this.focused=false;this.pointerArmed=false;this.keyArmed=null; }
    isFocused() { return this.focused&&this.enabled&&this.gameObject.active&&!this.gameObject.destroyed; }
    onUpdate() {
      const input = this.game.input, p = input.getPointerPosition();
      const r = uiRect(this), inside = p && Math.abs(p.x-r.x) <= r.width/2 && Math.abs(p.y-r.y) <= r.height/2;
      if (input.isMousePressed(0)) { this.pointerArmed = Boolean(inside);if(inside){this.focus();input.consumeMouse(0);} }
      if (input.isMouseReleased(0)) { if (this.pointerArmed){input.consumeMouse(0);if(inside)this.activate();} this.pointerArmed = false; }
      for(const key of ['Enter','Space']) {
        if(this.focused&&input.isKeyPressed(key)){this.keyArmed=key;input.consumeKey(key);}
        if(this.keyArmed===key&&input.isKeyReleased(key)){this.keyArmed=null;if(this.isFocused()){input.consumeKey(key);this.activate();}}
      }
    }
    onDrawUI() { const r=uiRect(this); this.game.canvas.drawNinePatch(this.texture,r.x,r.y,r.width,r.height,this.border); this.game.canvas.drawText(this.text,r.x,r.y,16,'#ffffff'); }
  }
  class Camera2D extends Component {
    constructor() { super(); this.offsetX = 0; this.offsetY = 0; this.target = null; this.shakeStrength = 0; this.shakeRemaining = 0; this.shakeElapsed = 0; }
    follow(target) {
      if (!this.gameObject || !target || target.game !== this.game || target.destroyed) throw new Error('Kamera wymaga celu z tej samej sceny.');
      this.target = target;
    }
    stopFollowing() { this.target = null; }
    worldToScreen(point) { const view = this.getView(); return new Vector2(point.x-view.x,point.y-view.y); }
    screenToWorld(point) { const view = this.getView(); return new Vector2(point.x+view.x,point.y+view.y); }
    shake(strength, seconds) {
      finite(strength, 'Siła shake'); finite(seconds, 'Czas shake');
      if (strength < 0 || seconds < 0) throw new Error('Siła i czas shake nie mogą być ujemne.');
      this.shakeStrength = strength; this.shakeRemaining = seconds; this.shakeElapsed = 0;
    }
    stopShake() { this.shakeRemaining = 0; }
    onUpdate(delta) { this.shakeRemaining = Math.max(0, this.shakeRemaining - delta); this.shakeElapsed += delta; }
    getView() {
      const target = this.target?.active && !this.target.destroyed ? this.target : null;
      const x = target ? target.transform.x - this.game.canvas.width / 2 : 0;
      const y = target ? target.transform.y - this.game.canvas.height / 2 : 0;
      return {
        x: x + finite(this.offsetX, 'Kamera x') + (this.shakeRemaining > 0 ? Math.sin(this.shakeElapsed * 47) * this.shakeStrength : 0),
        y: y + finite(this.offsetY, 'Kamera y') + (this.shakeRemaining > 0 ? Math.cos(this.shakeElapsed * 39) * this.shakeStrength : 0),
      };
    }
  }
  class TileMap extends Component {
    constructor(texture = 'grass', tileSize = 32) {
      super();
      if (!['grass', 'sand'].includes(texture)) throw new Error('TileMap obsługuje tekstury grass i sand.');
      finite(tileSize, 'Rozmiar kafelka');
      if (tileSize < 8) throw new Error('Kafelek TileMap musi mieć co najmniej 8 px.');
      this.texture = texture; this.tileSize = tileSize; this.layer = -100; this.order = 0;
    }
  }
  class Tween extends Component {
    constructor(object, property, from, to, duration) {
      super();
      this.object = object; this.property = property; this.from = from; this.to = to;
      this.duration = finite(duration, 'Czas tweena'); this.elapsed = 0; this.easing = 'linear';
      this.completed = false; this.cancelled = false; this.callbacks = []; this.offset = new Vector2();
      if (duration < 0) throw new Error('Czas tweena nie może być ujemny.');
      if (duration === 0) { this.apply(1); this.completed = true; }
    }
    apply(progress) {
      if (!['linear', 'smooth'].includes(this.easing)) throw new Error('Easing: linear lub smooth');
      const t = this.easing === 'smooth' ? progress * progress * (3 - 2 * progress) : progress;
      if (this.property === 'shake') {
        const strength = this.from * (1 - t);
        this.clearOffset();
        this.offset.set(Math.sin(this.elapsed * 47) * strength, Math.cos(this.elapsed * 39) * strength);
        this.object.transform.visualOffset.x += this.offset.x;
        this.object.transform.visualOffset.y += this.offset.y;
      } else if (typeof this.from === 'number') {
        this.object.transform[this.property] = this.from + (this.to - this.from) * t;
      } else {
        for (const axis of ['x', 'y']) {
          const value = this.from[axis] + (this.to[axis] - this.from[axis]) * t;
          if (this.property === 'position') this.object.transform[axis] = value;
          else this.object.transform[this.property][axis] = value;
        }
      }
    }
    update(delta) {
      if (this.completed || this.cancelled || this.object.destroyed) return false;
      this.elapsed = Math.min(this.duration, this.elapsed + delta);
      this.apply(this.duration ? this.elapsed / this.duration : 1);
      this.completed = this.elapsed >= this.duration;
      if (this.completed) { this.clearOffset(); const callbacks = this.callbacks.splice(0); this.gameObject?.removeComponent(this); for (const callback of callbacks) callback(); }
      return !this.completed;
    }
    onUpdate(delta) { this.update(delta); }
    onComplete(callback) { if (typeof callback !== 'function') throw new Error('onComplete wymaga funkcji'); if (this.completed) callback(); else if (!this.cancelled) this.callbacks.push(callback); return this; }
    clearOffset() { this.object.transform.visualOffset.x -= this.offset.x; this.object.transform.visualOffset.y -= this.offset.y; this.offset.set(0, 0); }
    cancel() {
      if (this.completed || this.cancelled) return;
      this.cancelled = true;
      this.clearOffset(); this.callbacks = []; this.gameObject?.removeComponent(this);
    }
    onDestroy() { this.clearOffset(); if (!this.completed) { this.cancelled = true; this.callbacks = []; } }
  }
  class Tweens {
    static start(object, property, to, seconds) {
      if (!object || object.destroyed) throw new Error('Tween wymaga aktywnego obiektu.');
      if (property === 'rotation' || property === 'shake') finite(to, 'Cel tweena'); else { finite(to.x, 'Cel tweena x'); finite(to.y, 'Cel tweena y'); }
      const from = property === 'shake' ? to : property === 'rotation' ? object.transform.rotation : property === 'position' ? { x: object.transform.x, y: object.transform.y } : { ...object.transform[property] };
      const target = property === 'shake' ? 0 : property === 'rotation' ? to : { x: to.x, y: to.y };
      const tween = new Tween(object, property, from, target, seconds);
      object.game.addTween(tween);
      return tween;
    }
    static position(object, x, y, seconds) { return this.start(object, 'position', { x, y }, seconds); }
    static scale(object, x, y, seconds) { return this.start(object, 'scale', { x, y }, seconds); }
    static rotation(object, radians, seconds) { return this.start(object, 'rotation', radians, seconds); }
    static shake(object, strength, seconds) { return this.start(object, 'shake', strength, seconds); }
  }
  class Collider2D extends Component {
    onContactEnter(type,callback) { if(typeof type!=='function'||(type!==Component&&!(type.prototype instanceof Component))||typeof callback!=='function')throw new Error('Oczekiwano typu komponentu i funkcji');if(!this.contactListeners)this.contactListeners=new Set();const listener={type,callback};this.contactListeners.add(listener);return ()=>this.contactListeners.delete(listener); }
    fireContactEnter(other) { for(const listener of [...(this.contactListeners||[])]){if(this.destroyed||this.gameObject.destroyed||other.destroyed)break;if(other.hasComponent(listener.type))listener.callback(other);} }
    constructor(width = 32, height = 32) { super(); if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('Niepoprawny rozmiar collidera'); this.geometryField('width',width); this.geometryField('height',height); this.layer = 1; this.mask = 0x7fffffff; this.isTrigger = false; }
    geometryField(name,initial) { let value=initial; Object.defineProperty(this,name,{enumerable:true,get:()=>value,set:next=>{if(!Number.isFinite(next)||next<=0)throw new Error('Niepoprawna geometria');if(next!==value){value=next;if(this.gameObject)this.gameObject.game.spatialRevision++;}}}); }
  }
  class CircleCollider2D extends Collider2D {
    constructor(radius) { super(); if (!Number.isFinite(radius) || radius <= 0) throw new Error('Niepoprawny promień'); this.geometryField('radius',radius); }
  }
  class Trigger2D extends Collider2D { constructor(width = 32, height = 32) { super(width, height); this.isTrigger = true; } }
  class Projectile2D extends Component {
    constructor(dx, dy, speed = 300, lifetime = 2, owner = null) { super();if(![dx,dy,speed,lifetime].every(Number.isFinite)||speed<0||lifetime<0)throw new Error('Niepoprawny pocisk'); this.direction = new Vector2(dx, dy).normalized(); this.speed = speed; this.remainingLifetime = lifetime; this.owner = owner; this.maxHits = 1; this.hits = 0; this.hitLayers = 0x7fffffff; this.hitObjects = new Set(); }
    onCreate() { if (!this.getComponent(Collider2D)) { const c = this.gameObject.addComponent(new CircleCollider2D(4)); c.isTrigger = true; } if (!this.getComponent(CharacterController2D)) this.gameObject.addComponent(new CharacterController2D());this.getComponent(CharacterController2D).constrainToBounds=false; }
    onUpdate() { if(![this.speed,this.remainingLifetime].every(Number.isFinite)||this.speed<0||this.remainingLifetime<0)throw new Error('Niepoprawny pocisk');if(this.remainingLifetime===0){this.gameObject.destroy();return;}this.getComponent(CharacterController2D).move(this.direction.x, this.direction.y, this.speed); }
  }
  class Vector2 {
    constructor(x = 0, y = 0) { this.x = x; this.y = y; }
    set(x, y) { this.x = finite(x, 'Vector x'); this.y = finite(y, 'Vector y'); return this; }
    copy() { return new Vector2(this.x, this.y); }
    lengthSquared() { return this.x * this.x + this.y * this.y; }
    length() { return Math.hypot(this.x, this.y); }
    normalized() { const n = this.length(); return n ? new Vector2(this.x / n, this.y / n) : new Vector2(); }
  }
  class Random {
    constructor(seed = 1) { this.setSeed(seed); }
    setSeed(seed) { if(!Number.isInteger(seed))throw new Error('Seed musi być liczbą całkowitą');this.state=seed|0||1; }
    next() { let x = this.state; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.state = x; return (x >>> 0) / 4294967296; }
    nextInt(min, max) { if (!Number.isInteger(min) || !Number.isInteger(max) || min >= max) throw new Error('Niepoprawny zakres'); return min + Math.floor(this.next() * (max - min)); }
    range(min, max) { if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) throw new Error('Niepoprawny zakres'); return min + this.next() * (max - min); }
  }
  class CharacterController2D extends Component {
    constructor() { super(); this.velocity = { x: 0, y: 0 }; this.direction = new Vector2(1, 0); this.constrainToBounds = true; }
    getDirection() { return this.direction.copy(); }
    onAfterMove() {}
    move(x, y, speed = 120) {
      finite(x, 'Kierunek x'); finite(y, 'Kierunek y'); finite(speed, 'Prędkość');
      if(speed<0)throw new Error('Prędkość nie może być ujemna.');
      const length = Math.hypot(x, y);
      if (length) this.direction.set(x / length, y / length);
      this.velocity.x = length ? x / length * speed : 0;
      this.velocity.y = length ? y / length * speed : 0;
    }
  }
  class GameObject {
    setActive(value) { this.active=Boolean(value);if(!this.active)for(const b of this.getComponents(Button))b.blur();return this; }
    constructor(game, name) { this.game = game; this.id = game.nextObjectId++; this.name = name; this.transform = new Transform(()=>game.spatialRevision++); let active=true;Object.defineProperty(this,'active',{enumerable:true,get:()=>active,set:value=>{if(active!==Boolean(value)){active=Boolean(value);game.spatialRevision++;}}});this.destroyed = false; this.components = []; this.listeners = new Set(); }
    setPosition(x, y) { this.transform.x = finite(x, 'Pozycja x'); this.transform.y = finite(y, 'Pozycja y'); return this; }
    addComponent(component) {
      if (!(component instanceof Component) || component.gameObject || this.destroyed) throw new Error('Dodaj nowy komponent do aktywnego obiektu.');
      component.gameObject = this; this.components.push(component); this.game.spatialRevision++; this.game.updateComponentIndex(this);this.notifyChange('added',component); return component;
    }
    getComponent(type) { return this.components.find(c => c instanceof type && !c.destroyed) ?? null; }
    getComponents(type) { return this.components.filter(c => !c.destroyed && (!type || c instanceof type)); }
    hasComponent(type) { return this.getComponent(type) !== null; }
    requireComponent(type) { const c = this.getComponent(type); if (!c) throw new Error(`${this.name}: brak ${type.name}`); return c; }
    onComponentChange(listener) { this.listeners.add(listener);return ()=>this.listeners.delete(listener); }
    notifyChange(type,component) { const change={type,component,object:this};for(const listener of [...this.listeners])listener(change);for(const observer of this.getComponents())if(observer.created&&observer.enabled)observer.onComponentChange(change); }
    addTag(tag) { if(typeof tag!=='string'||!tag.trim())throw new Error('Tag musi być niepustym tekstem');if(!this.tags)this.tags=new Set();this.tags.add(tag);this.game.updateTagIndex(this,tag,true);return this; }
    removeTag(tag) { const removed=this.tags?.delete(tag)??false;if(removed)this.game.updateTagIndex(this,tag,false);return removed; }
    hasTag(tag) { return this.tags?.has(tag)??false; }
    getTags() { return [...(this.tags||[])]; }
    removeComponents(type) { let n=0;for(const c of this.getComponents(type)){this.removeComponent(c);n++;}return n; }
    removeComponent(component) {
      if(typeof component==='function')component=this.getComponent(component);
      if (!this.components.includes(component) || component.destroyed) return false;
      component.destroyed = true; this.game.spatialRevision++;this.components = this.components.filter(c => c !== component);this.game.updateComponentIndex(this);if (component.created) component.onDestroy();this.notifyChange('removed',component);return true;
    }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true; this.active = false;
      for (const component of [...this.components]) this.removeComponent(component);
      for(const tag of this.getTags())this.removeTag(tag);this.listeners.clear();
    }
  }
  const componentNames = new Map([
    [ShapeRenderer, 'ShapeRenderer'], [Sprite, 'Sprite'], [TextRenderer, 'TextRenderer'], [ControlsHint, 'ControlsHint'], [Camera2D, 'Camera2D'], [TileMap, 'TileMap'], [Collider2D, 'Collider2D'],
    [Trigger2D, 'Trigger2D'], [CharacterController2D, 'CharacterController2D'],
  ]);
  class Input {
    static get MOUSE_LEFT() { return 0; }
    static get MOUSE_MIDDLE() { return 1; }
    static get MOUSE_RIGHT() { return 2; }
    static get MOUSE_BACK() { return 3; }
    static get MOUSE_FORWARD() { return 4; }
    constructor() { this.down = new Set(); this.pressed = new Set(); this.released = new Set(); this.consumed = new Set(); this.pointer = null; this.mouseDown = new Set(); this.mousePressed = new Set(); this.mouseReleased = new Set(); }
    setPointer(x, y) { this.pointer = { x: finite(x, 'Pointer x'), y: finite(y, 'Pointer y') }; }
    setMouseButton(button, down) { if (!Number.isInteger(button) || button < 0 || button > 4) throw new Error('Niepoprawny przycisk myszy'); if (down) { if (!this.mouseDown.has(button)) this.mousePressed.add(button); this.mouseDown.add(button); } else { if (this.mouseDown.has(button)) this.mouseReleased.add(button); this.mouseDown.delete(button); } }
    consumeMouse(button = 0) { (this.mouseConsumed ||= new Set()).add(button); }
    isMouseDown(button = 0) { return !this.mouseConsumed?.has(button) && this.mouseDown.has(button); }
    isMousePressed(button = 0) { return !this.mouseConsumed?.has(button) && this.mousePressed.has(button); }
    isMouseReleased(button = 0) { return !this.mouseConsumed?.has(button) && this.mouseReleased.has(button); }
    setKey(key, down) {
      key = normalizeKey(key);
      if (down) { if (!this.down.has(key)) this.pressed.add(key); this.down.add(key); }
      else { if (this.down.has(key)) this.released.add(key); this.down.delete(key); }
    }
    isKeyDown(key) { return !this.consumed.has(normalizeKey(key)) && this.down.has(normalizeKey(key)); }
    isKeyPressed(key) { return !this.consumed.has(normalizeKey(key)) && this.pressed.has(normalizeKey(key)); }
    isKeyReleased(key) { return !this.consumed.has(normalizeKey(key)) && this.released.has(normalizeKey(key)); }
    consumeKey(key) { this.consumed.add(normalizeKey(key)); }
    getPointerPosition() { return this.pointer ? { ...this.pointer } : null; }
    endFrame() { this.pressed.clear(); this.released.clear(); this.consumed.clear(); this.mousePressed.clear(); this.mouseReleased.clear();this.mouseConsumed?.clear(); }
    clear() { this.down.clear(); this.pressed.clear(); this.released.clear(); this.consumed.clear(); this.mouseDown.clear(); this.mousePressed.clear(); this.mouseReleased.clear();this.mouseConsumed?.clear(); }
  }
  class Canvas {
    constructor(element) {
      this.element = element; this.context = element.getContext('2d');
      if (!this.context) throw new Error('Canvas 2D jest niedostępny w tej przeglądarce.');
      this.commands = []; this.width = 600; this.height = 600; this.view = { x: 0, y: 0 };
      this.scale = 1; this.offsetX = 0; this.offsetY = 0; this.pixelRatio = 1;
    }
    resize(width, height, ratio = 1) {
      this.width = Math.max(1, finite(width, 'Szerokość')); this.height = Math.max(1, finite(height, 'Wysokość'));
      this.pixelRatio = ratio;
      const boxWidth = this.element.clientWidth || this.width, boxHeight = this.element.clientHeight || this.height;
      this.element.width = Math.round(boxWidth * ratio); this.element.height = Math.round(boxHeight * ratio);
      this.scale = Math.min(boxWidth / this.width, boxHeight / this.height);
      this.offsetX = (boxWidth - this.width * this.scale) / 2;
      this.offsetY = (boxHeight - this.height * this.scale) / 2;
      const scale = this.scale * ratio;
      this.context.setTransform(scale, 0, 0, scale, this.offsetX * ratio, this.offsetY * ratio);
    }
    toLogical(x, y) { return { x: (x - this.offsetX) / this.scale, y: (y - this.offsetY) / this.scale }; }
    clear(color = '#0b2033') {
      this.commands = [{ op: 'clear', color }];
      const { context } = this;
      const scale = this.scale * this.pixelRatio;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = '#0a1524';
      context.fillRect(0, 0, this.element.width, this.element.height);
      context.setTransform(scale, 0, 0, scale, this.offsetX * this.pixelRatio, this.offsetY * this.pixelRatio);
      context.fillStyle = color;
      context.fillRect(0, 0, this.width, this.height);
    }
    drawRect(x, y, width, height, color = '#76b9f2', rotation = 0, scale = { x: 1, y: 1 }) {
      [x, y, width, height, rotation, scale.x, scale.y].forEach(v => finite(v, 'Rysowanie'));
      const command={ op: 'rect', x, y, screenX: x - this.view.x, screenY: y - this.view.y, width, height, color,rotation,scaleX:scale.x,scaleY:scale.y };this.commands.push(command);
      renderer.draw(this.context,{...command,x:command.screenX,y:command.screenY});
    }
    drawCircle(x, y, radius, color = '#76b9f2', rotation = 0, scale = { x: 1, y: 1 }) {
      [x, y, radius, rotation, scale.x, scale.y].forEach(v => finite(v, 'Rysowanie'));
      if (radius < 0) throw new Error('Promień nie może być ujemny.');
      const command = { op: 'circle', x, y, screenX: x - this.view.x, screenY: y - this.view.y, radius, color, rotation, scaleX: scale.x, scaleY: scale.y };
      this.commands.push(command); renderer.draw(this.context, { ...command, x: command.screenX, y: command.screenY });
    }
    drawText(text, x, y, fontSize = 16, color = '#ffffff', align = 'center', baseline = 'middle') {
      if (typeof fontSize === 'string') { color = fontSize; fontSize = 16; }
      finite(x, 'Tekst x'); finite(y, 'Tekst y');
      const command={ op: 'text', text: String(text), x, y, color, fontSize, align, baseline };this.commands.push(command);renderer.draw(this.context,command);
    }
    drawCenteredText(text, x, y, color = '#ffffff') { this.drawText(text, x, y, 16, color); }
    getWidth() { return this.width; }
    getHeight() { return this.height; }
    drawProgressBar(x, y, width, height, progress, frame, track, fill) { const command = { op: 'progress', x, y, width, height, progress, frame, track, fill }; this.commands.push(command); renderer.drawProgress(this.context, command); }
    drawNinePatch(texture, x, y, width, height, border = 8) { const command = { op: 'ninepatch', texture, x, y, width, height, border }; this.commands.push(command); renderer.drawNinePatch(this.context, command); }
    drawTileMap(texture, tileSize) {
      const columns = Math.ceil(this.width / tileSize) + 1, rows = Math.ceil(this.height / tileSize) + 1;
      this.commands.push({ op: 'tilemap', texture, tileSize, columns, rows });
      const firstColumn = Math.floor(this.view.x / tileSize), firstRow = Math.floor(this.view.y / tileSize);
      for (let row = firstRow; row <= firstRow + rows; row++) for (let column = firstColumn; column <= firstColumn + columns; column++) {
        const variant = (column * 31 + row * 17 + column * row * 7) & 3, grass = texture === 'grass';
        renderer.drawSprite(this.context, { texture, x: (column + .5) * tileSize - this.view.x, y: (row + .5) * tileSize - this.view.y, width: tileSize, height: tileSize, rotation: 0, scaleX: grass && (variant & 1) ? -1 : 1, scaleY: grass && (variant & 2) ? -1 : 1 });
      }
    }
    drawSprite(sprite, transform) {
      const command = { op: 'sprite', texture: sprite.texture, x: transform.x, y: transform.y, screenX: transform.x - this.view.x, screenY: transform.y - this.view.y, width: sprite.width, height: sprite.height, rotation: transform.rotation, scaleX: transform.scale.x * (sprite.flipX ? -1 : 1), scaleY: transform.scale.y * (sprite.flipY ? -1 : 1) };
      renderer.drawSprite(this.context, { ...command, x: command.screenX + transform.visualOffset.x, y: command.screenY + transform.visualOffset.y });
      this.commands.push(command);
    }
  }
  const size = object => {
    const renderer = object.getComponent(ShapeRenderer);
    return { width: (renderer?.width ?? 32) * Math.abs(object.transform.scale.x), height: (renderer?.height ?? 32) * Math.abs(object.transform.scale.y) };
  };
  const overlaps = (a, b) => {
    const sa = size(a), sb = size(b);
    return Math.abs(a.transform.x - b.transform.x) < (sa.width + sb.width) / 2 && Math.abs(a.transform.y - b.transform.y) < (sa.height + sb.height) / 2;
  };
  class Game {
    constructor() {
      this.objects = []; this.nextObjectId = 1; this.spatialRevision=0;this.input = new Input(); this.time = { deltaTime: 0, elapsed: 0, unscaledDeltaTime: 0, unscaledElapsed: 0 }; this.paused = false; this.worldBounds = null; this.random = new Random(1);
      this.physics = createPhysics(this, { Collider2D, CircleCollider2D, CharacterController2D, Projectile2D }, SpatialHash);
      this.componentIndex=new Map();this.tagIndex=new Map();
      this.background = '#0b2033'; this.started = false; this.disposed = false; this.canvas = null; this.tweens = []; this.cameraView = { x: 0, y: 0 }; this.debugColliders = false;
      this.audio = audioKit.createAudio({ window: win });
      this.sound = {
        playNote: (note, o) => this.audio.playNote(note, o),
        playSong: (song, o) => this.audio.playSong(song, o),
        stop: () => this.audio.stop(),
        playSound: (name, o = {}) => {
          const src = environment.resolveSound && environment.resolveSound(name);
          if (src) { const a = new win.Audio(src); a.volume = o.volume ?? 0.8; a.loop = Boolean(o.loop); a.play().catch(() => {}); return a; }
          return this.audio.playNote(name, o);
        },
      };
    }
    onCreate() {}
    onUpdate() {}
    onDrawUI() {}
    onDestroy() {}
    pause() { this.paused = true; }
    resume() { this.paused = false; }
    isPaused() { return this.paused; }
    getCameraView() { return { x: this.cameraView.x, y: this.cameraView.y }; }
    navigateUI() {
      const buttons=this.objects.filter(o=>o.active&&!o.destroyed).flatMap(o=>o.getComponents(Button)).filter(b=>b.enabled&&b.created);
      if(!this.input.isKeyPressed(Keys.TAB)||!buttons.length)return;
      const current=buttons.findIndex(b=>b.isFocused()), direction=this.input.isKeyDown(Keys.SHIFT)?-1:1;
      buttons[(current<0?(direction>0?0:buttons.length-1):(current+direction+buttons.length)%buttons.length)].focus();this.input.consumeKey(Keys.TAB);
    }
    getObjects() { return [...this.objects]; }
    updateComponentIndex(object) { for(const [type,objects] of this.componentIndex){if(!object.destroyed&&object.hasComponent(type))objects.add(object);else objects.delete(object);} }
    updateTagIndex(object,tag,added) { if(added&&!object.destroyed){if(!this.tagIndex.has(tag))this.tagIndex.set(tag,new Set());this.tagIndex.get(tag).add(object);}else{const objects=this.tagIndex.get(tag);objects?.delete(object);if(objects?.size===0)this.tagIndex.delete(tag);} }
    getObjectsWith(...types) {
      if(types.some(type=>typeof type!=='function'||(type!==Component&&!(type.prototype instanceof Component))))throw new Error('Oczekiwano klas komponentów');
      if(!types.length)return this.getObjects().filter(o=>!o.destroyed);
      const sets=types.map(type=>{if(!this.componentIndex.has(type))this.componentIndex.set(type,new Set(this.objects.filter(o=>!o.destroyed&&o.hasComponent(type))));return this.componentIndex.get(type);}).sort((a,b)=>a.size-b.size);
      return [...sets[0]].filter(o=>!o.destroyed&&sets.every(set=>set.has(o))).sort((a,b)=>a.id-b.id);
    }
    getObjectsWithTag(tag) { return [...(this.tagIndex.get(tag)||[])].filter(o=>!o.destroyed).sort((a,b)=>a.id-b.id); }
    getViewportWidth() { return this.canvas?.width ?? 640; }
    getViewportHeight() { return this.canvas?.height ?? 360; }
    setWorldBounds(x, y, width, height) { [x, y, width, height].forEach(v => finite(v, 'Granice świata')); if (width <= 0 || height <= 0) throw new Error('Niepoprawne granice'); this.worldBounds = { x, y, width, height }; }
    clearWorldBounds() { this.worldBounds = null; }
    createObject(name = 'Object') {
      if (this.disposed) throw new Error('Gra jest zamknięta.');
      if (this.objects.length >= 10000) throw new Error('Limit 10000 obiektów w scenie.');
      const object = new GameObject(this, name); this.objects.push(object); this.spatialRevision++;return object;
    }
    find(name) { return this.objects.find(o => o.name === name && !o.destroyed) ?? null; }
    addTween(tween) {
      for (const existing of tween.object.getComponents(Tween)) if (existing.property === tween.property) existing.cancel();
      if (!tween.completed) tween.object.addComponent(tween);
      return tween;
    }
    initialize() {
      for (let pass = 0; pass < 100; pass++) {
        let pending = false;
        for (const object of [...this.objects]) for (const component of [...object.components]) {
          if (!object.destroyed && !component.destroyed && !component.created) {
            pending = true; component.created = true; this.spatialRevision++;component.onCreate();
          }
        }
        if (!pending) return;
      }
      throw new Error('onCreate tworzy komponenty bez końca.');
    }
    start() {
      if (this.started || this.disposed) throw new Error('Scenę można uruchomić tylko raz.');
      this.started = true; this.onCreate(); this.initialize();
    }
    render() {
      const camera = this.objects.filter(o => o.active && !o.destroyed).flatMap(o => o.components)
        .find(c => c instanceof Camera2D && c.enabled && c.created && !c.destroyed);
      this.cameraView = camera ? camera.getView() : { x: 0, y: 0 };
      this.canvas.view = this.cameraView;
      const tiles = [];
      for (const object of this.objects) if (object.active && !object.destroyed) for (const component of object.components) if (component.enabled && component.created && !component.destroyed) {
        if (component instanceof TileMap) tiles.push(component); else component.onDrawBackground();
      }
      tiles.sort((a, b) => a.layer - b.layer || a.order - b.order);
      for (const tileMap of tiles) this.canvas.drawTileMap(tileMap.texture, tileMap.tileSize);
      const space = component => component.getComponent(UITransform)?.enabled || component.space === 'screen' ? 1 : 0;
      const renderers = this.objects.filter(o => o.active && !o.destroyed).flatMap(o => o.components)
        .filter(c => (c instanceof ShapeRenderer || c instanceof TextRenderer) && c.enabled && c.created && !c.destroyed)
        .sort((a, b) => space(a) - space(b) || a.layer - b.layer || a.order - b.order);
      for (const component of renderers) {
        this.canvas.view = space(component) ? { x: 0, y: 0 } : this.cameraView;
        const transform = component.transform, ui = component.getComponent(UITransform);
        const position = ui?.enabled ? ui.getCenter() : transform;
        if (component instanceof TextRenderer) component.onDrawUI();
        else if (component instanceof Sprite) this.canvas.drawSprite(component, { x: position.x, y: position.y, rotation: transform.rotation, scale: transform.scale, visualOffset: transform.visualOffset });
        else if (component.shape === 'circle') this.canvas.drawCircle(position.x + transform.visualOffset.x, position.y + transform.visualOffset.y, component.radius, component.color, transform.rotation, transform.scale);
        else this.canvas.drawRect(position.x + transform.visualOffset.x, position.y + transform.visualOffset.y, component.width, component.height, component.color, transform.rotation, transform.scale);
      }
      this.canvas.view = { x: 0, y: 0 };
      this.onDrawUI();
      for (const object of this.objects) if (object.active && !object.destroyed) {
        for (const component of object.components) if (!(component instanceof TextRenderer) && component.enabled && component.created && !component.destroyed) component.onDrawUI();
      }
      if (this.debugColliders) this.drawColliderDebug();
    }
    drawColliderDebug() {
      const ctx = this.canvas.context, view = this.cameraView;
      if (!ctx?.strokeRect) return;
      ctx.save?.();
      try {
        ctx.lineWidth = 1.5;
        for (const object of this.objects) {
          if (!object.active || object.destroyed) continue;
          const collider = object.components.find(c => c instanceof Collider2D && c.enabled && c.created && !c.destroyed) ?? null;
          const controller = object.getComponent(CharacterController2D);
          if (!collider && !(controller?.enabled && controller.created)) continue;
          const trigger = collider?.isTrigger || collider instanceof Trigger2D;
          ctx.strokeStyle = trigger ? '#64e9ff' : '#ffe38a';
          ctx.setLineDash?.(trigger ? [4, 3] : []);
          const x = object.transform.x - view.x, y = object.transform.y - view.y;
          if (collider instanceof CircleCollider2D) {
            ctx.beginPath(); ctx.arc(x, y, collider.radius, 0, Math.PI * 2); ctx.stroke();
          } else {
            const width = collider?.width ?? 32, height = collider?.height ?? 32;
            ctx.strokeRect(x - width / 2, y - height / 2, width, height);
          }
        }
      } finally { ctx.setLineDash?.([]); ctx.restore?.(); }
    }
    step(delta) {
      if (!this.started || this.disposed) return;
      finite(delta, 'Czas klatki'); if (delta < 0) throw new Error('Czas klatki nie może być ujemny.');
      delta = Math.min(delta, 0.1); this.time.unscaledDeltaTime = delta; this.time.unscaledElapsed += delta; this.time.deltaTime = this.paused ? 0 : delta;
      try {
        this.initialize(); this.canvas.clear(this.background);
        for (const o of this.objects) { const c = o.getComponent(CharacterController2D); if (c) c.velocity = { x: 0, y: 0 }; }
        const snapshot = [...this.objects];
        for(const o of snapshot)for(const b of o.getComponents(Button))if(!b.enabled||!o.active||o.destroyed||b.destroyed)b.blur();
        this.navigateUI();
        for (const mode of ['UI', 'WORLD']) {
          if(mode==='WORLD'){this.time.deltaTime=this.paused?0:delta;this.time.elapsed+=this.time.deltaTime;}
          if (mode === 'WORLD' && this.paused) continue;
          if (mode === 'WORLD') this.onUpdate(delta);
          for (const o of snapshot) if (o.active && !o.destroyed) for (const c of o.getComponents()) {
            if (c.enabled && c.created && !c.destroyed && !o.destroyed && c.updateMode === mode) c.onUpdate(delta);
          }
        }
        if (!this.paused) this.physics.step(delta);
        for (const o of snapshot) if (o.active && !o.destroyed) for (const c of o.getComponents()) {
          if (c.enabled && c.created && !c.destroyed && (c.updateMode === 'UI' || !this.paused)) c.onLateUpdate(c.updateMode === 'UI' ? delta : this.time.deltaTime);
        }
        this.objects = this.objects.filter(o => !o.destroyed); this.render();
      } finally { this.input.endFrame(); }
    }
    dispose() {
      if (this.disposed) return; this.disposed = true;
      for (const tween of this.tweens) tween.cancel(); this.tweens = [];
      for (const object of [...this.objects]) object.destroy();
      this.objects = []; this.input.clear(); this.onDestroy(); this.audio.dispose();
    }
  }

  const CONSOLE_ACTIONS = [
    { id: 'a', label: 'A', codes: [Keys.ACTION_A, Keys.SPACE] },
    { id: 'b', label: 'B', codes: [Keys.ACTION_B, Keys.Z] },
    { id: 'x', label: 'X', codes: [Keys.ACTION_X, Keys.X] },
    { id: 'y', label: 'Y', codes: [Keys.ACTION_Y, Keys.Y] },
    { id: 'select', label: 'SELECT', codes: [Keys.ACTION_SELECT, Keys.SHIFT] },
    { id: 'start', label: 'START', codes: [Keys.ACTION_START, Keys.ENTER] },
  ];
  const CONSOLE_DIRS = [
    { id: 'up', arrow: Keys.UP, wasd: Keys.W },
    { id: 'down', arrow: Keys.DOWN, wasd: Keys.S },
    { id: 'left', arrow: Keys.LEFT, wasd: Keys.A },
    { id: 'right', arrow: Keys.RIGHT, wasd: Keys.D },
  ];
  const CONSOLE_TWINS = { [Keys.ACTION_A]: Keys.SPACE, [Keys.ACTION_B]: Keys.Z, [Keys.ACTION_X]: Keys.X, [Keys.ACTION_Y]: Keys.Y, [Keys.ACTION_START]: Keys.ENTER, [Keys.ACTION_SELECT]: Keys.SHIFT };
  const CONSOLE_LABELS = { [Keys.UP]: '↑', [Keys.DOWN]: '↓', [Keys.LEFT]: '←', [Keys.RIGHT]: '→', [Keys.ACTION_A]: 'A', [Keys.ACTION_B]: 'B', [Keys.ACTION_X]: 'X', [Keys.ACTION_Y]: 'Y', [Keys.ACTION_START]: 'START', [Keys.ACTION_SELECT]: 'SELECT' };
  const CONSOLE_ORDER = [Keys.UP, Keys.DOWN, Keys.LEFT, Keys.RIGHT, Keys.W, Keys.A, Keys.S, Keys.D, Keys.ACTION_SELECT, Keys.ACTION_START, Keys.SHIFT, Keys.ENTER, Keys.ACTION_Y, Keys.ACTION_X, Keys.ACTION_B, Keys.ACTION_A, Keys.Y, Keys.X, Keys.Z, Keys.SPACE];
  function describeConsoleKeys(down) {
    const hidden = new Set();
    for (const [action, twin] of Object.entries(CONSOLE_TWINS)) if (down.has(action)) hidden.add(twin);
    const order = key => { const index = CONSOLE_ORDER.indexOf(key); return index < 0 ? 99 : index; };
    return [...down].filter(key => !hidden.has(key)).sort((a, b) => order(a) - order(b)).map(key => CONSOLE_LABELS[key] ?? key);
  }
  function mountConsole(element, game, doc) {
    if (!doc.getElementById('lab-console-style')) {
      const style = doc.createElement('style'); style.id = 'lab-console-style'; style.textContent = CONSOLE_STYLE; (doc.head || doc.body).append(style);
    }
    const existing = element.closest ? element.closest('.lab-console') : null;
    const parent = element.parentNode, next = element.nextSibling;
    let root = existing;
    if (!root) {
      root = doc.createElement('div');
      root.className = 'lab-console';
    root.innerHTML = '<div class="lab-console-shell"><div class="lab-console-brand">LAB·BOY</div><div class="lab-console-screen"></div>'
      + '<div class="lab-console-stats"><span data-stat="fps"><b>0</b> fps</span><span data-stat="avg"><b>0.0</b> ms śr.</span><span data-stat="max"><b>0</b> ms max</span><span class="lab-console-keys" data-stat="keys"></span></div>'
      + '<div class="lab-console-pad"><div class="lab-sys"><button type="button" class="lab-pill" data-wasd aria-pressed="false" title="Krzyżak steruje W A S D">WASD</button><button type="button" class="lab-pill" data-action="select">SELECT</button><button type="button" class="lab-pill" data-action="start">START</button></div>'
      + '<div class="lab-pad-row"><div class="lab-dpad">'
      + '<button type="button" data-dir="up" aria-label="W górę">▲</button><button type="button" data-dir="left" aria-label="W lewo">◀</button><span class="lab-dpad-hub" aria-hidden="true"></span><button type="button" data-dir="right" aria-label="W prawo">▶</button><button type="button" data-dir="down" aria-label="W dół">▼</button>'
      + '</div><div class="lab-actions"><button type="button" data-action="x"><span>X</span></button><button type="button" data-action="a"><span>A</span></button><button type="button" data-action="y"><span>Y</span></button><button type="button" data-action="b"><span>B</span></button></div></div></div></div>';
      parent.insertBefore(root, next);
    }
    root.querySelectorAll('.lab-view,.lab-boot').forEach(n => n.remove());
    root.querySelector('.lab-console-screen').append(element);
    const screen = root.querySelector('.lab-console-screen');
    screen.append(element);
    const viewOverlay = doc.createElement('div');
    viewOverlay.className = 'lab-view';
    viewOverlay.innerHTML = '<span class="lab-view-tl"></span><span class="lab-view-tr"></span><span class="lab-view-br"></span>';
    screen.append(viewOverlay);
    const viewEls = { tl: viewOverlay.querySelector('.lab-view-tl'), tr: viewOverlay.querySelector('.lab-view-tr'), br: viewOverlay.querySelector('.lab-view-br') };
    let viewEnabled = false;
    const setView = enabled => { viewEnabled = Boolean(enabled); viewOverlay.classList.toggle('on', viewEnabled); };
    let boot = doc.createElement('div');
    boot.className = 'lab-boot';
    boot.innerHTML = '<span class="lab-boot-logo">LAB·BOY</span><span class="lab-boot-bar"><i></i></span>';
    screen.append(boot);
    const statsEls = { fps: root.querySelector('[data-stat="fps"] b'), avg: root.querySelector('[data-stat="avg"] b'), max: root.querySelector('[data-stat="max"] b'), keys: root.querySelector('[data-stat="keys"]') };
    const stats = frameStatsFactory(3000);
    let wasd = false;
    const held = new Map();
    const dirButtons = [...root.querySelectorAll('[data-dir]')], actionButtons = [...root.querySelectorAll('[data-action]')];
    const wasdButton = root.querySelector('[data-wasd]');
    wasd = wasdButton.getAttribute('aria-pressed') === 'true';
    const dirCodes = dir => { const d = CONSOLE_DIRS.find(x => x.id === dir); return wasd ? [d.wasd] : [d.arrow]; };
    const buttonCodes = button => button.dataset.dir ? dirCodes(button.dataset.dir) : CONSOLE_ACTIONS.find(a => a.id === button.dataset.action).codes;
    const press = codes => codes.forEach(code => game.input.setKey(code, true));
    const release = codes => codes.forEach(code => game.input.setKey(code, false));
    const onPadDown = event => {
      event.preventDefault();
      const button = event.currentTarget, codes = buttonCodes(button);
      button.setPointerCapture?.(event.pointerId);
      held.set(event.pointerId, { button, codes });
      press(codes); button.classList.add('down');
    };
    const onPadUp = event => {
      const entry = held.get(event.pointerId);
      if (!entry) return;
      held.delete(event.pointerId); release(entry.codes); entry.button.classList.remove('down');
    };
    for (const button of [...dirButtons, ...actionButtons]) {
      button.addEventListener('pointerdown', onPadDown); button.addEventListener('pointerup', onPadUp);
      button.addEventListener('pointercancel', onPadUp); button.addEventListener('lostpointercapture', onPadUp);
    }
    const onWasd = () => {
      wasd = !wasd; wasdButton.setAttribute('aria-pressed', String(wasd)); wasdButton.classList.toggle('down', wasd);
      for (const entry of held.values()) if (entry.button.dataset.dir) { release(entry.codes); entry.codes = dirCodes(entry.button.dataset.dir); press(entry.codes); }
    };
    wasdButton.addEventListener('click', onWasd);
    const releaseAll = () => { for (const entry of held.values()) { release(entry.codes); entry.button.classList.remove('down'); } held.clear(); };
    let lastUi = 0;
    const update = now => {
      if (boot) { const overlay = boot; boot = null; overlay.classList.add('hide'); win.setTimeout?.(() => overlay.remove(), 400); }
      if (now - lastUi < 250) return;
      lastUi = now;
      const s = stats.snapshot(now);
      statsEls.fps.textContent = String(Math.round(s.fps)); statsEls.avg.textContent = s.avgMs.toFixed(1); statsEls.max.textContent = s.maxMs.toFixed(0);
      statsEls.keys.textContent = describeConsoleKeys(game.input.down).join(' ');
      if (viewEnabled) {
        const v = game.cameraView || { x: 0, y: 0 }, fmt = n => String(Math.round(n));
        viewEls.tl.textContent = `${fmt(v.x)}, ${fmt(v.y)}`;
        viewEls.tr.textContent = `x: ${fmt(v.x + game.canvas.width)}`;
        viewEls.br.textContent = `y: ${fmt(v.y + game.canvas.height)}`;
      }
      for (const button of dirButtons) {
        const d = CONSOLE_DIRS.find(x => x.id === button.dataset.dir);
        button.classList.toggle('down', [d.arrow, d.wasd].some(code => game.input.down.has(code)));
      }
      for (const button of actionButtons) button.classList.toggle('down', CONSOLE_ACTIONS.find(a => a.id === button.dataset.action).codes.some(code => game.input.down.has(code)));
    };
    const dispose = () => {
      releaseAll(); wasdButton.removeEventListener('click', onWasd);
      for (const button of [...dirButtons, ...actionButtons]) {
        button.removeEventListener('pointerdown', onPadDown); button.removeEventListener('pointerup', onPadUp);
        button.removeEventListener('pointercancel', onPadUp); button.removeEventListener('lostpointercapture', onPadUp);
      }
      boot?.remove(); boot = null;
      viewOverlay.remove();
      if (!existing && root.parentNode) { root.parentNode.insertBefore(element, root); root.remove(); }
    };
    return { root, stats, update, dispose, setView };
  }
  let current = null, factory = null, frame = null, cleanup = () => {}, lastTime = null, liveConsole = null;
  const debugFlags = { view: false, colliders: false };
  const applyDebugFlags = () => { if (current && !current.disposed) current.debugColliders = debugFlags.colliders; liveConsole?.setView(debugFlags.view); };
  win.addEventListener('message', event => {
    const message = event.data;
    if (message?.source !== 'web-learning-lab' || message.type !== 'game-debug') return;
    const payload = message.payload || {};
    if ('view' in payload) debugFlags.view = Boolean(payload.view);
    if ('colliders' in payload) debugFlags.colliders = Boolean(payload.colliders);
    applyDebugFlags();
  });
  assetsReady.then(() => { if (current && current.started && !current.disposed) current.render(); });
  function stopLoop() { if (frame !== null) caf(frame); frame = null; lastTime = null; }
  function dispose() { stopLoop(); cleanup(); cleanup = () => {}; liveConsole = null; current?.dispose(); current = null; }
  function snapshot(game = current) {
    if (!game) return null;
    const result = {
      width: game.canvas.width, height: game.canvas.height, elapsed: game.time.elapsed, unscaledElapsed: game.time.unscaledElapsed, paused: game.paused, camera: { ...game.cameraView },
      objects: game.objects.filter(o => !o.destroyed).map(o => {
        const renderer = o.getComponent(ShapeRenderer);
        return {
          name: o.name, x: o.transform.x, y: o.transform.y, hp: o.hp ?? null,
          rotation: o.transform.rotation, scaleX: o.transform.scale.x, scaleY: o.transform.scale.y, active: o.active,
          components: o.components.map(c => componentNames.get(c.constructor) || c.constructor.name),
          componentState: Object.fromEntries(o.getComponents().map(c => [componentNames.get(c.constructor) || c.constructor.name, Object.fromEntries(Object.entries(c).filter(([key,value]) => !['gameObject','created','destroyed'].includes(key) && (['number','boolean','string'].includes(typeof value) || value instanceof Vector2)).map(([key,value]) => [key,value instanceof Vector2 ? {x:value.x,y:value.y} : value]))])),
          visualOffsetX: o.transform.visualOffset.x, visualOffsetY: o.transform.visualOffset.y,
          renderer: renderer ? { kind: componentNames.get(renderer.constructor) || renderer.constructor.name, width: renderer.width, height: renderer.height, color: renderer.color, texture: renderer.texture ?? null } : null,
        };
      }),
      commands: game.canvas.commands.map(c => ({ ...c })),
    };
    result.objectsByName = {};
    for (const object of result.objects) if (!Object.hasOwn(result.objectsByName, object.name)) Object.defineProperty(result.objectsByName, object.name, {value:object,enumerable:true});
    return result;
  }
  function createScene(canvas) {
    const game = new factory();
    if (!(game instanceof Game)) throw new Error('Twoja scena musi rozszerzać GameLab.Game.');
    game.canvas = new Canvas(canvas); return game;
  }
  function run(GameClass, config = {}) {
    dispose(); factory = GameClass;
    const element = typeof config.canvas === 'string' ? doc.querySelector(config.canvas) : config.canvas || doc.querySelector('#game');
    if (!element) throw new Error('Brak canvas #game w index.html.');
    current = createScene(element);
    const game = current;
    const consoleHandle = element.parentNode ? mountConsole(element, game, doc) : { root: element, stats: frameStatsFactory(3000), update: () => {}, dispose: () => {}, setView: () => {} };
    liveConsole = consoleHandle;
    applyDebugFlags();
    game.audio.bindGestures(consoleHandle.root);
    const resize = () => game.canvas.resize(640, 480, win.devicePixelRatio || 1);
    const down = event => { if ([Keys.LEFT, Keys.RIGHT, Keys.UP, Keys.DOWN, ' '].includes(event.key)) event.preventDefault(); game.input.setKey(event.key, true); };
    const up = event => game.input.setKey(event.key, false);
    const blur = () => game.input.clear();
    const focus = () => element.focus();
    const pointer = event => { const rect = element.getBoundingClientRect(); const p = game.canvas.toLogical(event.clientX-rect.left, event.clientY-rect.top); game.input.setPointer(p.x, p.y); };
    const pointerDown = event => { pointer(event); game.input.setMouseButton(event.button, true); element.setPointerCapture?.(event.pointerId); };
    const pointerUp = event => { pointer(event); game.input.setMouseButton(event.button, false); };
    element.addEventListener('pointermove', pointer); element.addEventListener('pointerdown', pointerDown); element.addEventListener('pointerup', pointerUp); element.addEventListener('pointercancel', blur);
    element.tabIndex = 0; element.addEventListener('pointerdown', focus); element.addEventListener('keydown', down); element.addEventListener('keyup', up); element.addEventListener('blur', blur);
    win.addEventListener('blur', blur); win.addEventListener('resize', resize);
    const observer = win.ResizeObserver ? new win.ResizeObserver(resize) : null; observer?.observe(element);
    cleanup = () => {
      element.removeEventListener('pointermove', pointer); element.removeEventListener('pointerdown', pointerDown); element.removeEventListener('pointerup', pointerUp); element.removeEventListener('pointercancel', blur);
      observer?.disconnect(); element.removeEventListener('pointerdown', focus); element.removeEventListener('keydown', down); element.removeEventListener('keyup', up); element.removeEventListener('blur', blur);
      win.removeEventListener('blur', blur); win.removeEventListener('resize', resize);
      consoleHandle.dispose();
    };
    const tick = now => {
      if (game !== current || game.disposed) return;
      try {
        const deltaMs = lastTime === null ? 0 : now - lastTime;
        if (deltaMs > 0) consoleHandle.stats.push(deltaMs, now);
        game.step(deltaMs / 1000); lastTime = now; consoleHandle.update(now); frame = raf(tick);
      }
      catch (error) { stopLoop(); win.dispatchEvent(new win.ErrorEvent('error', { error, message: error.message })); }
    };
    const start = () => { if(game!==current||game.disposed)return game;resize();game.start();game.step(0);frame=raf(tick);return game; };
    if(environment.skipAssetLoading||!win.Image) { try {start();game.ready=Promise.resolve(game);}catch(error){dispose();throw error;} }
    else { game.ready=assetsReady.then(start);game.ready.catch(error=>{if(game===current){dispose();win.dispatchEvent(new win.ErrorEvent('error',{error,message:error.message}));}}); }
    return game;
  }
  function evaluateScenario(scenario = {}) {
    if (!factory || !current) throw new Error('Uruchom scenę przez GameLab.run(YourGame).');
    // A detached canvas avoids disturbing the live game while using its real render path.
    const game = createScene(doc.createElement('canvas'));
    try {
      game.canvas.resize(scenario.width ?? 640, scenario.height ?? 360); game.start(); game.step(0);
      const applyActions = actions => {
        for (const action of actions || []) {
          const object = action.object == null ? game : game.find(action.object);
          const target = action.component === 'input' && object === game ? game.input : action.component ? object?.getComponents().find(c => (componentNames.get(c.constructor) || c.constructor.name) === action.component) : object;
          if (!target || ['constructor','__proto__','prototype'].includes(action.method) || typeof target[action.method] !== 'function') throw new Error(`Niepoprawna akcja scenariusza: ${action.method}`);
          target[action.method](...(action.args || []));
        }
      };
      applyActions(scenario.actions);
      const phases = scenario.phases || [{ keys: scenario.keys || [], steps: scenario.steps ?? 1, delta: scenario.delta ?? 0.1 }];
      for (const phase of phases) {
        applyActions(phase.actions);
        for (const key of [...game.input.down]) if (!(phase.keys || []).map(normalizeKey).includes(key)) game.input.setKey(key, false);
        for (const key of phase.keys || []) game.input.setKey(key, true);
        if (phase.pointer) game.input.setPointer(phase.pointer.x, phase.pointer.y);
        for (let button = 0; button <= 4; button++) game.input.setMouseButton(button, (phase.mouseButtons || []).includes(button));
        if (phase.width !== undefined || phase.height !== undefined) game.canvas.resize(phase.width ?? game.canvas.width, phase.height ?? game.canvas.height);
        const steps = phase.steps ?? 1;
        if (!Number.isInteger(steps) || steps < 0 || steps > 500) throw new Error('Scenariusz może mieć 0–500 kroków.');
        for (let i = 0; i < steps; i++) game.step(phase.delta ?? 0.1);
      }
      return snapshot(game);
    } finally { game.dispose(); }
  }
  win.addEventListener('pagehide', dispose);
  const addons=createAddons({Component,GameObject,Vector2,CharacterController2D,Sprite,Collider2D,CircleCollider2D,Trigger2D});
  for(const [name,type] of Object.entries(addons))componentNames.set(type,name);
  return { renderer, ...addons, Assets, Keys, UIAnchor, UITransform, Vector2, Random, ProgressBar, Button, Game, GameObject, Component, Transform, InputManager: Input, Input, Canvas, ShapeRenderer, Sprite, TextRenderer, ControlsHint, Camera2D, TileMap, Tween, Tweens, Collider2D, CircleCollider2D, Projectile2D, Trigger2D, CharacterController2D, Song: audioKit.Song, Sequencer: audioKit.Sequencer, run, dispose, snapshot, evaluateScenario, assetsReady, get current() { return current; } };
}

export function getGameRuntimeScript() {
  return `window.GameLab = (${createGameLab.toString()})({}, {Assets:Object.freeze(${JSON.stringify(Assets)}),assetManifest:${JSON.stringify(assetManifest)},SpatialHash:(${SpatialHash.toString()}),createPhysics:(${createPhysics.toString()}),createRenderer:(${createRenderer.toString()}),createAddons:(${createAddons.toString()}),createLabAudio:(${createLabAudio.toString()}),createFrameStats:(${createFrameStats.toString()}),Keys:Object.freeze(${JSON.stringify(defaultKeys)})});`;
}
