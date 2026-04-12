'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  WaveGLRenderer  —  WebGL beam + GPU Gaussian glow, replaces Canvas shadowBlur
// ─────────────────────────────────────────────────────────────────────────────
export class WaveGLRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.W = canvas.width;
    this.H = canvas.height;

    const gl = canvas.getContext('webgl', {
      alpha: false, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'
    });
    if (!gl) throw new Error('WebGL not available');
    this.gl = gl;

    this._buildPrograms();
    this._buildQuadBuffer();
    this._buildFBOs();
    this._lineBuf    = gl.createBuffer();
    this._lineColBuf = gl.createBuffer();
    this._lineVerts  = new Float32Array(200000 * 2);
    this._lineCols   = new Float32Array(200000 * 4);

    // 2D overlay canvas for grid / measurements / CRT vignette
    const ov = document.createElement('canvas');
    ov.width = this.W; ov.height = this.H;
    ov.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    const parent = canvas.parentElement;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    canvas.insertAdjacentElement('afterend', ov);
    this.octx = ov.getContext('2d');
    this._ovCanvas = ov;
  }

  _mkShader(type, src) {
    const gl = this.gl, sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
      throw new Error('Shader: ' + gl.getShaderInfoLog(sh));
    return sh;
  }

  _mkProg(vs, fs) {
    const gl = this.gl, p = gl.createProgram();
    gl.attachShader(p, this._mkShader(gl.VERTEX_SHADER,   vs));
    gl.attachShader(p, this._mkShader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error('Link: ' + gl.getProgramInfoLog(p));
    return p;
  }

  _buildPrograms() {
    const gl = this.gl;

    // 1. Beam: renders thick-line quads with per-vertex color (screen-space → NDC)
    this._pBeam = this._mkProg(
      `attribute vec2 aP; attribute vec4 aC; uniform vec2 uR;
       varying vec4 vC;
       void main(){ vec2 c=(aP/uR)*2.0-1.0; gl_Position=vec4(c.x,-c.y,0.0,1.0); vC=aC; }`,
      `precision mediump float; varying vec4 vC;
       void main(){ gl_FragColor=vC; }`
    );
    this._b_aP = gl.getAttribLocation(this._pBeam, 'aP');
    this._b_aC = gl.getAttribLocation(this._pBeam, 'aC');
    this._b_uR = gl.getUniformLocation(this._pBeam, 'uR');

    // 2. Blur: separable 9-tap Gaussian (kernel sum = 1.000)
    this._pBlur = this._mkProg(
      `attribute vec2 aP; varying vec2 vU;
       void main(){ vU=aP*0.5+0.5; gl_Position=vec4(aP,0.0,1.0); }`,
      `precision mediump float;
       uniform sampler2D uT; uniform vec2 uD; varying vec2 vU;
       void main(){
         vec4 s=vec4(0.0);
         s+=texture2D(uT,vU+uD*-4.0)*0.0238;
         s+=texture2D(uT,vU+uD*-3.0)*0.0667;
         s+=texture2D(uT,vU+uD*-2.0)*0.1238;
         s+=texture2D(uT,vU+uD*-1.0)*0.1745;
         s+=texture2D(uT,vU        )*0.2224;
         s+=texture2D(uT,vU+uD* 1.0)*0.1745;
         s+=texture2D(uT,vU+uD* 2.0)*0.1238;
         s+=texture2D(uT,vU+uD* 3.0)*0.0667;
         s+=texture2D(uT,vU+uD* 4.0)*0.0238;
         gl_FragColor=s;
       }`
    );
    this._bl_aP = gl.getAttribLocation(this._pBlur, 'aP');
    this._bl_uT = gl.getUniformLocation(this._pBlur, 'uT');
    this._bl_uD = gl.getUniformLocation(this._pBlur, 'uD');

    // 3. Composite: phosphor decay + glow + sharp beam + afterglow hue shift
    this._pComp = this._mkProg(
      `attribute vec2 aP; varying vec2 vU;
       void main(){ vU=aP*0.5+0.5; gl_Position=vec4(aP,0.0,1.0); }`,
      `precision mediump float;
       uniform sampler2D uPh, uGl, uBm, uHl;
       uniform float uDk, uGS, uHS, uHlS;
       uniform vec3 uFl;
       varying vec2 vU;
       vec3 rgb2hsv(vec3 c){
         vec4 K=vec4(0.0,-1.0/3.0,2.0/3.0,-1.0);
         vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));
         vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));
         float d=q.x-min(q.w,q.y),e=1.0e-10;
         return vec3(abs(q.z+(q.w-q.y)/(6.0*d+e)),d/(q.x+e),q.x);
       }
       vec3 hsv2rgb(vec3 c){
         vec4 K=vec4(1.0,2.0/3.0,1.0/3.0,3.0);
         vec3 p=abs(fract(c.xxx+K.xyz)*6.0-K.www);
         return c.z*mix(K.xxx,clamp(p-K.xxx,0.0,1.0),c.y);
       }
       void main(){
         vec3 ph=texture2D(uPh,vU).rgb*uDk;
         if(uHS>0.0){
           vec3 hsv=rgb2hsv(ph);
           if(hsv.y>0.01 && hsv.z>0.01){
             hsv.x=fract(hsv.x+uHS);
             hsv.y=min(hsv.y*1.05,1.0);
             ph=hsv2rgb(hsv);
           }
         }
         vec3 gv=texture2D(uGl,vU).rgb*uGS;
         vec3 bm=texture2D(uBm,vU).rgb;
         vec3 hl=texture2D(uHl,vU).rgb*uHlS;
         gl_FragColor=vec4(clamp(ph+gv+bm+hl+uFl,0.0,1.0),1.0);
       }`
    );
    this._c_aP  = gl.getAttribLocation(this._pComp,  'aP');
    this._c_uPh = gl.getUniformLocation(this._pComp, 'uPh');
    this._c_uGl = gl.getUniformLocation(this._pComp, 'uGl');
    this._c_uBm = gl.getUniformLocation(this._pComp, 'uBm');
    this._c_uDk = gl.getUniformLocation(this._pComp, 'uDk');
    this._c_uGS = gl.getUniformLocation(this._pComp, 'uGS');
    this._c_uFl  = gl.getUniformLocation(this._pComp, 'uFl');
    this._c_uHS  = gl.getUniformLocation(this._pComp, 'uHS');
    this._c_uHl  = gl.getUniformLocation(this._pComp, 'uHl');
    this._c_uHlS = gl.getUniformLocation(this._pComp, 'uHlS');
  }

  _buildQuadBuffer() {
    const gl = this.gl;
    this._qBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._qBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  }

  _mkTex() {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.W, this.H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return t;
  }

  _mkFBO(tex) {
    const gl = this.gl, fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error('FBO incomplete');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fbo;
  }

  _buildFBOs() {
    const gl = this.gl;
    this._tBeam  = this._mkTex(); this._fBeam  = this._mkFBO(this._tBeam);
    this._tBlurH = this._mkTex(); this._fBlurH = this._mkFBO(this._tBlurH);
    this._tBlurV = this._mkTex(); this._fBlurV = this._mkFBO(this._tBlurV);
    this._tPhA   = this._mkTex(); this._fPhA   = this._mkFBO(this._tPhA);
    this._tPhB   = this._mkTex(); this._fPhB   = this._mkFBO(this._tPhB);
    this._tHalo  = this._mkTex(); this._fHalo  = this._mkFBO(this._tHalo);
    this._ping   = 0;
    [this._fBeam,this._fBlurH,this._fBlurV,this._fPhA,this._fPhB,this._fHalo].forEach(f => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT);
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // Build triangle-strip quad geometry for a polyline (screen space)
  // colors: optional array of [r,g,b,a] per point for gradient beam
  _buildLineGeom(pts, hw, colors) {
    const v = this._lineVerts;
    const c = this._lineCols;
    let vi = 0, ci = 0;
    for (let i = 0, N = pts.length - 1; i < N; i++) {
      const [x0,y0] = pts[i], [x1,y1] = pts[i+1];
      const dx=x1-x0, dy=y1-y0, len=Math.sqrt(dx*dx+dy*dy)||1;
      const nx=-dy/len*hw, ny=dx/len*hw;
      if (vi+12 > v.length) break;
      v[vi++]=x0-nx; v[vi++]=y0-ny;
      v[vi++]=x1-nx; v[vi++]=y1-ny;
      v[vi++]=x0+nx; v[vi++]=y0+ny;
      v[vi++]=x0+nx; v[vi++]=y0+ny;
      v[vi++]=x1-nx; v[vi++]=y1-ny;
      v[vi++]=x1+nx; v[vi++]=y1+ny;
      // Per-vertex color (6 verts per segment: 2 from pt i, 2 from pt i, 2 from pt i+1... actually 3 from i, 3 from i+1 pattern)
      if (colors) {
        const c0 = colors[i], c1 = colors[i+1];
        // Triangle 1: v0(i), v1(i+1), v2(i)  — Triangle 2: v3(i), v4(i+1), v5(i+1)
        c[ci++]=c0[0]; c[ci++]=c0[1]; c[ci++]=c0[2]; c[ci++]=c0[3];
        c[ci++]=c1[0]; c[ci++]=c1[1]; c[ci++]=c1[2]; c[ci++]=c1[3];
        c[ci++]=c0[0]; c[ci++]=c0[1]; c[ci++]=c0[2]; c[ci++]=c0[3];
        c[ci++]=c0[0]; c[ci++]=c0[1]; c[ci++]=c0[2]; c[ci++]=c0[3];
        c[ci++]=c1[0]; c[ci++]=c1[1]; c[ci++]=c1[2]; c[ci++]=c1[3];
        c[ci++]=c1[0]; c[ci++]=c1[1]; c[ci++]=c1[2]; c[ci++]=c1[3];
      }
    }
    return vi >> 1;
  }

  // colors: optional array of [r,g,b,a] per point (same length as pts) for gradient
  _addLine(pts, rgba, hw, colors) {
    const gl = this.gl, nv = this._buildLineGeom(pts, hw, colors);
    if (!nv) return;
    gl.useProgram(this._pBeam);
    gl.uniform2f(this._b_uR, this.W, this.H);

    // Position buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this._lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this._lineVerts.subarray(0, nv*2), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this._b_aP);
    gl.vertexAttribPointer(this._b_aP, 2, gl.FLOAT, false, 0, 0);

    // Color buffer — per-vertex gradient or uniform fallback
    if (colors && this._b_aC >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this._lineColBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this._lineCols.subarray(0, nv*4), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this._b_aC);
      gl.vertexAttribPointer(this._b_aC, 4, gl.FLOAT, false, 0, 0);
    } else if (this._b_aC >= 0) {
      // No gradient — use uniform color for all verts via vertexAttrib4fv
      gl.disableVertexAttribArray(this._b_aC);
      gl.vertexAttrib4fv(this._b_aC, rgba);
    }

    gl.drawArrays(gl.TRIANGLES, 0, nv);
  }

  _quad(prog, aLoc) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._qBuf);
    gl.enableVertexAttribArray(aLoc);
    gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // Reusable buffer — avoids allocating a new Float32Array every frame
  _rgbaBuf = new Float32Array(4);
  _rgba(color, alpha=1) {
    let r=0,g=1,b=0.25;
    if (color.startsWith('#') && color.length>=7) {
      r=parseInt(color.slice(1,3),16)/255;
      g=parseInt(color.slice(3,5),16)/255;
      b=parseInt(color.slice(5,7),16)/255;
    } else if (color.startsWith('hsl')) {
      const [h,s,l]=color.match(/[\d.]+/g).map(Number);
      const a=s/100*Math.min(l/100,1-l/100);
      const f=n=>{const k=(n+h/30)%12;return l/100-a*Math.max(-1,Math.min(k-3,9-k,1));};
      r=f(0);g=f(8);b=f(4);
    }
    this._rgbaBuf[0]=r; this._rgbaBuf[1]=g; this._rgbaBuf[2]=b; this._rgbaBuf[3]=alpha;
    return this._rgbaBuf;
  }

  // Main per-frame call
  // pointSets: Array of [x,y][] — primary + mirrors
  // glow:      blur spread in pixels
  // beamWidth: core line thickness in pixels
  // decay:     phosphor persistence (0=instant clear, 1=never)  — maps to 1-persistence
  // glowStr:   glow intensity multiplier
  // flashRGB:  [r,g,b] beat flash or null
  // extraGroups: optional [{pts:[[x,y][]],color:'#hex'},...] for multi-color rendering
  frame(pointSets, color, glow, beamWidth, decay, glowStr=0.7, flashRGB=null, hueShift=0, extraGroups=null, gradientColors=null, haloStr=0) {
    const gl = this.gl;
    const rgba = this._rgba(color, 1.0);
    const hw   = Math.max(0.5, beamWidth * 0.5);
    const step = Math.max(1.0, glow * 0.4);

    // 1. Render all beams → fBeam (additive blending, clear first)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fBeam);
    gl.viewport(0, 0, this.W, this.H);
    gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    for (let i = 0; i < pointSets.length; i++)
      this._addLine(pointSets[i], rgba, hw, gradientColors ? gradientColors[i] : null);
    // Extra color groups (e.g. scene overlay with independent color)
    if (extraGroups) {
      for (const g of extraGroups) {
        const c = this._rgba(g.color, 1.0);
        for (const pts of g.pts) this._addLine(pts, c, hw);
      }
    }
    gl.disable(gl.BLEND);

    // 2. Multi-pass Gaussian blur for smooth glow (2 iterations)
    gl.useProgram(this._pBlur);
    gl.uniform1i(this._bl_uT, 0);
    gl.activeTexture(gl.TEXTURE0);
    const bs = step * 0.6;
    // Iteration 1
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fBlurH);
    gl.viewport(0, 0, this.W, this.H);
    gl.bindTexture(gl.TEXTURE_2D, this._tBeam);
    gl.uniform2f(this._bl_uD, bs/this.W, 0);
    this._quad(this._pBlur, this._bl_aP);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fBlurV);
    gl.bindTexture(gl.TEXTURE_2D, this._tBlurH);
    gl.uniform2f(this._bl_uD, 0, bs/this.H);
    this._quad(this._pBlur, this._bl_aP);
    // Iteration 2 — refine
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fBlurH);
    gl.bindTexture(gl.TEXTURE_2D, this._tBlurV);
    gl.uniform2f(this._bl_uD, bs/this.W, 0);
    this._quad(this._pBlur, this._bl_aP);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fBlurV);
    gl.bindTexture(gl.TEXTURE_2D, this._tBlurH);
    gl.uniform2f(this._bl_uD, 0, bs/this.H);
    this._quad(this._pBlur, this._bl_aP);

    // 3. Halation — very wide soft bloom (black mist / diffusion filter)
    if (haloStr > 0) {
      const hs = step * 3.0 + 4.0;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._fBlurH);
      gl.bindTexture(gl.TEXTURE_2D, this._tBlurV);
      gl.uniform2f(this._bl_uD, hs/this.W, 0);
      this._quad(this._pBlur, this._bl_aP);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._fHalo);
      gl.viewport(0, 0, this.W, this.H);
      gl.bindTexture(gl.TEXTURE_2D, this._tBlurH);
      gl.uniform2f(this._bl_uD, 0, hs/this.H);
      this._quad(this._pBlur, this._bl_aP);
      // 2nd halation pass — even wider
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._fBlurH);
      gl.bindTexture(gl.TEXTURE_2D, this._tHalo);
      gl.uniform2f(this._bl_uD, hs/this.W, 0);
      this._quad(this._pBlur, this._bl_aP);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._fHalo);
      gl.bindTexture(gl.TEXTURE_2D, this._tBlurH);
      gl.uniform2f(this._bl_uD, 0, hs/this.H);
      this._quad(this._pBlur, this._bl_aP);
    }

    // 4. Composite: prevPhosphor*decay + glow*glowStr + beam → curPhosphor
    const [curF, curT, prevT] = this._ping === 0
      ? [this._fPhA, this._tPhA, this._tPhB]
      : [this._fPhB, this._tPhB, this._tPhA];
    gl.bindFramebuffer(gl.FRAMEBUFFER, curF);
    gl.viewport(0, 0, this.W, this.H);
    gl.useProgram(this._pComp);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, prevT);       gl.uniform1i(this._c_uPh, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this._tBlurV); gl.uniform1i(this._c_uGl, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this._tBeam);  gl.uniform1i(this._c_uBm, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this._tHalo);  gl.uniform1i(this._c_uHl, 3);
    gl.uniform1f(this._c_uDk, 1.0 - decay);
    gl.uniform1f(this._c_uGS, glowStr);
    gl.uniform1f(this._c_uHS, hueShift);
    gl.uniform1f(this._c_uHlS, haloStr);
    const fl = flashRGB || [0,0,0];
    gl.uniform3f(this._c_uFl, fl[0], fl[1], fl[2]);
    this._quad(this._pComp, this._c_aP);

    // 5. Blit phosphor → screen (blur shader as identity copy: uD=(0,0) → kernel sums to 1.0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.W, this.H);
    gl.useProgram(this._pBlur);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, curT);
    gl.uniform1i(this._bl_uT, 0); gl.uniform2f(this._bl_uD, 0, 0);
    this._quad(this._pBlur, this._bl_aP);

    this._ping ^= 1;
  }

  destroy() {
    this._ovCanvas.remove();
    const gl = this.gl;
    [this._fBeam,this._fBlurH,this._fBlurV,this._fPhA,this._fPhB,this._fHalo].forEach(f=>gl.deleteFramebuffer(f));
    [this._tBeam,this._tBlurH,this._tBlurV,this._tPhA,this._tPhB,this._tHalo].forEach(t=>gl.deleteTexture(t));
    [this._pBeam,this._pBlur,this._pComp].forEach(p=>gl.deleteProgram(p));
    gl.deleteBuffer(this._qBuf); gl.deleteBuffer(this._lineBuf);
  }
}
