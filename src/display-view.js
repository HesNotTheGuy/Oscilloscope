'use strict';
const canvas  = document.getElementById('display-canvas');
const ctx     = canvas.getContext('2d');
const waiting = document.getElementById('waiting');

function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

// Draw incoming frames maintaining aspect ratio
const img = new Image();
img.onload = () => {
  waiting.style.display = 'none';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(
    canvas.width  / img.naturalWidth,
    canvas.height / img.naturalHeight
  );
  const w = img.naturalWidth  * scale;
  const h = img.naturalHeight * scale;
  ctx.drawImage(img,
    (canvas.width  - w) / 2,
    (canvas.height - h) / 2,
    w, h
  );
};

window.displayAPI.onFrame(dataURL => { img.src = dataURL; });

// ── Close overlay: show on mouse move, hide after idle ──
let _hideTimer = null;
document.addEventListener('mousemove', () => {
  document.body.classList.add('show-close');
  clearTimeout(_hideTimer);
  _hideTimer = setTimeout(() => document.body.classList.remove('show-close'), 2500);
});

document.getElementById('close-overlay').addEventListener('click', () => {
  window.displayAPI.requestClose();
});

// Escape key closes the display window
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.displayAPI.requestClose();
});
