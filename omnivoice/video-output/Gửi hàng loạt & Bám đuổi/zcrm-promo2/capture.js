const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
const [mode, ...rest] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('console', m => console.log('page:', m.text())); p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + path.resolve(process.env.HTML || 'reel.html') + '?capture');
  await p.evaluate(() => window.ready);
  const shot = async () => { const d = await p.evaluate(() => document.getElementById('c').toDataURL('image/png')); return Buffer.from(d.split(',')[1], 'base64'); };
  if (mode === 'stills') {
    for (const t of rest) { await p.evaluate(t => renderAt(t), +t); require('fs').writeFileSync(`still_${t}.png`, await shot()); }
  } else {
    const fps = 60, n = (+process.env.DUR || 15) * fps, ff = process.env.FF;
    const enc = spawn(ff, ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', process.env.OUT || 'video.mp4'], { stdio: ['pipe', 'ignore', 'inherit'] });
    for (let f = 0; f < n; f++) {
      await p.evaluate(t => renderAt(t), f / fps);
      if (!enc.stdin.write(await shot())) await new Promise(r => enc.stdin.once('drain', r));
      if (f % 120 === 0) console.log('frame', f);
    }
    enc.stdin.end(); await new Promise(r => enc.on('close', r));
  }
  await b.close();
})();
