export function createPhysics(game, types, SpatialHash) {
  const { Collider2D, CircleCollider2D, CharacterController2D, Projectile2D } = types;
  const EPS = 1e-6;
  const index = new SpatialHash(); const bodies = new Map(); let builtRevision = -1;
  const live = o => o.active && !o.destroyed;
  const collider = o => o.getComponent(Collider2D);
  const ready = o => { const c = collider(o); return live(o) && c?.enabled && c.created && !c.destroyed; };
  const extent = (o, axis) => { const c = collider(o); return c instanceof CircleCollider2D ? c.radius : (axis === 'x' ? c?.width ?? 32 : c?.height ?? 32) / 2; };
  const box = (o, dx = 0, dy = 0) => ({ left: o.transform.x + Math.min(0, dx) - extent(o, 'x'), top: o.transform.y + Math.min(0, dy) - extent(o, 'y'), right: o.transform.x + Math.max(0, dx) + extent(o, 'x'), bottom: o.transform.y + Math.max(0, dy) + extent(o, 'y') });
  const circle = o => collider(o) instanceof CircleCollider2D;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const overlaps = (a, b, margin = EPS) => {
    const dx = a.transform.x - b.transform.x, dy = a.transform.y - b.transform.y;
    if (circle(a) && circle(b)) return dx * dx + dy * dy <= (extent(a, 'x') + extent(b, 'x') + margin) ** 2;
    if (circle(a) || circle(b)) {
      const c = circle(a) ? a : b, r = circle(a) ? b : a;
      const x = c.transform.x - clamp(c.transform.x, r.transform.x - extent(r, 'x'), r.transform.x + extent(r, 'x'));
      const y = c.transform.y - clamp(c.transform.y, r.transform.y - extent(r, 'y'), r.transform.y + extent(r, 'y'));
      return x * x + y * y <= (extent(c, 'x') + margin) ** 2;
    }
    return Math.abs(dx) <= extent(a, 'x') + extent(b, 'x') + margin && Math.abs(dy) <= extent(a, 'y') + extent(b, 'y') + margin;
  };
  const masks = (a, b) => (collider(a).mask & collider(b).layer) !== 0 && (collider(b).mask & collider(a).layer) !== 0;
  const sensor = o => collider(o)?.isTrigger;
  const ignored = (a, b) => a.getComponent(Projectile2D)?.owner === b || b.getComponent(Projectile2D)?.owner === a;
  function rebuild() {
    if(builtRevision===game.spatialRevision)return;
    for (const id of bodies.keys()) index.remove(id); bodies.clear();
    for (const o of game.getObjects()) if (ready(o)) { bodies.set(o.id, o); index.insert(o.id, box(o)); }
    builtRevision=game.spatialRevision;
  }
  function candidates(bounds) { return index.queryAabb(bounds).map(id => bodies.get(id)).filter(ready); }
  function circleHit(sx, sy, dx, dy, x, y, r) {
    const ox = sx - x, oy = sy - y, c = ox * ox + oy * oy - r * r;
    if (c <= EPS) return 0;
    const a = dx * dx + dy * dy, b = 2 * (ox * dx + oy * dy), d = b * b - 4 * a * c;
    if (!a || d < 0) return 2;
    const t = (-b - Math.sqrt(d)) / (2 * a); return t >= 0 && t <= 1 ? t : 2;
  }
  function rectHit(sx, sy, dx, dy, x, y, w, h) {
    let entry = 0, exit = 1;
    for (const [p, d, lo, hi] of [[sx, dx, x - w, x + w], [sy, dy, y - h, y + h]]) {
      if (!d) { if (p < lo || p > hi) return 2; continue; }
      const a = (lo - p) / d, b = (hi - p) / d;
      entry = Math.max(entry, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
      if (entry > exit) return 2;
    }
    return entry;
  }
  function hit(a, b, dx, dy) {
    const sx = a.transform.x, sy = a.transform.y, x = b.transform.x, y = b.transform.y;
    if (circle(a) && circle(b)) return circleHit(sx, sy, dx, dy, x, y, extent(a, 'x') + extent(b, 'x'));
    if (circle(a) || circle(b)) {
      const c = circle(a) ? a : b, rect = circle(a) ? b : a, r = extent(c, 'x'), w = extent(rect, 'x'), h = extent(rect, 'y');
      let t = Math.min(rectHit(sx, sy, dx, dy, x, y, w + r, h), rectHit(sx, sy, dx, dy, x, y, w, h + r));
      for (const i of [-1, 1]) for (const j of [-1, 1]) t = Math.min(t, circleHit(sx, sy, dx, dy, x + i * w, y + j * h, r));
      return t;
    }
    return rectHit(sx, sy, dx, dy, x, y, extent(a, 'x') + extent(b, 'x'), extent(a, 'y') + extent(b, 'y'));
  }
  const stats = { candidates: 0, narrowPhaseTests: 0 };
  const contacts = new Set();
  let previousContacts = new Set();
  function dispatch(a, b, trigger) {
    const key = `${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`;
    if (contacts.has(key) || !ready(a) || !ready(b)) return;
    contacts.add(key);
    const before=game.spatialRevision;
    for (const [o, other] of [[a, b], [b, a]]) {
      if(ready(o)&&ready(other)&&!previousContacts.has(key))collider(o).fireContactEnter?.(other);
      for (const c of o.getComponents()) {
        if (!ready(o) || !ready(other) || game.disposed) break;
        if (c.enabled && c.created && !c.destroyed) c[trigger ? 'onTrigger' : 'onCollision'](other);
      }
    }
    if(game.spatialRevision!==before)rebuild();
  }
  function step(delta) {
    rebuild(); contacts.clear(); stats.candidates = stats.narrowPhaseTests = 0;
    for (const o of [...bodies.values()]) {
      const v = o.getComponent(CharacterController2D); if (!ready(o) || !v?.enabled || !v.created) continue;
      const p = o.getComponent(Projectile2D);
      if (p?.enabled) {
        const dt = Math.min(delta, p.remainingLifetime), dx = v.velocity.x * dt, dy = v.velocity.y * dt;
        const hits = [];
        for (const other of candidates(box(o, dx, dy))) {
          stats.candidates++;
          if (other === o || ignored(o, other) || !masks(o, other) || !(collider(other).layer & p.hitLayers) || p.hitObjects.has(other.id)) continue;
          stats.narrowPhaseTests++; const t = hit(o, other, dx, dy); if (t <= 1) hits.push({ other, t });
        }
        hits.sort((a, b) => a.t - b.t || a.other.id - b.other.id);
        const sx = o.transform.x, sy = o.transform.y;
        for (const { other, t } of hits) {
          if (!ready(o) || !ready(other)) continue;
          o.setPosition(sx + dx * t, sy + dy * t); dispatch(o, other, true);
          p.hitObjects.add(other.id); p.hits++;
          if (p.hits >= p.maxHits) o.destroy();
        }
        if (live(o)) { o.setPosition(sx + dx, sy + dy); p.remainingLifetime = Math.max(0, p.remainingLifetime - dt); if (p.remainingLifetime <= EPS) o.destroy(); }
      } else for (const axis of ['x', 'y']) {
        const movement = v.velocity[axis] * delta; if (!movement) continue;
        const dx = axis === 'x' ? movement : 0, dy = axis === 'y' ? movement : 0;
        let travel = 1; const collisions = [];
        for (const other of candidates(box(o, dx, dy))) {
          stats.candidates++;
          if (other === o || !masks(o, other) || ignored(o, other) || other.getComponent(Projectile2D)?.enabled) continue;
          stats.narrowPhaseTests++;
          // At a starting tangent, moving away or along it must remain possible.
          const old = o.transform[axis]; o.transform[axis] += Math.sign(movement) * EPS * 4;
          const entering = overlaps(o, other, -EPS); o.transform[axis] = old;
          const t = hit(o, other, dx, dy);
          if (t > 1 || (t === 0 && !entering)) continue;
          const trigger = sensor(o) || sensor(other);
          collisions.push({ other, t, trigger }); if (!trigger) travel = Math.min(travel, t);
        }
        o.transform[axis] += movement * travel;
        for (const { other, t, trigger } of collisions.sort((a, b) => a.t - b.t || a.other.id - b.other.id)) if (t <= travel + EPS) dispatch(o, other, trigger);
      }
      if (live(o) && v.constrainToBounds && game.worldBounds) {
        const b = game.worldBounds, w = Math.min(extent(o, 'x'), b.width / 2), h = Math.min(extent(o, 'y'), b.height / 2);
        o.transform.x = clamp(o.transform.x, b.x + w, b.x + b.width - w); o.transform.y = clamp(o.transform.y, b.y + h, b.y + b.height - h);
      }
      if (ready(o)) index.update(o.id, box(o)); else index.remove(o.id);
      builtRevision=game.spatialRevision;
      if (live(o)) v.onAfterMove(delta);
    }
    for (const a of bodies.values()) if (ready(a) && !a.getComponent(Projectile2D)?.enabled) for (const b of candidates(box(a))) {
      if (!ready(a) || !ready(b) || b.id <= a.id || b.getComponent(Projectile2D)?.enabled || !masks(a, b) || ignored(a, b)) continue;
      stats.candidates++; stats.narrowPhaseTests++;
      if (overlaps(a, b)) dispatch(a, b, sensor(a) || sensor(b));
    }
    previousContacts = new Set(contacts);
  }
  function queryRadius(x, y, radius, layer = 0x7fffffff) {
    if (![x, y, radius].every(Number.isFinite) || radius < 0) throw new Error('Invalid radius query');
    // Direct writes to Transform are legal, so public queries refresh their snapshot.
    rebuild();
    return candidates({ left: x - radius, top: y - radius, right: x + radius, bottom: y + radius }).filter(o => {
      if (!(collider(o).layer & layer)) return false;
      const dx = x - o.transform.x, dy = y - o.transform.y;
      if (circle(o)) return dx * dx + dy * dy <= (radius + extent(o, 'x') + EPS) ** 2;
      return (x - clamp(x, o.transform.x - extent(o, 'x'), o.transform.x + extent(o, 'x'))) ** 2 + (y - clamp(y, o.transform.y - extent(o, 'y'), o.transform.y + extent(o, 'y'))) ** 2 <= (radius + EPS) ** 2;
    });
  }
  function findNearest(x, y, radius, layer) {
    let result = null, distance = Infinity;
    for (const o of queryRadius(x, y, radius, layer)) { const d = (o.transform.x - x) ** 2 + (o.transform.y - y) ** 2; if (d < distance) { result = o; distance = d; } }
    return result;
  }
  function refresh(){builtRevision=-1;rebuild();}
  return { step, overlaps, queryRadius, findNearest, refresh, stats, extent };
}
