// Profile hero for github.com/Nexlein: the portfolio's value iteration field as an animated SVG, one file per theme.
// Usage: node hero.mjs <portfolio checkout> <output directory>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [portfolio, out] = process.argv.slice(2);
const CELL = 44;
const W = CELL * 28; // whole cells: no arrow or wall cut at the edge
const H = CELL * 11;
const GAMMA = 0.95;
const DIRS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1]
];
const STEP = 4; // seconds each sentence stays
const cols = Math.ceil(W / CELL);
const rows = Math.ceil(H / CELL);

// The portfolio's tokens (src/styles/tokens.css); line and muted are its color-mix values
const THEMES = {
    dark: { bg: '#0a0e14', ink: '#e6eaf0', signal: '#ff7a1a', cold: '#4c8dff', line: '#22262c', muted: '#9b9fa5' },
    light: { bg: '#fafaf9', ink: '#111827', signal: '#4f46e5', cold: '#64748b', line: '#e0e1e2', muted: '#60656e' }
};

// One sentence and one reward cell per state: the arrows re-plan when the sentence changes
const STATES = [
    { text: 'AI that cites its sources.', goal: [0.9, 0.2] },
    { text: 'Zero-downtime deploys.', goal: [0.1, 0.8] },
    { text: 'End-to-end tested apps.', goal: [0.9, 0.82] }
];

const ellipse = (px, py) => Math.hypot((px - W / 2) / 640, (py - H / 2) / 205);
const behindText = (px, py) => ellipse(px, py) < 1;

// Same seeded walls as src/components/Hero/sims/value-iteration.ts, kept clear of the text
function walls() {
    const wall = new Uint8Array(cols * rows);
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < (cols * rows) / 40; k++) {
        const x = Math.floor(rnd() * cols);
        const y = Math.floor(rnd() * rows);
        const horizontal = rnd() > 0.5;
        for (let i = 0; i < 4; i++) {
            const cx = x + (horizontal ? i : 0);
            const cy = y + (horizontal ? 0 : i);
            if (cx < cols && cy < rows && !behindText(cx * CELL + CELL / 2, cy * CELL + CELL / 2)) wall[cy * cols + cx] = 1;
        }
    }
    return wall;
}

function solve(wall, goal) {
    const V = new Float32Array(cols * rows);
    const angle = new Float32Array(cols * rows);
    for (let sweep = 0; sweep < 120; sweep++)
        for (let y = 0; y < rows; y++)
            for (let x = 0; x < cols; x++) {
                const i = y * cols + x;
                if (wall[i]) continue;
                if (x === goal.x && y === goal.y) {
                    V[i] = 1;
                    continue;
                }
                let best = 0;
                let bx = 0;
                let by = 0;
                for (const [dx, dy] of DIRS) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || wall[ny * cols + nx]) continue;
                    const v = GAMMA * V[ny * cols + nx] * (dx && dy ? 0.98 : 1);
                    if (v > best) {
                        best = v;
                        bx = dx;
                        by = dy;
                    }
                }
                V[i] = best;
                if (best > 0) angle[i] = Math.atan2(by, bx);
            }
    return { V, angle };
}

/** 1 away from the text, 0.12 behind it, with a soft edge: the type stays readable over the field. */
function fade(px, py) {
    return 0.12 + 0.88 * Math.min(1, Math.max(0, (ellipse(px, py) - 0.8) / 0.35));
}

const n = (v) => Math.round(v * 10) / 10;

function arrows(wall, goal, theme) {
    const { V, angle } = solve(wall, goal);
    const buckets = new Map();
    for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
            const i = y * cols + x;
            if (wall[i] || V[i] <= 0 || (x === goal.x && y === goal.y)) continue;
            const root = Math.sqrt(V[i]);
            const cx = x * CELL + CELL / 2;
            const cy = y * CELL + CELL / 2;
            const half = (7 + 12 * root) / 2;
            const c = Math.cos(angle[i]);
            const s = Math.sin(angle[i]);
            const tipX = cx + c * half;
            const tipY = cy + s * half;
            const backX = tipX - c * 4.5;
            const backY = tipY - s * 4.5;
            const d =
                `M${n(cx - c * half)} ${n(cy - s * half)}L${n(tipX)} ${n(tipY)}L${n(backX + s * 4.5)} ${n(backY - c * 4.5)}` +
                `M${n(tipX)} ${n(tipY)}L${n(backX - s * 4.5)} ${n(backY + c * 4.5)}`;
            const alpha = Math.round((0.25 + 0.75 * root) * fade(cx, cy) * 8) / 8;
            const key = `${V[i] > 0.55 ? 'signal' : 'cold'}|${Math.max(alpha, 0.125)}`;
            buckets.set(key, (buckets.get(key) ?? '') + d);
        }
    return [...buckets]
        .map(([key, d]) => {
            const [color, alpha] = key.split('|');
            return `<path d="${d}" stroke="${theme[color]}" stroke-opacity="${alpha}"/>`;
        })
        .join('');
}

const font = (file) => readFileSync(join(portfolio, 'node_modules', file)).toString('base64');
const SANS = font('@fontsource-variable/schibsted-grotesk/files/schibsted-grotesk-latin-wght-normal.woff2');
const MONO = font('@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2');

function svg(theme) {
    const wall = walls();
    const blocks = [];
    for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++)
            if (wall[y * cols + x]) blocks.push(`M${x * CELL + 4} ${y * CELL + 4}h${CELL - 8}v${CELL - 8}h-${CELL - 8}z`);

    const total = STEP * STATES.length;
    const states = STATES.map((state, k) => {
        const goal = {
            x: Math.min(cols - 1, Math.floor((state.goal[0] * W) / CELL)),
            y: Math.min(rows - 1, Math.floor((state.goal[1] * H) / CELL))
        };
        if (wall[goal.y * cols + goal.x]) wall[goal.y * cols + goal.x] = 0;
        const gx = goal.x * CELL + CELL / 2;
        const gy = goal.y * CELL + CELL / 2;
        return `<g class="s" style="animation-delay:${k * STEP - total}s">
<g fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${arrows(wall, goal, theme)}</g>
<circle cx="${gx}" cy="${gy}" r="9" fill="${theme.signal}"/>
<text class="end" x="${W / 2}" y="${H / 2 + 88}" fill="${theme.muted}">${state.text}</text>
</g>`;
    }).join('\n');

    const visible = (100 / STATES.length).toFixed(2);
    const fadeIn = 4;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t">
<title id="t">Nexlein. AI &amp; Full-Stack Developer at Epitech. ${STATES.map((s) => s.text).join(' ')}</title>
<style>
@font-face{font-family:S;src:url(data:font/woff2;base64,${SANS}) format("woff2");font-weight:100 900}
@font-face{font-family:M;src:url(data:font/woff2;base64,${MONO}) format("woff2");font-weight:500}
text{text-anchor:middle}
.name{font:800 128px S,system-ui,sans-serif;letter-spacing:-.035em}
.end{font:700 76px S,system-ui,sans-serif;letter-spacing:-.03em}
.role{font:500 27px M,ui-monospace,monospace}
.s{opacity:0;animation:cycle ${total}s linear infinite}
.s:first-of-type{opacity:1}
@keyframes cycle{0%{opacity:0}${fadeIn}%{opacity:1}${visible}%{opacity:1}${(+visible + fadeIn).toFixed(2)}%{opacity:0}100%{opacity:0}}
@media (prefers-reduced-motion:reduce){.s{animation:none}}
</style>
<defs><clipPath id="c"><rect width="${W}" height="${H}" rx="20"/></clipPath></defs>
<g clip-path="url(#c)">
<rect width="${W}" height="${H}" fill="${theme.bg}"/>
<path d="${blocks.join('')}" fill="${theme.line}"/>
${states}
<text class="role" x="${W / 2}" y="${H / 2 - 118}" fill="${theme.signal}">AI &amp; Full-Stack Developer · Epitech</text>
<text class="name" x="${W / 2}" y="${H / 2 + 6}" fill="${theme.ink}">Nexlein.</text>
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="19.5" fill="none" stroke="${theme.line}"/>
</svg>
`;
}

for (const [name, theme] of Object.entries(THEMES)) {
    const file = join(out, `hero-${name}.svg`);
    writeFileSync(file, svg(theme));
    console.log(file, Math.round(readFileSync(file).length / 1024), 'KB');
}
