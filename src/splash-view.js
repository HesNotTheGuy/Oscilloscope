'use strict';
// ── Animated phosphor sine sweep ──────────────────────────────────
const cvs = document.getElementById('scope');
const ctx = cvs.getContext('2d');
let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);

function resize() {
  const r = cvs.getBoundingClientRect();
  W = r.width; H = r.height;
  cvs.width = Math.round(W * dpr);
  cvs.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize();
window.addEventListener('resize', resize);

const GREEN = '#00ff41';
let t = 0;

function drawGrid() {
  ctx.strokeStyle = 'rgba(26,58,26,0.55)';
  ctx.lineWidth = 1;
  const stepX = W / 10, stepY = H / 5;
  ctx.beginPath();
  for (let i = 1; i < 10; i++) { ctx.moveTo(i * stepX, 0); ctx.lineTo(i * stepX, H); }
  for (let j = 1; j < 5; j++)  { ctx.moveTo(0, j * stepY); ctx.lineTo(W, j * stepY); }
  ctx.stroke();
  // brighter center axes
  ctx.strokeStyle = 'rgba(26,74,26,0.8)';
  ctx.beginPath();
  ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2);
  ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H);
  ctx.stroke();
}

function wave(offset, amp, alpha, width) {
  ctx.beginPath();
  for (let x = 0; x <= W; x += 2) {
    const k = x / W;
    // two summed sines + gentle envelope so it looks "live"
    const y = H / 2
      + Math.sin(k * Math.PI * 4 + t + offset) * amp * Math.sin(k * Math.PI)
      + Math.sin(k * Math.PI * 9 - t * 1.7 + offset) * amp * 0.28;
    x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = width;
  ctx.shadowColor = GREEN;
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function frame() {
  ctx.clearRect(0, 0, W, H);
  drawGrid();
  const amp = H * 0.26;
  wave(0.25, amp, 0.15, 2);   // afterglow trail
  wave(0,    amp, 1,    2.4); // bright trace
  t += 0.05;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ── Reassurance messaging if load runs long ───────────────────────
const stateText = document.getElementById('stateText');
setTimeout(() => { stateText.textContent = 'Still loading'; }, 7000);
setTimeout(() => { stateText.textContent = 'Almost there — hang tight'; }, 15000);
