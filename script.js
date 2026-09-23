document.addEventListener("DOMContentLoaded", () => {
  // Page Navigation Elements
  const landingPage = document.getElementById("landing-page");
  const appWorkspace = document.getElementById("app-workspace");
  const startAppBtn = document.getElementById("start-app-btn");
  const backHomeBtn = document.getElementById("back-home-btn");

  // Floating Drawer Elements
  const floatingPanel = document.getElementById("floating-panel");
  const togglePanelBtn = document.getElementById("toggle-panel-btn");
  const equationsList = document.getElementById("equations-list");

  // Canvas Setup
  const canvas = document.getElementById("graph-canvas");
  const ctx = canvas.getContext("2d");
  const canvasWrapper = document.getElementById("canvas-wrapper");

  // Tools & Reference Image Elements
  const bgUpload = document.getElementById("bg-upload");
  const imageControls = document.getElementById("image-controls");
  const bgOpacity = document.getElementById("bg-opacity");
  const removeBgBtn = document.getElementById("remove-bg-btn");
  const clearAllBtn = document.getElementById("clear-all-btn");
  const undoBtn = document.getElementById("undo-btn");
  const addLayerBtn = document.getElementById("add-layer-btn");

  // Import Saved Equations Elements
  const importEqsBtn = document.getElementById("import-eqs-btn");
  const importModalOverlay = document.getElementById("import-modal-overlay");
  const importModalClose = document.getElementById("import-modal-close");
  const importCancelBtn = document.getElementById("import-cancel-btn");
  const importConfirmBtn = document.getElementById("import-confirm-btn");
  const importTextarea = document.getElementById("import-textarea");
  const importFeedback = document.getElementById("import-feedback");
  
  // Export & Copy All Controls
  const exportImgBtn = document.getElementById("export-img-btn");
  const copyAllBtn = document.getElementById("copy-all-btn");

  // Viewport Controls
  const zoomInBtn = document.getElementById("zoom-in");
  const zoomOutBtn = document.getElementById("zoom-out");
  const resetViewBtn = document.getElementById("reset-view");

  // Palette when Hovered/Selected
  const highlightColors = [
    "#187a3d", "#2563eb", "#d97706", "#9333ea", "#dc2626", "#0891b2"
  ];
  let colorIndex = 0;

  // Coordinate System Settings
  let scale = 45; // Pixels per grid unit
  let originX = 0;
  let originY = 0;

  // Workspace States
  let isDrawing = false;
  let currentStroke = [];
  let curves = [];
  let activeCurveId = null;
  let bgImage = null;
  let bgImageOpacity = 0.4;
  let bgImageBaseScale = scale; // scale value at the moment the image was loaded/sized

  // --- LAYERS ---
  // Independent stacked sheets, each holding its own curves. New strokes
  // are added to whichever layer is active; hidden layers are skipped
  // entirely on render but their curves are preserved.
  let layerIdCounter = 0;
  function nextLayerId() {
    return ++layerIdCounter;
  }
  let layerNameCounter = 1;
  let layers = [{ id: nextLayerId(), name: `Layer ${layerNameCounter}`, visible: true }];
  let activeLayerId = layers[0].id;
  layerNameCounter++;

  // --- UNDO HISTORY ---
  // Snapshots of curves + layers taken right before each mutating action
  // (draw, delete, clear, reorder, add/delete layer). Deep-cloned via JSON
  // since these are plain data, so later mutations never affect an
  // already-pushed snapshot.
  let history = [];
  const MAX_HISTORY = 50;

  function pushHistory() {
    history.push({
      curves: JSON.parse(JSON.stringify(curves)),
      layers: JSON.parse(JSON.stringify(layers)),
      activeLayerId
    });
    if (history.length > MAX_HISTORY) history.shift();
    updateUndoButtonState();
  }

  function undo() {
    if (history.length === 0) return;
    const snap = history.pop();
    curves = snap.curves;
    layers = snap.layers;
    activeLayerId = snap.activeLayerId;
    activeCurveId = null;
    updateEquationsUI();
    render();
    updateUndoButtonState();
  }

  function updateUndoButtonState() {
    undoBtn.disabled = history.length === 0;
  }

  undoBtn.addEventListener("click", undo);

  window.addEventListener("keydown", (e) => {
    // Skip all canvas/undo shortcuts while typing in a text field (e.g. the
    // Import Equations textarea) so normal editing keys aren't hijacked.
    const tag = e.target.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT") return;

    // Undo: Ctrl/Cmd + Z
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
    }
    
    // Navigation shortcuts (only when not in text input)
    if (e.target === document.body || e.target === canvas) {
      // Arrow keys for panning
      const panStep = 50;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        originY -= panStep;
        render();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        originY += panStep;
        render();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        originX += panStep;
        render();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        originX -= panStep;
        render();
      }
      // Plus/Equals for zoom in
      else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        scale *= 1.2;
        render();
      }
      // Minus for zoom out
      else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        scale /= 1.2;
        render();
      }
      // Zero to reset view
      else if (e.key === "0") {
        e.preventDefault();
        scale = 45;
        originX = canvas.width / 2;
        originY = canvas.height / 2;
        render();
      }
    }
  });

  addLayerBtn.addEventListener("click", () => {
    pushHistory();
    const newLayer = { id: nextLayerId(), name: `Layer ${layerNameCounter}`, visible: true };
    layerNameCounter++;
    layers.push(newLayer);
    activeLayerId = newLayer.id;
    updateEquationsUI();
  });

  // --- PAGE TRANSITIONS ---
  startAppBtn.addEventListener("click", () => {
    landingPage.classList.add("hidden");
    appWorkspace.classList.remove("hidden");
    initCanvas();
  });

  backHomeBtn.addEventListener("click", () => {
    appWorkspace.classList.add("hidden");
    landingPage.classList.remove("hidden");
  });

  togglePanelBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    floatingPanel.classList.toggle("collapsed");
  });

  // --- CANVAS INITIALIZATION & COORDINATES ---
  function initCanvas() {
    canvas.width = canvasWrapper.clientWidth;
    canvas.height = canvasWrapper.clientHeight;
    originX = canvas.width / 2;
    originY = canvas.height / 2;
    updateEquationsUI();
    render();
  }

  function screenToMath(px, py) {
    return {
      x: (px - originX) / scale,
      y: (originY - py) / scale
    };
  }

  function mathToScreen(x, y) {
    return {
      x: originX + x * scale,
      y: originY - y * scale
    };
  }

  // --- RENDER PIPELINE ---
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Reference Background Image
    if (bgImage) {
      ctx.save();
      ctx.globalAlpha = bgImageOpacity;
      // Scale the image relative to the zoom level it was loaded at, so it
      // grows/shrinks in sync with the grid, curves, and axes instead of
      // staying pinned at its natural pixel size.
      const zoomFactor = scale / bgImageBaseScale;
      const imgW = bgImage.width * zoomFactor;
      const imgH = bgImage.height * zoomFactor;
      ctx.drawImage(bgImage, originX - imgW / 2, originY - imgH / 2, imgW, imgH);
      ctx.restore();
    }

    // 2. Render Cartesian Grid
    drawGrid();

    // 3. Render Curves from Equations, layer by layer (back to front),
    // skipping hidden layers entirely; within a layer, curves keep their
    // relative creation/reorder order.
    layers.forEach(layer => {
      if (!layer.visible) return;
      curves.filter(c => c.layerId === layer.id).forEach(curve => drawCurve(curve));
    });

    // 4. Render Active Freehand Drawing Stroke
    if (isDrawing && currentStroke.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = "#187a3d";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(currentStroke[0].px, currentStroke[0].py);
      for (let i = 1; i < currentStroke.length; i++) {
        ctx.lineTo(currentStroke[i].px, currentStroke[i].py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawGrid() {
    const leftMath = screenToMath(0, 0).x;
    const rightMath = screenToMath(canvas.width, 0).x;
    const topMath = screenToMath(0, 0).y;
    const bottomMath = screenToMath(0, canvas.height).y;

    let gridStep = 1;
    if (scale < 25) gridStep = 5;
    if (scale > 90) gridStep = 0.5;

    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    const startX = Math.floor(leftMath / gridStep) * gridStep;
    for (let x = startX; x <= rightMath; x += gridStep) {
      const px = mathToScreen(x, 0).x;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, canvas.height);
    }
    const startY = Math.floor(bottomMath / gridStep) * gridStep;
    for (let y = startY; y <= topMath; y += gridStep) {
      const py = mathToScreen(0, y).y;
      ctx.moveTo(0, py);
      ctx.lineTo(canvas.width, py);
    }
    ctx.stroke();

    // Axes
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.8;
    ctx.beginPath();

    ctx.moveTo(originX, 0);
    ctx.lineTo(originX, canvas.height);
    ctx.moveTo(0, originY);
    ctx.lineTo(canvas.width, originY);
    ctx.stroke();

    // Numbers
    ctx.fillStyle = "#64748b";
    ctx.font = "11px 'Fira Code', monospace";

    for (let x = startX; x <= rightMath; x += gridStep) {
      if (Math.abs(x) < 0.001) continue;
      const pt = mathToScreen(x, 0);
      ctx.fillText(x.toString(), pt.x - 6, originY + 16);
    }

    for (let y = startY; y <= topMath; y += gridStep) {
      if (Math.abs(y) < 0.001) continue;
      const pt = mathToScreen(0, y);
      ctx.fillText(y.toString(), originX + 8, pt.y + 4);
    }
  }

  function drawCurve(curve) {
    const isHighlighted = (curve.id === activeCurveId);
    
    ctx.strokeStyle = isHighlighted ? curve.highlightColor : "#000000";
    ctx.lineWidth = isHighlighted ? 4 : 2.5;

    ctx.beginPath();

    if (curve.type === "vertical_line") {
      const p1 = mathToScreen(curve.xVal, curve.domain.min);
      const p2 = mathToScreen(curve.xVal, curve.domain.max);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    } 
    else if (curve.type === "line" || curve.type === "parabola") {
      const startX = curve.domain.min;
      const endX = curve.domain.max;
      const step = (endX - startX) / 100 || 0.01;

      let started = false;
      for (let x = startX; x <= endX + (step/2); x += step) {
        let y = (curve.type === "line") 
          ? (curve.m * x + curve.b) 
          : (curve.a * x * x + curve.b * x + curve.c);

        const pt = mathToScreen(x, y);
        if (!started) {
          ctx.moveTo(pt.x, pt.y);
          started = true;
        } else {
          ctx.lineTo(pt.x, pt.y);
        }
      }
    } else if (curve.type === "parametric") {
      let started = false;
      for (let t = 0; t <= 1.001; t += 0.01) {
        const x = curve.ax * t * t + curve.bx * t + curve.cx;
        const y = curve.ay * t * t + curve.by * t + curve.cy;
        const pt = mathToScreen(x, y);

        if (!started) {
          ctx.moveTo(pt.x, pt.y);
          started = true;
        } else {
          ctx.lineTo(pt.x, pt.y);
        }
      }
    }

    ctx.stroke();
  }

  // --- PAN STATE ---
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let spacePressed = false;

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      spacePressed = true;
      canvas.style.cursor = "grab";
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      spacePressed = false;
      canvas.style.cursor = "crosshair";
    }
  });

  // --- DRAWING STROKE EVENT LISTENERS ---
  canvas.addEventListener("mousedown", (e) => {
    // Middle mouse button OR spacebar = pan mode
    if (e.button === 1 || spacePressed) {
      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      canvas.style.cursor = "grabbing";
      return;
    }

    // Left click = draw mode (normal behavior)
    isDrawing = true;
    currentStroke = [];
    addPoint(e);
  });

  canvas.addEventListener("mousemove", (e) => {
    if (isPanning) {
      const deltaX = e.clientX - panStartX;
      const deltaY = e.clientY - panStartY;
      originX += deltaX;
      originY += deltaY;
      panStartX = e.clientX;
      panStartY = e.clientY;
      render();
      return;
    }

    if (!isDrawing) return;
    addPoint(e);
    render();
  });

  canvas.addEventListener("mouseup", () => {
    if (isPanning) {
      isPanning = false;
      canvas.style.cursor = spacePressed ? "grab" : "crosshair";
      return;
    }

    if (!isDrawing) return;
    isDrawing = false;
    processStroke(currentStroke);
    currentStroke = [];
    render();
  });

  function addPoint(e) {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const mathPt = screenToMath(px, py);
    currentStroke.push({ px, py, x: mathPt.x, y: mathPt.y });
  }

  let curveIdCounter = 0;
  function nextCurveId() {
    return ++curveIdCounter;
  }

  // Formats a coefficient with enough precision to round-trip accurately
  // into other graphing software, while trimming needless trailing zeros.
  function fmtCoef(n) {
    if (!isFinite(n)) return "0";

    // Values this close to zero are floating-point noise from the fit, not
    // a real coefficient - and there's no safe way to print them anyway
    // (see the "e" note below), so just call them zero.
    if (Math.abs(n) < 1e-9) return "0";

    // 6 significant figures preserves shape fidelity for typical sketch
    // ranges without producing absurdly long strings.
    let s = n.toPrecision(6);

    // CRITICAL: toPrecision falls back to exponential notation ("e-14",
    // "e+21", etc.) for very small/large magnitudes. Desmos's parser does
    // NOT treat "e" as "times ten to the power of" - it reads a bare "e" as
    // Euler's number and implicitly multiplies, so "2.79102e-14" would be
    // silently evaluated as 2.79102 * e * (-14) (~ -106) instead of ~0.
    // That's a wrong-graph bug, not just a paste error, so this string must
    // never reach the equation text - convert to plain fixed-point instead.
    if (s.includes("e") || s.includes("E")) {
      const num = Number(s);
      const magnitude = num === 0 ? 0 : Math.floor(Math.log10(Math.abs(num)));
      const decimals = Math.max(0, Math.min(100, 5 - magnitude));
      // toFixed() itself silently reverts to exponential notation for
      // |num| >= 1e21 (a documented JS quirk) - toLocaleString doesn't
      // have that ceiling, so it's used here instead for safety.
      s = num.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: decimals });
    }

    if (s.includes(".")) {
      s = s.replace(/0+$/, "").replace(/\.$/, "");
    }
    return s;
  }

  // --- ACCURATE MATHEMATICAL FITTING ALGORITHMS ---
  function processStroke(pts) {
    if (pts.length < 3) return;
    pushHistory();

    // Drawing onto a hidden layer would silently vanish - surface it instead.
    const targetLayer = layers.find(l => l.id === activeLayerId);
    if (targetLayer && !targetLayer.visible) targetLayer.visible = true;

    const chosenHighlightColor = highlightColors[colorIndex % highlightColors.length];
    colorIndex++;

    const xCoords = pts.map(p => p.x);
    const yCoords = pts.map(p => p.y);
    const minX = Math.min(...xCoords);
    const maxX = Math.max(...xCoords);
    const minY = Math.min(...yCoords);
    const maxY = Math.max(...yCoords);

    // 1. Vertical Line Detection
    if (Math.abs(maxX - minX) < 0.15) {
      const avgX = (minX + maxX) / 2;
      curves.push({
        id: nextCurveId(),
        type: "vertical_line",
        layerId: activeLayerId,
        highlightColor: chosenHighlightColor,
        xVal: avgX,
        domain: { min: minY, max: maxY },
        // NOTE ON THE DOMAIN BRACKETS: a plain "{...}" only creates a real
        // Desmos domain restriction when a person TYPES the "{" character -
        // Desmos's keyboard handler intercepts that keystroke specially.
        // A literal "{" that arrives via paste is parsed as bare LaTeX,
        // where curly braces are just an invisible grouping construct, so
        // "{-1 <= x <= 1}" would silently paste as the ungrouped, broken
        // text "-1 <= x <= 1" tacked onto the equation. The actual pasteable
        // syntax (confirmed by a Desmos engineer) is "\left\{...\right\}".
        equationText: `x = ${fmtCoef(avgX)}  \\left\\{${fmtCoef(minY)}\\le y\\le${fmtCoef(maxY)}\\right\\}`
      });
      updateEquationsUI();
      return;
    }

    // 2. Linear Regression (y = mx + b)
    const lineFit = fitLine(pts);
    if (lineFit.rSquared > 0.94) {
      curves.push({
        id: nextCurveId(),
        type: "line",
        layerId: activeLayerId,
        highlightColor: chosenHighlightColor,
        m: lineFit.m,
        b: lineFit.b,
        domain: { min: minX, max: maxX },
        equationText: `y = ${fmtCoef(lineFit.m)}x ${lineFit.b >= 0 ? '+' : '-'} ${fmtCoef(Math.abs(lineFit.b))}  \\left\\{${fmtCoef(minX)}\\le x\\le${fmtCoef(maxX)}\\right\\}`
      });
      updateEquationsUI();
      return;
    }

    // 3. Parabolic Quadratic Least-Squares Fit (y = ax² + bx + c)
    const quadFit = fitParabola(pts);
    if (quadFit && quadFit.rSquared > 0.88) {
      const signB = quadFit.b >= 0 ? '+' : '-';
      const signC = quadFit.c >= 0 ? '+' : '-';
      curves.push({
        id: nextCurveId(),
        type: "parabola",
        layerId: activeLayerId,
        highlightColor: chosenHighlightColor,
        a: quadFit.a,
        b: quadFit.b,
        c: quadFit.c,
        domain: { min: minX, max: maxX },
        equationText: `y = ${fmtCoef(quadFit.a)}x^2 ${signB} ${fmtCoef(Math.abs(quadFit.b))}x ${signC} ${fmtCoef(Math.abs(quadFit.c))}  \\left\\{${fmtCoef(minX)}\\le x\\le${fmtCoef(maxX)}\\right\\}`
      });
      updateEquationsUI();
      return;
    }

    // 4. Parametric Quadratic Fitting (x(t), y(t) for freehand curves, vertical loops, etc.)
    const paramFit = fitParametric(pts);
    curves.push({
      id: nextCurveId(),
      type: "parametric",
      layerId: activeLayerId,
      highlightColor: chosenHighlightColor,
      ax: paramFit.ax, bx: paramFit.bx, cx: paramFit.cx,
      ay: paramFit.ay, by: paramFit.by, cy: paramFit.cy,
      equationText: `( ${fmtCoef(paramFit.ax)}t^2${paramFit.bx>=0?'+':''}${fmtCoef(paramFit.bx)}t${paramFit.cx>=0?'+':''}${fmtCoef(paramFit.cx)} , ${fmtCoef(paramFit.ay)}t^2${paramFit.by>=0?'+':''}${fmtCoef(paramFit.by)}t${paramFit.cy>=0?'+':''}${fmtCoef(paramFit.cy)} )`
    });
    updateEquationsUI();
  }

  function fitLine(pts) {
    const n = pts.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let p of pts) {
      sumX += p.x; sumY += p.y;
      sumXY += p.x * p.y; sumXX += p.x * p.x;
    }
    const denom = (n * sumXX - sumX * sumX);
    if (Math.abs(denom) < 1e-5) return { m: 0, b: 0, rSquared: 0 };

    const m = (n * sumXY - sumX * sumY) / denom;
    const b = (sumY - m * sumX) / n;

    let ssTot = 0, ssRes = 0;
    const meanY = sumY / n;
    for (let p of pts) {
      const predY = m * p.x + b;
      ssTot += Math.pow(p.y - meanY, 2);
      ssRes += Math.pow(p.y - predY, 2);
    }
    return { m, b, rSquared: 1 - (ssRes / (ssTot || 1)) };
  }

  function fitParabola(pts) {
    const n = pts.length;
    let sX = 0, sY = 0, sX2 = 0, sX3 = 0, sX4 = 0, sXY = 0, sX2Y = 0;
    for (let p of pts) {
      const x = p.x, y = p.y, x2 = x * x;
      sX += x; sY += y;
      sX2 += x2; sX3 += x2 * x; sX4 += x2 * x2;
      sXY += x * y; sX2Y += x2 * y;
    }

    // Solve 3x3 System using Matrix Determinants
    const M = [
      [sX4, sX3, sX2],
      [sX3, sX2, sX],
      [sX2, sX,  n]
    ];
    const V = [sX2Y, sXY, sY];

    function det3(m) {
      return m[0][0]*(m[1][1]*m[2][2] - m[1][2]*m[2][1])
           - m[0][1]*(m[1][0]*m[2][2] - m[1][2]*m[2][0])
           + m[0][2]*(m[1][0]*m[2][1] - m[1][1]*m[2][0]);
    }

    const D = det3(M);
    if (Math.abs(D) < 1e-5) return null;

    const Da = det3([[V[0], M[0][1], M[0][2]], [V[1], M[1][1], M[1][2]], [V[2], M[2][1], M[2][2]]]);
    const Db = det3([[M[0][0], V[0], M[0][2]], [M[1][0], V[1], M[1][2]], [M[2][0], V[2], M[2][2]]]);
    const Dc = det3([[M[0][0], M[0][1], V[0]], [M[1][0], M[1][1], V[1]], [M[2][0], M[2][1], V[2]]]);

    const a = Da / D;
    const b = Db / D;
    const c = Dc / D;

    let ssTot = 0, ssRes = 0;
    const meanY = sY / n;
    for (let p of pts) {
      const predY = a * p.x * p.x + b * p.x + c;
      ssTot += Math.pow(p.y - meanY, 2);
      ssRes += Math.pow(p.y - predY, 2);
    }
    return { a, b, c, rSquared: 1 - (ssRes / (ssTot || 1)) };
  }

  // Builds a t-parameter for each point based on cumulative distance
  // traveled along the stroke (normalized to [0,1]), rather than point
  // index. mousemove fires more often where the pointer moved slowly, so
  // indexing by position would bunch up "time" wherever the hand slowed
  // down (corners, tight curves) and warp the fit. Arc length reflects
  // how far along the actual curve each sample really is.
  function arcLengthParams(pts) {
    const n = pts.length;
    const dist = new Array(n).fill(0);
    let total = 0;
    for (let i = 1; i < n; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      total += Math.sqrt(dx * dx + dy * dy);
      dist[i] = total;
    }
    if (total < 1e-9) {
      // Degenerate stroke (all points coincide) - fall back to index spacing.
      return pts.map((_, i) => i / (n - 1));
    }
    return dist.map(d => d / total);
  }

  function fitParametric(pts) {
    const n = pts.length;
    const tParams = arcLengthParams(pts);
    let sT = 0, sX = 0, sY = 0, sT2 = 0, sT3 = 0, sT4 = 0, sTX = 0, sT2X = 0, sTY = 0, sT2Y = 0;

    for (let i = 0; i < n; i++) {
      const t = tParams[i];
      const x = pts[i].x;
      const y = pts[i].y;
      const t2 = t * t;

      sT += t; sT2 += t2; sT3 += t2 * t; sT4 += t2 * t2;
      sX += x; sTX += t * x; sT2X += t2 * x;
      sY += y; sTY += t * y; sT2Y += t2 * y;
    }

    function solveQuadSystem(vX) {
      const M = [
        [sT4, sT3, sT2],
        [sT3, sT2, sT],
        [sT2, sT,  n]
      ];
      function det3(m) {
        return m[0][0]*(m[1][1]*m[2][2] - m[1][2]*m[2][1])
             - m[0][1]*(m[1][0]*m[2][2] - m[1][2]*m[2][0])
             + m[0][2]*(m[1][0]*m[2][1] - m[1][1]*m[2][0]);
      }
      const D = det3(M);
      const Da = det3([[vX[0], M[0][1], M[0][2]], [vX[1], M[1][1], M[1][2]], [vX[2], M[2][1], M[2][2]]]);
      const Db = det3([[M[0][0], vX[0], M[0][2]], [M[1][0], vX[1], M[1][2]], [M[2][0], vX[2], M[2][2]]]);
      const Dc = det3([[M[0][0], M[0][1], vX[0]], [M[1][0], M[1][1], vX[1]], [M[2][0], M[2][1], vX[2]]]);

      return { a: Da / D, b: Db / D, c: Dc / D };
    }

    const fitX = solveQuadSystem([sT2X, sTX, sX]);
    const fitY = solveQuadSystem([sT2Y, sTY, sY]);

    return {
      ax: fitX.a, bx: fitX.b, cx: fitX.c,
      ay: fitY.a, by: fitY.b, cy: fitY.c
    };
  }

  // --- UI DRAWER UPDATES & HOVER HIGHLIGHTING ---
  // Layers are listed front-to-back (top of panel = topmost/frontmost
  // layer, matching the usual layers-panel convention), each with its own
  // curves grouped underneath it.
  function updateEquationsUI() {
    equationsList.innerHTML = "";

    for (let li = layers.length - 1; li >= 0; li--) {
      const layer = layers[li];
      const layerCurves = curves.filter(c => c.layerId === layer.id);

      const header = document.createElement("div");
      header.className = "layer-header" + (layer.id === activeLayerId ? " is-active-layer" : "");
      header.dataset.layerId = layer.id;
      header.innerHTML = `
        <button type="button" class="layer-visibility-btn" data-action="toggle-visibility" title="${layer.visible ? "Hide Layer" : "Show Layer"}">
          <i class="fa-solid ${layer.visible ? "fa-eye" : "fa-eye-slash"}"></i>
        </button>
        <span class="layer-name" data-action="select-layer" title="Set as Active Layer">${layer.name}</span>
        <span class="layer-count">${layerCurves.length}</span>
        <div class="layer-reorder">
          <button type="button" class="layer-reorder-btn" data-action="layer-move-up" title="Move Layer Up" ${li === layers.length - 1 ? "disabled" : ""}><i class="fa-solid fa-chevron-up"></i></button>
          <button type="button" class="layer-reorder-btn" data-action="layer-move-down" title="Move Layer Down" ${li === 0 ? "disabled" : ""}><i class="fa-solid fa-chevron-down"></i></button>
        </div>
        <button type="button" class="layer-reorder-btn danger" data-action="delete-layer" title="Delete Layer" ${layers.length <= 1 ? "disabled" : ""}><i class="fa-solid fa-trash"></i></button>
      `;
      equationsList.appendChild(header);

      if (layerCurves.length === 0) {
        const note = document.createElement("div");
        note.className = "layer-empty-note";
        note.textContent = "No curves yet - draw onto this layer to add one.";
        equationsList.appendChild(note);
        continue;
      }

      const group = document.createElement("div");
      group.className = "layer-curves-group";

      layerCurves.forEach((curve, idxInLayer) => {
        const card = document.createElement("div");
        card.className = "equation-card";
        card.dataset.curveId = curve.id;

        const atFront = idxInLayer === layerCurves.length - 1;
        const atBack = idxInLayer === 0;

        card.innerHTML = `
          <div class="color-dot"></div>
          <div class="math-text">${curve.equationText}</div>
          <div class="card-actions">
            <div class="layer-actions">
              <button type="button" class="action-btn layer-up" title="Bring Forward" data-action="layer-up" ${atFront ? "disabled" : ""}><i class="fa-solid fa-arrow-up"></i></button>
              <button type="button" class="action-btn layer-down" title="Send Backward" data-action="layer-down" ${atBack ? "disabled" : ""}><i class="fa-solid fa-arrow-down"></i></button>
            </div>
            <button type="button" class="action-btn copy" title="Copy Text" data-action="copy"><i class="fa-regular fa-copy"></i></button>
            <button type="button" class="action-btn delete" title="Delete Graph" data-action="delete"><i class="fa-solid fa-xmark"></i></button>
          </div>
        `;

        group.appendChild(card);
      });

      equationsList.appendChild(group);
    }

    applyActiveHighlight();
  }

  // Single delegated listener on the list container (which is never
  // destroyed/recreated) instead of one listener per button. Individual
  // per-button listeners kept silently failing to register clicks in some
  // browsers once the row started re-rendering on hover; delegation
  // sidesteps that entirely since it only ever depends on this one
  // permanent element.
  equationsList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || btn.disabled) return;
    const action = btn.dataset.action;

    // --- Layer header actions ---
    const header = btn.closest(".layer-header");
    if (header) {
      const layerId = Number(header.dataset.layerId);
      const layer = layers.find(l => l.id === layerId);
      if (!layer) return;

      if (action === "toggle-visibility") {
        layer.visible = !layer.visible;
        updateEquationsUI();
        render();
      } else if (action === "select-layer") {
        activeLayerId = layer.id;
        updateEquationsUI();
      } else if (action === "layer-move-up" || action === "layer-move-down") {
        const idx = layers.findIndex(l => l.id === layerId);
        const swapWith = action === "layer-move-up" ? idx + 1 : idx - 1;
        if (swapWith < 0 || swapWith >= layers.length) return;
        pushHistory();
        [layers[idx], layers[swapWith]] = [layers[swapWith], layers[idx]];
        updateEquationsUI();
        render();
      } else if (action === "delete-layer") {
        if (layers.length <= 1) return;
        pushHistory();
        layers = layers.filter(l => l.id !== layerId);
        curves = curves.filter(c => c.layerId !== layerId);
        if (activeLayerId === layerId) {
          activeLayerId = layers[layers.length - 1].id;
        }
        updateEquationsUI();
        render();
      }
      return;
    }

    // --- Equation card actions ---
    const card = btn.closest(".equation-card");
    if (!card) return;
    const id = Number(card.dataset.curveId);

    if (action === "delete") {
      pushHistory();
      curves = curves.filter(c => c.id !== id);
      if (activeCurveId === id) activeCurveId = null;
      updateEquationsUI();
      render();
    } else if (action === "copy") {
      const curve = curves.find(c => c.id === id);
      if (curve) navigator.clipboard.writeText(curve.equationText);
    } else if (action === "layer-up" || action === "layer-down") {
      // Reorder within this curve's own layer only - stacking across
      // layers is controlled by the layer's position, not individual
      // curves, so we only swap with the nearest same-layer neighbor.
      const idx = curves.findIndex(c => c.id === id);
      if (idx === -1) return;
      const curveLayerId = curves[idx].layerId;
      const sameLayerIdxs = [];
      curves.forEach((c, i) => { if (c.layerId === curveLayerId) sameLayerIdxs.push(i); });
      const posInLayer = sameLayerIdxs.indexOf(idx);
      const targetPos = action === "layer-up" ? posInLayer + 1 : posInLayer - 1;
      if (targetPos < 0 || targetPos >= sameLayerIdxs.length) return;
      const swapIdx = sameLayerIdxs[targetPos];
      pushHistory();
      [curves[idx], curves[swapIdx]] = [curves[swapIdx], curves[idx]];
      updateEquationsUI();
      render();
    }
  });

  // Hover highlighting, also delegated. mouseover/mouseout bubble (unlike
  // mouseenter/mouseleave), so one listener on the list covers every card.
  equationsList.addEventListener("mouseover", (e) => {
    const card = e.target.closest(".equation-card");
    if (!card) return;
    activeCurveId = Number(card.dataset.curveId);
    applyActiveHighlight();
    render();
  });

  equationsList.addEventListener("mouseout", (e) => {
    const card = e.target.closest(".equation-card");
    if (!card) return;
    // Only clear when actually leaving the card (not moving between its
    // children), i.e. the pointer's new target isn't still inside it.
    if (card.contains(e.relatedTarget)) return;
    activeCurveId = null;
    applyActiveHighlight();
    render();
  });

  // Updates just the highlight color-dot on whichever card matches
  // activeCurveId, without touching/recreating any DOM nodes.
  function applyActiveHighlight() {
    equationsList.querySelectorAll(".equation-card").forEach(card => {
      const id = Number(card.dataset.curveId);
      const curve = curves.find(c => c.id === id);
      if (!curve) return;
      const dot = card.querySelector(".color-dot");
      const isActive = (id === activeCurveId);
      dot.style.backgroundColor = isActive ? curve.highlightColor : "#000000";
      card.classList.toggle("is-active", isActive);
    });
  }

  // --- EXPORT & COPY ALL LOGIC ---
  exportImgBtn.addEventListener("click", () => {
    activeCurveId = null;
    render();

    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `GTA11-GraphArt-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  });

  copyAllBtn.addEventListener("click", () => {
    if (curves.length === 0) {
      alert("No equations to copy yet! Draw on the graph first.");
      return;
    }

    // IMPORTANT: no numbering/prefixes here. Desmos's expression list treats
    // each pasted line as its own standalone expression, so a leading
    // "1. " would get parsed as part of the equation and break every line.
    const allEquationsText = curves
      .map(c => c.equationText)
      .join("\n");

    navigator.clipboard.writeText(allEquationsText).then(() => {
      const originalText = copyAllBtn.querySelector("span").textContent;
      copyAllBtn.querySelector("span").textContent = "Copied!";
      setTimeout(() => {
        copyAllBtn.querySelector("span").textContent = originalText;
      }, 2000);
    });
  });

  // --- IMPORT SAVED EQUATIONS ---
  // Lets a person paste equation text previously copied out of GTA-11 (via
  // "Copy Text" or "Copy All", in the exact pasteable-Desmos syntax the app
  // generates) and rebuild real curve objects from it, so a saved graph can
  // be continued later. This is purely the reverse direction of the existing
  // equationText generation in processStroke() below - it does not touch the
  // sketch-fitting/rendering pipeline at all, it only ever pushes onto the
  // same `curves` array those functions already read from.

  // Parses "A t^2 + B t + C" (or the x/y equivalent) into {a, b, c}. Tolerant
  // of a missing leading sign on the first term and of an implicit ±1
  // coefficient (e.g. "-t^2"), even though GTA-11's own output always
  // includes an explicit numeric coefficient.
  function parseQuadCoeffs(exprRaw) {
    const expr = exprRaw.replace(/\s+/g, "");
    let a = 0, b = 0, c = 0;
    const terms = expr.match(/[+-]?[^+-]+/g) || [];
    terms.forEach(term => {
      if (!term) return;
      if (term.endsWith("t^2")) {
        a = coefVal(term.slice(0, -3));
      } else if (term.endsWith("t")) {
        b = coefVal(term.slice(0, -1));
      } else {
        c = coefVal(term);
      }
    });
    return { a, b, c };
  }

  // Resolves a coefficient string that may be bare "+"/"-" (implicit 1) or a
  // genuine number.
  function coefVal(s) {
    if (s === "" || s === "+") return 1;
    if (s === "-") return -1;
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  // Parses a single line of pasted equation text into a curve-data object
  // (missing only id/layerId/highlightColor, which the caller fills in).
  // Returns null if the line doesn't match any known GTA-11/Desmos format.
  function parseSingleEquation(rawLine) {
    // Desmos's pasteable domain-restriction syntax relies on literal
    // backslashes ("\left\{...\right\}", "\le"). Stripping every backslash
    // up front turns that into plain "left{...le...le...right}" text, which
    // is far simpler and safer to match than re-escaping backslashes inside
    // a JS regex literal.
    const clean = rawLine.replace(/\\/g, "").trim();
    if (!clean) return null;

    let domainMin = null;
    let domainMax = null;
    let body = clean;

    const domainMatch = clean.match(/left\{(-?[\d.]+)\s*le\s*[xy]\s*le\s*(-?[\d.]+)\s*right\}/i);
    if (domainMatch) {
      domainMin = parseFloat(domainMatch[1]);
      domainMax = parseFloat(domainMatch[2]);
      body = clean.slice(0, domainMatch.index).trim();
    }

    // Parametric: ( x(t) , y(t) )
    if (body.startsWith("(")) {
      const pm = body.match(/^\(\s*(.+?)\s*,\s*(.+?)\s*\)\s*$/);
      if (!pm) return null;
      const xCoef = parseQuadCoeffs(pm[1]);
      const yCoef = parseQuadCoeffs(pm[2]);
      return {
        type: "parametric",
        ax: xCoef.a, bx: xCoef.b, cx: xCoef.c,
        ay: yCoef.a, by: yCoef.b, cy: yCoef.c,
        equationText: rawLine.trim()
      };
    }

    // Vertical line: x = VAL
    let m = body.match(/^x\s*=\s*(-?[\d.]+)\s*$/i);
    if (m) {
      return {
        type: "vertical_line",
        xVal: parseFloat(m[1]),
        domain: { min: domainMin !== null ? domainMin : -10, max: domainMax !== null ? domainMax : 10 },
        equationText: rawLine.trim()
      };
    }

    // Parabola: y = A x^2 (+/-) B x (+/-) C
    m = body.match(/^y\s*=\s*(-?[\d.]+)x\^2\s*([+-])\s*([\d.]+)x\s*([+-])\s*([\d.]+)\s*$/i);
    if (m) {
      return {
        type: "parabola",
        a: parseFloat(m[1]),
        b: (m[2] === "+" ? 1 : -1) * parseFloat(m[3]),
        c: (m[4] === "+" ? 1 : -1) * parseFloat(m[5]),
        domain: { min: domainMin !== null ? domainMin : -10, max: domainMax !== null ? domainMax : 10 },
        equationText: rawLine.trim()
      };
    }

    // Line: y = M x (+/-) B
    m = body.match(/^y\s*=\s*(-?[\d.]+)x\s*([+-])\s*([\d.]+)\s*$/i);
    if (m) {
      return {
        type: "line",
        m: parseFloat(m[1]),
        b: (m[2] === "+" ? 1 : -1) * parseFloat(m[3]),
        domain: { min: domainMin !== null ? domainMin : -10, max: domainMax !== null ? domainMax : 10 },
        equationText: rawLine.trim()
      };
    }

    return null;
  }

  function openImportModal() {
    importTextarea.value = "";
    importFeedback.textContent = "";
    importFeedback.className = "import-feedback";
    importModalOverlay.classList.remove("hidden");
    importTextarea.focus();
  }

  function closeImportModal() {
    importModalOverlay.classList.add("hidden");
  }

  importEqsBtn.addEventListener("click", openImportModal);
  importModalClose.addEventListener("click", closeImportModal);
  importCancelBtn.addEventListener("click", closeImportModal);

  // Click on the dimmed backdrop (not the card itself) closes the modal.
  importModalOverlay.addEventListener("click", (e) => {
    if (e.target === importModalOverlay) closeImportModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !importModalOverlay.classList.contains("hidden")) {
      closeImportModal();
    }
  });

  importConfirmBtn.addEventListener("click", () => {
    const rawLines = importTextarea.value.split("\n").map(l => l.trim()).filter(l => l.length > 0);

    if (rawLines.length === 0) {
      importFeedback.textContent = "Paste at least one saved equation line first.";
      importFeedback.className = "import-feedback error";
      return;
    }

    const parsedCurves = [];
    let failedCount = 0;

    rawLines.forEach(line => {
      const parsed = parseSingleEquation(line);
      if (parsed) {
        parsedCurves.push(parsed);
      } else {
        failedCount++;
      }
    });

    if (parsedCurves.length === 0) {
      importFeedback.textContent = `Couldn't recognize ${failedCount === 1 ? "that line" : "any of those lines"}. Make sure it's pasted exactly as GTA-11 exported it.`;
      importFeedback.className = "import-feedback error";
      return;
    }

    pushHistory();

    // Importing onto a hidden layer would silently vanish, same safeguard
    // used when drawing a fresh stroke.
    const targetLayer = layers.find(l => l.id === activeLayerId);
    if (targetLayer && !targetLayer.visible) targetLayer.visible = true;

    parsedCurves.forEach(data => {
      const highlightColor = highlightColors[colorIndex % highlightColors.length];
      colorIndex++;
      curves.push({
        id: nextCurveId(),
        layerId: activeLayerId,
        highlightColor,
        ...data
      });
    });

    updateEquationsUI();
    render();

    const successMsg = `Imported ${parsedCurves.length} equation${parsedCurves.length === 1 ? "" : "s"}.` +
      (failedCount > 0 ? ` Skipped ${failedCount} unrecognized line${failedCount === 1 ? "" : "s"}.` : "");
    importFeedback.textContent = successMsg;
    importFeedback.className = "import-feedback success";

    // Only auto-close when everything imported cleanly - if some lines were
    // skipped, keep the modal open so the person can see the count and fix
    // or remove the offending lines before trying again.
    if (failedCount === 0) {
      setTimeout(closeImportModal, 1100);
    }
  });

  // --- BACKGROUND REFERENCE CONTROLS ---
  bgUpload.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        bgImage = img;
        bgImageBaseScale = scale;
        imageControls.classList.remove("hidden");
        render();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });

  removeBgBtn.addEventListener("click", () => {
    bgImage = null;
    bgUpload.value = "";
    imageControls.classList.add("hidden");
    render();
  });

  bgOpacity.addEventListener("input", (e) => {
    bgImageOpacity = parseFloat(e.target.value);
    render();
  });

  clearAllBtn.addEventListener("click", () => {
    if (curves.length === 0) return;
    pushHistory();
    curves = [];
    activeCurveId = null;
    updateEquationsUI();
    render();
  });

  // --- NAVIGATION CONTROLS ---
  zoomInBtn.addEventListener("click", () => { scale *= 1.2; render(); });
  zoomOutBtn.addEventListener("click", () => { scale /= 1.2; render(); });
  resetViewBtn.addEventListener("click", () => {
    scale = 45;
    originX = canvas.width / 2;
    originY = canvas.height / 2;
    render();
  });

  window.addEventListener("resize", () => {
    if (!appWorkspace.classList.contains("hidden")) {
      initCanvas();
    }
  });
});
