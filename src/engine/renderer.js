export function createRenderer(manifest) {
  const entries = new Map(manifest.assets.map(a => [a.key, a]));
  const aliases = { wall: 'stone', projectile: 'fireball', player01: 'player' };
  const images = new Map();
  let loading;
  function entry(key) {
    const result = entries.get(aliases[key] || key);
    if (!result) throw new Error(`Brak tekstury: ${key}`);
    return result;
  }
  function load(win, base = '/game-assets/') {
    if (!win.Image) return Promise.resolve();
    const warn = message => win.console?.warn?.(`[game-assets] ${message}`);
    return loading ||= Promise.all([...new Set(manifest.assets.map(a => a.source))].map(source => new Promise(resolve => {
      const image = new win.Image();
      const timer = win.setTimeout?.(() => { warn(`Przekroczono czas ładowania tekstury: ${source}`); resolve(); }, 8000);
      const done = ok => { win.clearTimeout?.(timer); if (ok) images.set(source, image); else warn(`Nie można załadować tekstury: ${source}`); resolve(); };
      image.onload = () => done(true); image.onerror = () => done(false); image.src = base + source;
    })));
  }
  function drawSprite(ctx, command, clip = 1) {
    const a = entry(command.texture), image = images.get(a.source); if (!image) return;
    const f = a.frame; const ratio = Math.max(0, Math.min(1, clip)); if (!ratio) return;
    ctx.save();
    try {
      ctx.imageSmoothingEnabled = false; ctx.translate(command.x, command.y); ctx.rotate(command.rotation || 0); ctx.scale(command.scaleX ?? 1, command.scaleY ?? 1);
      ctx.drawImage(image, f.x, f.y, f.w * ratio, f.h, -command.width / 2, -command.height / 2, command.width * ratio, command.height);
    } finally { ctx.restore(); }
  }
  function drawNinePatch(ctx, command) {
    const a = entry(command.texture), image = images.get(a.source); if (!image) return;
    const f = a.frame;
    const slice = a.ninePatch || { left: 12, top: 12, right: 12, bottom: 12 };
    const border = Math.max(0, Math.min(command.border ?? 8, command.width / 2, command.height / 2));
    const sx = [f.x, f.x + slice.left, f.x + f.w - slice.right, f.x + f.w];
    const sy = [f.y, f.y + slice.top, f.y + f.h - slice.bottom, f.y + f.h];
    const dx = [command.x - command.width / 2, command.x - command.width / 2 + border, command.x + command.width / 2 - border, command.x + command.width / 2];
    const dy = [command.y - command.height / 2, command.y - command.height / 2 + border, command.y + command.height / 2 - border, command.y + command.height / 2];
    ctx.imageSmoothingEnabled = false;
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) if (dx[col+1] > dx[col] && dy[row+1] > dy[row]) ctx.drawImage(image, sx[col], sy[row], sx[col+1]-sx[col], sy[row+1]-sy[row], dx[col], dy[row], dx[col+1]-dx[col], dy[row+1]-dy[row]);
  }
  function drawProgress(ctx, command) {
    const frame = entry(command.frame), inset = frame.barInset || { left: .17, top: .24, right: .17, bottom: .26 };
    const w = command.width * (1 - inset.left - inset.right), h = command.height * (1 - inset.top - inset.bottom);
    const x = command.x + command.width * (inset.left - inset.right) / 2, y = command.y + command.height * (inset.top - inset.bottom) / 2;
    drawSprite(ctx, { texture: command.track, x, y, width: w, height: h });
    drawSprite(ctx, { texture: command.fill, x, y, width: w, height: h }, command.progress / 100);
    drawNinePatch(ctx, { texture: command.frame, x: command.x, y: command.y, width: command.width, height: command.height, border: Math.min(10, command.height / 3) });
  }
  function draw(ctx, command) {
    if (command.op === 'rect') {
      ctx.save();
      try {ctx.translate(command.x,command.y);ctx.rotate(command.rotation||0);ctx.scale(command.scaleX??1,command.scaleY??1);ctx.fillStyle=command.color||'#76b9f2';ctx.fillRect(-command.width/2,-command.height/2,command.width,command.height);}
      finally {ctx.restore();}
    }
    if (command.op === 'circle') {
      ctx.save();
      try {
        ctx.translate(command.x, command.y); ctx.rotate(command.rotation || 0);
        ctx.scale(command.scaleX ?? 1, command.scaleY ?? 1);
        ctx.fillStyle = command.color || '#76b9f2';
        ctx.beginPath(); ctx.arc(0, 0, command.radius, 0, Math.PI * 2); ctx.fill();
      } finally { ctx.restore(); }
    }
    if (command.op === 'text') {
      ctx.fillStyle=command.color||'#ffffff';ctx.font=`${command.fontSize||16}px monospace`;ctx.textAlign=command.align||'center';ctx.textBaseline=command.baseline||'middle';ctx.fillText(String(command.text??''),command.x,command.y);
    }
    if (command.op === 'sprite') drawSprite(ctx, command);
    if (command.op === 'ninepatch') drawNinePatch(ctx, command);
    if (command.op === 'progress') drawProgress(ctx, command);
  }
  return { entries, images, load, draw, drawSprite, drawNinePatch, drawProgress };
}
