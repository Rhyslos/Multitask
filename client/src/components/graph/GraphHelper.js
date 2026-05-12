// user functions
export function getDistanceToLine(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;
    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }

    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
}

export function getNodeBounds(el) {
    const minX = Math.min(el.x, el.x + (el.width || 0));
    const maxX = Math.max(el.x, el.x + (el.width || 0));
    const minY = Math.min(el.y, el.y + (el.height || 0));
    const maxY = Math.max(el.y, el.y + (el.height || 0));
    return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

export function getAnchorDots(el) {
    const b = getNodeBounds(el);
    return [
        { side: 'top',    t: 0.5, x: b.minX + b.w * 0.5, y: b.minY },
        { side: 'right',  t: 0.5, x: b.maxX,             y: b.minY + b.h * 0.5 },
        { side: 'bottom', t: 0.5, x: b.minX + b.w * 0.5, y: b.maxY },
        { side: 'left',   t: 0.5, x: b.minX,             y: b.minY + b.h * 0.5 },
    ];
}

export function resolveAnchor(el, anchor) {
    const b = getNodeBounds(el);
    const t = anchor.t ?? 0.5;
    if (el.type === 'circle') {
        const cx = b.minX + b.w / 2;
        const cy = b.minY + b.h / 2;
        const rx = b.w / 2;
        const ry = b.h / 2;
        let angle;
        switch (anchor.side) {
            case 'top':    angle = -Math.PI / 2 + (t - 0.5) * Math.PI; break;
            case 'right':  angle = 0           + (t - 0.5) * Math.PI; break;
            case 'bottom': angle = Math.PI / 2 + (t - 0.5) * Math.PI; break;
            case 'left':   angle = Math.PI     + (t - 0.5) * Math.PI; break;
            default:       angle = 0;
        }
        return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
    }
    switch (anchor.side) {
        case 'top':    return { x: b.minX + b.w * t, y: b.minY };
        case 'right':  return { x: b.maxX,           y: b.minY + b.h * t };
        case 'bottom': return { x: b.minX + b.w * t, y: b.maxY };
        case 'left':   return { x: b.minX,           y: b.minY + b.h * t };
        default:       return { x: b.minX + b.w / 2, y: b.minY + b.h / 2 };
    }
}

export function getAnchorFromPoint(el, px, py, tol = 12) {
    const b = getNodeBounds(el);
    if (b.w === 0 || b.h === 0) return null;

    if (el.type === 'circle') {
        const cx = b.minX + b.w / 2;
        const cy = b.minY + b.h / 2;
        const rx = b.w / 2;
        const ry = b.h / 2;
        const dx = px - cx;
        const dy = py - cy;

        const angle = Math.atan2(dy, dx);
        const perimX = rx * Math.cos(angle);
        const perimY = ry * Math.sin(angle);
        const distFromPerim = Math.hypot(dx - perimX, dy - perimY);
        if (distFromPerim > tol) return null;

        let side;
        if (angle >= -Math.PI / 4 && angle < Math.PI / 4)        side = 'right';
        else if (angle >= Math.PI / 4 && angle < 3 * Math.PI / 4) side = 'bottom';
        else if (angle >= -3 * Math.PI / 4 && angle < -Math.PI / 4) side = 'top';
        else                                                      side = 'left';
        return { side, t: 0.5 };
    }

    const candidates = [
        { side: 'top',    dist: Math.abs(py - b.minY), t: (px - b.minX) / b.w, inRange: px >= b.minX - tol && px <= b.maxX + tol },
        { side: 'bottom', dist: Math.abs(py - b.maxY), t: (px - b.minX) / b.w, inRange: px >= b.minX - tol && px <= b.maxX + tol },
        { side: 'left',   dist: Math.abs(px - b.minX), t: (py - b.minY) / b.h, inRange: py >= b.minY - tol && py <= b.maxY + tol },
        { side: 'right',  dist: Math.abs(px - b.maxX), t: (py - b.minY) / b.h, inRange: py >= b.minY - tol && py <= b.maxY + tol },
    ].filter(c => c.inRange && c.dist <= tol);

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.dist - b.dist);
    const best = candidates[0];
    return { side: best.side, t: Math.max(0, Math.min(1, best.t)) };
}

// Lines and arrows are connection-type elements; rectangles, circles, and
// text are node-type. Only node-types support resize handles, anchors, and
// labels-via-double-click.
export function isNodeType(type) {
    return type === 'rectangle' || type === 'circle' || type === 'text';
}

export function isHittingLabel(px, py, el) {
    const tol = 10;
    if (el.type === 'text') {
        const b = getNodeBounds(el);
        return px >= b.minX - tol && px <= b.maxX + tol && py >= b.minY - tol && py <= b.maxY + tol;
    }

    const b = getNodeBounds(el);
    const padding = 16;
    const maxWidth = Math.max(10, b.w - padding);
    const labelStr = el.label || '';

    const approxLines = labelStr ? Math.max(1, Math.ceil((labelStr.length * 8) / maxWidth)) : 1;
    const labelH = Math.max(20, approxLines * 16);
    const labelW = labelStr ? (approxLines > 1 ? maxWidth : labelStr.length * 8) : 40;

    const lx = b.minX + b.w / 2 - labelW / 2;
    const ly = b.minY + b.h / 2 - labelH / 2;

    return px >= lx - tol && px <= lx + labelW + tol && py >= ly - tol && py <= ly + labelH + tol;
}

export function isHittingEdge(px, py, el, allElements) {
    const tol = 10;

    // Arrow and line use identical hit-testing: distance from the point to
    // the segment between the resolved endpoints. The arrowhead is small
    // enough not to matter; both feel the same to click.
    if (el.type === 'arrow' || el.type === 'line') {
        const ends = getArrowEndpoints(el, allElements);
        if (!ends) return false;
        return getDistanceToLine(px, py, ends.from.x, ends.from.y, ends.to.x, ends.to.y) <= tol;
    }

    const inLabel = isHittingLabel(px, py, el);
    const b = getNodeBounds(el);

    if (el.type === 'rectangle' || el.type === 'text') {
        const inOuter = px >= b.minX - tol && px <= b.maxX + tol && py >= b.minY - tol && py <= b.maxY + tol;
        const inInner = px >= b.minX + tol && px <= b.maxX - tol && py >= b.minY + tol && py <= b.maxY - tol;
        return el.type === 'text' ? inOuter : (inOuter && (!inInner || inLabel));
    }

    if (el.type === 'circle') {
        const rx = b.w / 2;
        const ry = b.h / 2;
        const cx = b.minX + rx;
        const cy = b.minY + ry;
        if (rx === 0 || ry === 0) return false;

        const isInsideOuter = ((px - cx) ** 2) / ((rx + tol) ** 2) + ((py - cy) ** 2) / ((ry + tol) ** 2) <= 1;
        const innerRx = Math.max(0, rx - tol);
        const innerRy = Math.max(0, ry - tol);
        const isInsideInner = innerRx > 0 && innerRy > 0
            ? ((px - cx) ** 2) / (innerRx ** 2) + ((py - cy) ** 2) / (innerRy ** 2) <= 1
            : false;

        return isInsideOuter && (!isInsideInner || inLabel);
    }
    return false;
}

// Resolves both endpoints of an arrow or line to world coordinates. Handles
// all four endpoint forms: anchored ({fromId, fromAnchor}), free
// ({fromPoint}), and the legacy x/y/width-height encoding used by some
// existing data. Despite the name, this is used for lines too — keeping the
// name avoids touching every caller, but the contract is "resolve connection
// endpoints".
export function getArrowEndpoints(arrow, allElements) {
    let from, to;

    if (arrow.fromId) {
        const fromEl = allElements.find(e => e.id === arrow.fromId);
        if (!fromEl) return null;
        from = resolveAnchor(fromEl, arrow.fromAnchor || { side: 'right', t: 0.5 });
    } else if (arrow.fromPoint) {
        from = arrow.fromPoint;
    } else {
        from = { x: arrow.x, y: arrow.y };
    }

    if (arrow.toId) {
        const toEl = allElements.find(e => e.id === arrow.toId);
        if (!toEl) return null;
        to = resolveAnchor(toEl, arrow.toAnchor || { side: 'left', t: 0.5 });
    } else if (arrow.toPoint) {
        to = arrow.toPoint;
    } else {
        to = { x: arrow.x + (arrow.width || 0), y: arrow.y + (arrow.height || 0) };
    }

    return { from, to };
}

const COLOR_DEFAULT   = '#1e1e1e';
const COLOR_SELECTED  = '#3b82f6';
const COLOR_HIGHLIGHT = '#f59e0b';
const COLOR_STARTER   = '#10b981';
const COLOR_HOVER     = 'rgba(59, 130, 246, 0.3)';
const FILL_DEFAULT    = '#fafaf9';
const FILL_HIGHLIGHT  = '#fef3c7';
const FILL_STARTER    = '#ecfdf5';
const FILL_SELECTED   = '#eff6ff';
const CORNER_RADIUS   = 8;

function effectiveRadius(w, h) {
    return Math.min(CORNER_RADIUS, Math.abs(w) / 2, Math.abs(h) / 2);
}

function roundedRectPath(ctx, x, y, w, h, r) {
    const minX = Math.min(x, x + w);
    const maxX = Math.max(x, x + w);
    const minY = Math.min(y, y + h);
    const maxY = Math.max(y, y + h);
    ctx.beginPath();
    ctx.moveTo(minX + r, minY);
    ctx.lineTo(maxX - r, minY);
    ctx.quadraticCurveTo(maxX, minY, maxX, minY + r);
    ctx.lineTo(maxX, maxY - r);
    ctx.quadraticCurveTo(maxX, maxY, maxX - r, maxY);
    ctx.lineTo(minX + r, maxY);
    ctx.quadraticCurveTo(minX, maxY, minX, maxY - r);
    ctx.lineTo(minX, minY + r);
    ctx.quadraticCurveTo(minX, minY, minX + r, minY);
    ctx.closePath();
}

function fillWithShadowThenStroke(ctx, fill, stroke, lineWidth, hoverStroke) {
    if (hoverStroke) {
        ctx.save();
        ctx.strokeStyle = hoverStroke;
        ctx.lineWidth = lineWidth + 8;
        ctx.stroke();
        ctx.restore();
    }
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
}

function drawLabel(ctx, element, color) {
    if (!element.label) return;
    const b = getNodeBounds(element);

    ctx.save();
    ctx.font = '14px Arial, sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const padding = 16;
    const maxWidth = Math.max(10, b.w - padding);
    const words = element.label.split(' ');
    const lines = [];
    let currentLine = words[0] || '';

    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + " " + word).width;
        if (width < maxWidth) {
            currentLine += " " + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    if (currentLine) lines.push(currentLine);

    const lineHeight = 16;
    const totalHeight = lines.length * lineHeight;
    const startY = b.minY + b.h / 2 - totalHeight / 2 + lineHeight / 2;

    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], b.minX + b.w / 2, startY + i * lineHeight);
    }

    ctx.restore();
}

export function drawElement(ctx, element, opts = {}, allElements = []) {
    const { isSelected = false, isHighlighted = false, isStarter = false, isHovered = false } = opts;

    let stroke = COLOR_DEFAULT;
    let fill = FILL_DEFAULT;
    let lineWidth = 1.5;
    if (isHighlighted)     { stroke = COLOR_HIGHLIGHT; fill = FILL_HIGHLIGHT; lineWidth = 2.5; }
    else if (isSelected)   { stroke = COLOR_SELECTED;  fill = FILL_SELECTED;  lineWidth = 2; }
    else if (isStarter)    { stroke = COLOR_STARTER;   fill = FILL_STARTER;   lineWidth = 2; }

    const hoverStroke = (isHovered && !isSelected) ? COLOR_HOVER : null;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (element.type === 'rectangle') {
        const r = effectiveRadius(element.width, element.height);
        roundedRectPath(ctx, element.x, element.y, element.width, element.height, r);
        fillWithShadowThenStroke(ctx, fill, stroke, lineWidth, hoverStroke);
        drawLabel(ctx, element, stroke);
    } else if (element.type === 'circle') {
        const radiusX = Math.abs(element.width) / 2;
        const radiusY = Math.abs(element.height) / 2;
        const centerX = element.x + element.width / 2;
        const centerY = element.y + element.height / 2;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
        fillWithShadowThenStroke(ctx, fill, stroke, lineWidth, hoverStroke);
        drawLabel(ctx, element, stroke);
    } else if (element.type === 'arrow') {
        const ends = getArrowEndpoints(element, allElements);
        if (!ends) return;

        if (hoverStroke) {
            ctx.save();
            ctx.strokeStyle = hoverStroke;
            ctx.lineWidth = 10;
            drawArrowLine(ctx, ends.from.x, ends.from.y, ends.to.x, ends.to.y);
            ctx.restore();
        }

        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth + 1;
        drawArrowLine(ctx, ends.from.x, ends.from.y, ends.to.x, ends.to.y);
    } else if (element.type === 'line') {
        // Same as arrow but no head — just a stroke between the resolved
        // endpoints. Reuses getArrowEndpoints (which handles every endpoint
        // form lines also support).
        const ends = getArrowEndpoints(element, allElements);
        if (!ends) return;

        if (hoverStroke) {
            ctx.save();
            ctx.strokeStyle = hoverStroke;
            ctx.lineWidth = 10;
            drawLine(ctx, ends.from.x, ends.from.y, ends.to.x, ends.to.y);
            ctx.restore();
        }

        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth + 1;
        drawLine(ctx, ends.from.x, ends.from.y, ends.to.x, ends.to.y);
    } else if (element.type === 'text') {
        if (hoverStroke) {
            const b = getNodeBounds(element);
            ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
            ctx.fillRect(b.minX - 6, b.minY - 6, b.w + 12, b.h + 12);
        }
        ctx.font = '16px Arial, sans-serif';
        ctx.fillStyle = stroke;
        ctx.textBaseline = 'top';
        ctx.fillText(element.text, element.x, element.y);
    }
}

export function getResizeHandles(el) {
    const b = getNodeBounds(el);
    const SIZE = 8;
    return [
        { side: 'top',    x: b.minX + b.w / 2, y: b.minY,         size: SIZE, cursor: 'ns-resize' },
        { side: 'right',  x: b.maxX,           y: b.minY + b.h / 2, size: SIZE, cursor: 'ew-resize' },
        { side: 'bottom', x: b.minX + b.w / 2, y: b.maxY,         size: SIZE, cursor: 'ns-resize' },
        { side: 'left',   x: b.minX,           y: b.minY + b.h / 2, size: SIZE, cursor: 'ew-resize' },
    ];
}

export function getHandleAtPoint(el, px, py) {
    if (!isNodeType(el.type)) return null;
    const handles = getResizeHandles(el);
    const SLOP = 6;
    for (const h of handles) {
        if (Math.abs(px - h.x) <= h.size / 2 + SLOP && Math.abs(py - h.y) <= h.size / 2 + SLOP) {
            return h;
        }
    }
    return null;
}

export function drawResizeHandles(ctx, el) {
    const handles = getResizeHandles(el);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = COLOR_SELECTED;
    ctx.lineWidth = 1.5;
    handles.forEach(h => {
        const half = h.size / 2;
        ctx.fillRect(h.x - half, h.y - half, h.size, h.size);
        ctx.strokeRect(h.x - half, h.y - half, h.size, h.size);
    });
}

export function applyResize(start, side, worldX, worldY) {
    let { x, y, width, height } = start;
    if (side === 'right') {
        width = worldX - x;
    } else if (side === 'left') {
        const newX = worldX;
        width = x + width - newX;
        x = newX;
    } else if (side === 'bottom') {
        height = worldY - y;
    } else if (side === 'top') {
        const newY = worldY;
        height = y + height - newY;
        y = newY;
    }
    return { x, y, width, height };
}

export function normalizeBounds(el) {
    let { x, y, width, height } = el;
    if (width < 0)  { x += width;  width  = -width;  }
    if (height < 0) { y += height; height = -height; }
    return { ...el, x, y, width, height };
}

export function drawArrowLine(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const angle = Math.atan2(dy, dx);
    const headlen = 15;
    ctx.lineTo(x2 - headlen * Math.cos(angle - Math.PI / 6), y2 - headlen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headlen * Math.cos(angle + Math.PI / 6), y2 - headlen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
}

// Plain line — same primitive as drawArrowLine without the head. Kept as a
// separate function so the renderer's per-frame call sites are explicit
// about which one they want.
export function drawLine(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
}

export function drawAnchorDots(ctx, el) {
    const dots = getAnchorDots(el);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = COLOR_SELECTED;
    ctx.lineWidth = 2;
    dots.forEach(d => {
        ctx.beginPath();
        ctx.arc(d.x, d.y, 5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
    });
}

export function buildExecutionOrder(starterId, elements) {
    if (!starterId) return [];
    const nodeById = new Map();
    const outgoing = new Map();
    elements.forEach(el => {
        if (isNodeType(el.type)) nodeById.set(el.id, el);
    });
    // Only arrows participate in trace execution — lines are visual only,
    // by design. (If you ever want lines to also act as directed traversal
    // edges, change the type check below; the rest of the trace logic
    // doesn't care which it is.)
    elements.forEach(el => {
        if (el.type === 'arrow' && el.fromId && el.toId) {
            if (!outgoing.has(el.fromId)) outgoing.set(el.fromId, []);
            outgoing.get(el.fromId).push(el);
        }
    });

    const steps = [];
    const visited = new Set();
    const queue = [starterId];

    while (queue.length) {
        const id = queue.shift();
        if (visited.has(id)) {
            steps.push({ kind: 'cycle', id });
            continue;
        }
        if (!nodeById.has(id)) continue;
        visited.add(id);
        steps.push({ kind: 'node', id });

        const edges = outgoing.get(id) || [];
        edges.forEach(edge => {
            steps.push({ kind: 'edge', id: edge.id });
            queue.push(edge.toId);
        });
    }
    return steps;
}

export function getElementLabel(el) {
    if (!el) return '(missing)';
    if (el.type === 'text') return el.text || '(text)';
    if (el.label) return el.label;
    return el.type.charAt(0).toUpperCase() + el.type.slice(1);
}