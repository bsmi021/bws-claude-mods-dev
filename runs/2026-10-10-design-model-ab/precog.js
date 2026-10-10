/* @ds-bundle: {"format":4,"namespace":"Precog","components":[{"name":"Hero"},{"name":"Scene"},{"name":"GlassPanel"},{"name":"PanelBoard"},{"name":"Backdrop"},{"name":"DiagramFrame"},{"name":"ChartFrame"},{"name":"ImageFrame"},{"name":"StatTile"},{"name":"Callout"},{"name":"StatusChip"},{"name":"Details"},{"name":"TLDR"},{"name":"Findings"},{"name":"StepFlow"},{"name":"Compare"}]} */
/* PRECOG runtime. Vanilla JS, no dependencies, no network. Auto-inits on load; call Precog.init(root) after adding markup. */
(function () {
  'use strict';
  var W = window, D = document;
  var mqReduce = W.matchMedia('(prefers-reduced-motion: reduce)');
  var mqWide = W.matchMedia('(min-width: 720px)');
  var SVGNS = 'http://www.w3.org/2000/svg';

  function motionOK() { return !mqReduce.matches; }
  function isLive() { return motionOK() && mqWide.matches; }
  function all(sel, root) { return Array.prototype.slice.call((root || D).querySelectorAll(sel)); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function cssVar(name, el) { return getComputedStyle(el || D.documentElement).getPropertyValue(name).trim(); }
  function svg(tag, attrs, parent) {
    var n = D.createElementNS(SVGNS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  /* ---------------- Scene: pinned, scroll-scrubbed story ---------------- */
  var scenes = [];
  function initScene(el) {
    if (el.__pc) return; el.__pc = 1;
    var steps = all('[data-step]', el);
    var n = 0;
    steps.forEach(function (s) { n = Math.max(n, parseInt(s.getAttribute('data-step'), 10) || 1); });
    el.style.setProperty('--pc-steps', n || 1);
    scenes.push({ el: el, steps: steps, n: n || 1 });
  }
  function updateScenes() {
    var live = isLive();
    D.documentElement.classList.toggle('pc-live', live);
    var vh = W.innerHeight;
    scenes.forEach(function (s) {
      var idx;
      var sLive = live && !s.el.hasAttribute('data-static');
      if (!sLive) { idx = s.n; s.el.style.setProperty('--pc-p', 1); }
      else {
        var r = s.el.getBoundingClientRect();
        var total = r.height - vh;
        var p = total > 0 ? clamp(-r.top / total, 0, 1) : 1;
        s.el.style.setProperty('--pc-p', p.toFixed(4));
        idx = Math.min(s.n, 1 + Math.floor(p * s.n * 0.9999));
      }
      var swap = s.el.getAttribute('data-mode') === 'swap';
      s.steps.forEach(function (st) {
        var k = parseInt(st.getAttribute('data-step'), 10) || 1;
        var on = sLive && swap ? k === idx : k <= idx;
        st.classList.toggle('is-on', on);
        st.classList.toggle('is-current', k === idx);
      });
    });
  }
  var ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    W.requestAnimationFrame(function () { ticking = false; updateScenes(); });
  }

  /* ---------------- PanelBoard: grab, fling, snap ---------------- */
  function flip(board, mutate, dur) {
    var panels = all(':scope > .pc-glass', board);
    var before = panels.map(function (p) { return p.getBoundingClientRect(); });
    mutate();
    panels.forEach(function (p, i) {
      var a = before[i], b = p.getBoundingClientRect();
      var dx = a.left - b.left, dy = a.top - b.top;
      p.style.transition = 'none';
      p.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    });
    board.getBoundingClientRect();
    panels.forEach(function (p) {
      p.style.transition = motionOK() ? 'transform ' + (dur || 420) + 'ms cubic-bezier(.2,.8,.2,1)' : 'none';
      p.style.transform = '';
    });
    setTimeout(function () { panels.forEach(function (p) { p.style.transition = ''; }); }, (dur || 420) + 40);
  }
  function swapNodes(a, b) {
    var parent = a.parentNode, marker = D.createComment('');
    parent.insertBefore(marker, a);
    parent.insertBefore(a, b);
    parent.insertBefore(b, marker);
    parent.removeChild(marker);
  }
  function initBoard(board) {
    if (board.__pc) return; board.__pc = 1;
    var cols = board.getAttribute('data-cols'); if (cols) board.style.setProperty('--cols', cols);
    all(':scope > .pc-glass', board).forEach(function (p) {
      if (!p.hasAttribute('tabindex')) p.setAttribute('tabindex', '0');
      p.setAttribute('aria-roledescription', 'movable panel');
      p.addEventListener('pointerdown', function (e) { grab(e, p, board); });
      p.addEventListener('keydown', function (e) {
        if (!e.shiftKey) return;
        var sib = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? p.previousElementSibling : (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? p.nextElementSibling : null);
        if (!sib || !sib.classList.contains('pc-glass')) return;
        e.preventDefault();
        flip(board, function () { swapNodes(p, sib); });
        p.focus();
      });
    });
  }
  function grab(e, p, board) {
    if (!mqWide.matches || e.button > 0) return;
    if (e.target.closest('a,button,input,select,textarea,summary,[data-nodrag]')) return;
    e.preventDefault();
    p.setPointerCapture(e.pointerId);
    var sx = e.clientX, sy = e.clientY, dx = 0, dy = 0, samples = [], target = null;
    p.classList.add('is-grabbed');
    p.style.transition = 'none';
    function nearest(px, py) {
      var best = null, bestD = Infinity;
      all(':scope > .pc-glass', board).forEach(function (q) {
        if (q === p) return;
        var r = q.getBoundingClientRect();
        var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        var d = Math.hypot(px - cx, py - cy);
        if (d < bestD && Math.abs(px - cx) < r.width * 0.75 && Math.abs(py - cy) < r.height * 0.75) { best = q; bestD = d; }
      });
      return best;
    }
    function move(ev) {
      dx = ev.clientX - sx; dy = ev.clientY - sy;
      var t = performance.now();
      samples.push({ x: ev.clientX, y: ev.clientY, t: t });
      while (samples.length > 2 && t - samples[0].t > 90) samples.shift();
      p.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(1.02)';
      var r = p.getBoundingClientRect();
      var t2 = nearest(r.left + r.width / 2, r.top + r.height / 2);
      if (t2 !== target) { if (target) target.classList.remove('is-target'); target = t2; if (target) target.classList.add('is-target'); }
    }
    function up() {
      p.removeEventListener('pointermove', move);
      p.removeEventListener('pointerup', up);
      p.removeEventListener('pointercancel', up);
      var vx = 0, vy = 0;
      if (samples.length > 1) {
        var a = samples[0], b = samples[samples.length - 1], dt = Math.max(1, b.t - a.t);
        vx = (b.x - a.x) / dt; vy = (b.y - a.y) / dt;
      }
      var r = p.getBoundingClientRect();
      var land = nearest(r.left + r.width / 2 + vx * 220, r.top + r.height / 2 + vy * 220) || target;
      if (target) target.classList.remove('is-target');
      p.classList.remove('is-grabbed');
      p.style.transition = '';
      var speed = Math.hypot(vx, vy);
      flip(board, function () { if (land) swapNodes(p, land); p.style.transform = ''; }, clamp(520 - speed * 120, 280, 520));
    }
    p.addEventListener('pointermove', move);
    p.addEventListener('pointerup', up);
    p.addEventListener('pointercancel', up);
  }

  /* ---------------- Backdrop: canvas atmosphere ---------------- */
  function initBackdrop(cv) {
    if (cv.__pc) return; cv.__pc = 1;
    var ctx = cv.getContext('2d'); if (!ctx) return;
    var kind = cv.getAttribute('data-kind') || 'grid';
    var visible = true, raf = 0, t0 = performance.now(), dots = [];
    function size() {
      var dpr = Math.min(2, W.devicePixelRatio || 1), r = cv.getBoundingClientRect();
      cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (kind === 'field') {
        dots = []; var count = Math.round(r.width * r.height / 9000);
        for (var i = 0; i < count; i++) dots.push({ x: Math.random() * r.width, y: Math.random() * r.height, z: 0.3 + Math.random() * 0.7 });
      }
    }
    function draw(now) {
      var r = cv.getBoundingClientRect(), w = r.width, h = r.height, t = (now - t0) / 1000;
      var accent = cssVar('--accent') || '#7fe3ff', line = 'rgba(138,155,191,';
      ctx.clearRect(0, 0, w, h);
      if (kind === 'grid') {
        var hy = h * 0.42, vx = w * 0.62;
        ctx.lineWidth = 1;
        for (var i = -14; i <= 14; i++) {
          ctx.strokeStyle = line + (0.05 + 0.1 * (1 - Math.abs(i) / 14)) + ')';
          ctx.beginPath(); ctx.moveTo(vx + i * 12, hy); ctx.lineTo(vx + i * w * 0.16, h); ctx.stroke();
        }
        var off = (t * 0.12) % 1;
        for (var j = 0; j < 12; j++) {
          var f = Math.pow((j + off) / 12, 2.2), y = hy + (h - hy) * f;
          ctx.strokeStyle = line + (0.04 + 0.18 * f) + ')';
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
        var sy = (t * 60) % (h * 1.6) - h * 0.3;
        var g = ctx.createLinearGradient(0, sy - 60, 0, sy + 60);
        g.addColorStop(0, 'rgba(127,227,255,0)'); g.addColorStop(0.5, 'rgba(127,227,255,0.07)'); g.addColorStop(1, 'rgba(127,227,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, sy - 60, w, 120);
      } else {
        dots.forEach(function (d) {
          var x = (d.x + t * 6 * d.z) % w, y = d.y + Math.sin(t * 0.4 + d.x) * 4 * d.z;
          ctx.globalAlpha = 0.15 + 0.5 * d.z; ctx.fillStyle = d.z > 0.92 ? accent : '#8a9bbf';
          ctx.fillRect(x, y, d.z * 1.8, d.z * 1.8);
        });
        ctx.globalAlpha = 1;
      }
    }
    function loop(now) { draw(now); if (visible && isLive()) raf = W.requestAnimationFrame(loop); else raf = 0; }
    size(); draw(t0 + 4000);
    if ('IntersectionObserver' in W) new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting; if (visible && !raf && isLive()) raf = W.requestAnimationFrame(loop);
    }).observe(cv);
    W.addEventListener('resize', function () { size(); if (!raf) draw(performance.now()); });
  }

  /* ---------------- StatTile count-up ---------------- */
  function fmt(v, el) {
    var dec = parseInt(el.getAttribute('data-decimals') || '0', 10);
    return (el.getAttribute('data-prefix') || '') + v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }) + (el.getAttribute('data-suffix') || '');
  }
  function initCount(el) {
    if (el.__pc) return; el.__pc = 1;
    var end = parseFloat(el.getAttribute('data-count')); if (isNaN(end)) return;
    el.textContent = fmt(end, el);
    if (!motionOK() || !('IntersectionObserver' in W)) return;
    var io = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting || D.visibilityState !== 'visible') return; io.disconnect();
      var t0 = performance.now(), dur = 1100;
      // a hidden tab pauses rAF mid-count; snap to the final value whenever the page is hidden
      D.addEventListener('visibilitychange', function () { el.textContent = fmt(end, el); }, { once: true });
      (function step(now) {
        var k = clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - k, 3);
        el.textContent = fmt(end * e, el);
        if (k < 1) W.requestAnimationFrame(step);
      })(t0);
    }, { threshold: 0.6 });
    io.observe(el);
  }

  /* ---------------- tooltip ---------------- */
  var tip;
  function showTip(text, x, y) {
    if (!tip) { tip = D.createElement('div'); tip.className = 'pc-tip'; tip.setAttribute('role', 'status'); D.body.appendChild(tip); }
    tip.textContent = text; tip.hidden = false;
    var w = tip.offsetWidth;
    tip.style.left = clamp(x + 14, 8, W.innerWidth - w - 8) + 'px'; tip.style.top = (y - 36) + 'px';
  }
  function hideTip() { if (tip) tip.hidden = true; }
  function hover(node, text) {
    node.addEventListener('pointermove', function (e) { showTip(text, e.clientX, e.clientY); });
    node.addEventListener('pointerleave', hideTip);
  }

  /* ---------------- charts ---------------- */
  function niceMax(v) { if (v <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  /* Precog.bars(el, [{label, value}], {unit, highlight}) — horizontal bars, one series. */
  function bars(el, data, o) {
    o = o || {};
    var rowH = 34, left = 150, right = 70, w = 720, h = data.length * rowH + 24;
    var max = niceMax(Math.max.apply(null, data.map(function (d) { return d.value; })));
    var s = svg('svg', { viewBox: '0 0 ' + w + ' ' + h, class: 'pc-chart', role: 'img', 'aria-label': o.title || 'Bar chart' });
    var x = function (v) { return left + (w - left - right) * v / max; };
    [0, 0.5, 1].forEach(function (f) {
      svg('line', { x1: x(max * f), x2: x(max * f), y1: 0, y2: h - 20, class: 'pc-chart__grid' }, s);
      var t = svg('text', { x: x(max * f), y: h - 4, 'text-anchor': 'middle' }, s); t.textContent = (max * f).toLocaleString() + (o.unit || '');
    });
    data.forEach(function (d, i) {
      var y = i * rowH + 6, bw = Math.max(2, x(d.value) - left);
      var g = svg('g', {}, s);
      var lab = svg('text', { x: left - 12, y: y + 15, 'text-anchor': 'end', class: 'pc-chart__value' }, g); lab.textContent = d.label;
      svg('rect', { x: left, y: y + 2, width: bw, height: 18, rx: 4, class: 's1', opacity: (o.highlight != null && o.highlight !== i) ? 0.4 : 1 }, g);
      var v = svg('text', { x: left + bw + 8, y: y + 15, class: 'pc-chart__value' }, g); v.textContent = d.value.toLocaleString() + (o.unit || '');
      var hit = svg('rect', { x: 0, y: y - 4, width: w, height: rowH, class: 'pc-chart__hit' }, g);
      hover(hit, d.label + ': ' + d.value.toLocaleString() + (o.unit || ''));
    });
    el.appendChild(s); return s;
  }
  /* Precog.line(el, {labels:[...], series:[{name, values:[...]}]}, {unit}) — up to 4 series, one axis. */
  function line(el, data, o) {
    o = o || {};
    var w = 720, h = 300, l = 48, r = 90, t = 12, b = 28;
    var vals = []; data.series.forEach(function (se) { vals = vals.concat(se.values); });
    var max = niceMax(Math.max.apply(null, vals)), n = data.labels.length;
    var x = function (i) { return l + (w - l - r) * (n === 1 ? 0.5 : i / (n - 1)); };
    var y = function (v) { return t + (h - t - b) * (1 - v / max); };
    var s = svg('svg', { viewBox: '0 0 ' + w + ' ' + h, class: 'pc-chart', role: 'img', 'aria-label': o.title || 'Line chart' });
    [0, 0.25, 0.5, 0.75, 1].forEach(function (f) {
      svg('line', { x1: l, x2: w - r, y1: y(max * f), y2: y(max * f), class: f === 0 ? 'pc-chart__axis' : 'pc-chart__grid' }, s);
      var tx = svg('text', { x: l - 8, y: y(max * f) + 4, 'text-anchor': 'end' }, s); tx.textContent = (max * f).toLocaleString();
    });
    data.labels.forEach(function (lb, i) {
      if (n > 8 && i % Math.ceil(n / 8) && i !== n - 1) return;
      var tx = svg('text', { x: x(i), y: h - 8, 'text-anchor': 'middle' }, s); tx.textContent = lb;
    });
    data.series.slice(0, 4).forEach(function (se, k) {
      var cls = 's' + (k + 1), d = se.values.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
      svg('path', { d: d, class: 'pc-chart__line ' + cls }, s);
      var li = se.values.length - 1;
      svg('circle', { cx: x(li), cy: y(se.values[li]), r: 4, class: cls, stroke: cssVar('--surface') || '#0b1733', 'stroke-width': 2 }, s);
      var lab = svg('text', { x: x(li) + 10, y: y(se.values[li]) + 4, class: 'pc-chart__value' }, s); lab.textContent = se.name;
    });
    var cross = svg('line', { y1: t, y2: h - b, class: 'pc-chart__axis', visibility: 'hidden' }, s);
    var hit = svg('rect', { x: l, y: t, width: w - l - r, height: h - t - b, class: 'pc-chart__hit' }, s);
    hit.addEventListener('pointermove', function (e) {
      var box = s.getBoundingClientRect(), vx = (e.clientX - box.left) * w / box.width;
      var i = clamp(Math.round((vx - l) / (w - l - r) * (n - 1)), 0, n - 1);
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
      showTip(data.labels[i] + '  ' + data.series.slice(0, 4).map(function (se) { return se.name + ' ' + se.values[i].toLocaleString() + (o.unit || ''); }).join('  ·  '), e.clientX, e.clientY);
    });
    hit.addEventListener('pointerleave', function () { cross.setAttribute('visibility', 'hidden'); hideTip(); });
    el.appendChild(s);
    if (data.series.length > 1) {
      var lg = D.createElement('div'); lg.className = 'pc-legend pc-label';
      data.series.slice(0, 4).forEach(function (se, k) { var sp = D.createElement('span'); sp.innerHTML = '<i style="background:var(--chart-' + (k + 1) + ')"></i>'; sp.appendChild(D.createTextNode(se.name)); lg.appendChild(sp); });
      el.appendChild(lg);
    }
    return s;
  }

  /* ---------------- init ---------------- */
  function init(root) {
    root = root || D;
    all('.pc-scene', root).forEach(initScene);
    all('.pc-board', root).forEach(initBoard);
    all('canvas.pc-backdrop', root).forEach(initBackdrop);
    all('[data-count]', root).forEach(initCount);
    updateScenes();
  }
  W.addEventListener('scroll', onScroll, { passive: true });
  W.addEventListener('resize', onScroll);
  if (mqReduce.addEventListener) { mqReduce.addEventListener('change', onScroll); mqWide.addEventListener('change', onScroll); }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', function () { init(); });
  else init();

  W.Precog = { init: init, bars: bars, line: line, isLive: isLive, refresh: updateScenes, version: '1.0.0' };
})();
