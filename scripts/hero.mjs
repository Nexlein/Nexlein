// Profile hero for github.com/Nexlein, one animated SVG per theme. A README image cannot run scripts, so this runs the
// portfolio's value iteration ahead of time and writes each arrow's motion out as CSS keyframes, on one exact loop.
// Usage: node hero.mjs <portfolio checkout> <output directory>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [portfolio, out] = process.argv.slice(2);
const CELL = 44;
const W = CELL * 28; // whole cells: no arrow or wall cut at the edge
const H = CELL * 12;
const cols = W / CELL;
const rows = H / CELL;
const GAMMA = 0.95;
// Value above which an arrow takes the accent colour. The site uses 0.55 on about 48 columns: this keeps its proportion on 28
const HOT = 0.7;
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

// Timing from the site: a new ending every 4.2 s, 450 ms each way. The field's loop holds two rounds of the three.
const STEP = 4.2;
const SLIDE = 0.45;
const DROP = 100; // px: just past the mask
const ENDINGS = ['AI that cites its sources.', 'Zero-downtime deploys.', 'End-to-end tested apps.'];
const TEXT_LOOP = STEP * ENDINGS.length;
const LOOP = TEXT_LOOP * 2;
const FPS = 60;
const SAMPLE_EVERY = 4; // 15 samples a second, then simplified

// The portfolio's tokens (src/styles/tokens.css); line and muted are its color-mix values
const THEMES = {
    dark: { bg: '#0a0e14', ink: '#e6eaf0', signal: '#ff7a1a', cold: '#4c8dff', line: '#22262c', muted: '#9b9fa5' },
    light: { bg: '#fafaf9', ink: '#111827', signal: '#4f46e5', cold: '#64748b', line: '#e0e1e2', muted: '#60656e' }
};

const ellipse = (px, py) => Math.hypot((px - W / 2) / 650, (py - H / 2) / 225);
const behindText = (px, py) => ellipse(px, py) < 1;
/** 1 away from the text, 0.16 behind it, with a soft edge: the type stays readable over the field. */
const fade = (px, py) => 0.16 + 0.84 * Math.min(1, Math.max(0, (ellipse(px, py) - 0.8) / 0.35));

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

/** The site's simulation, frame by frame: two sweeps a frame, arrows easing toward the new decision. */
function simulate(wall) {
    const V = new Float32Array(cols * rows);
    const angle = new Float64Array(cols * rows);
    let goal = { x: 0, y: 0 };
    const frames = Math.round(LOOP * FPS);
    // The site's wander, wider so that the reward circles the text, with a whole ratio so that the path closes
    const setGoal = (frame) => {
        const t = (2 * Math.PI * frame) / frames;
        const x = Math.max(0, Math.min(cols - 1, Math.floor((W * (0.5 + 0.43 * Math.sin(t))) / CELL)));
        const y = Math.max(0, Math.min(rows - 1, Math.floor((H * (0.5 + 0.4 * Math.sin(2 * t))) / CELL)));
        if (!wall[y * cols + x]) goal = { x, y };
    };
    const sweep = () => {
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
                if (best > 0) {
                    const target = Math.atan2(by, bx);
                    angle[i] += 0.25 * Math.atan2(Math.sin(target - angle[i]), Math.cos(target - angle[i]));
                }
            }
    };
    // One full loop to settle, so that the recorded one ends where it starts
    for (let f = 0; f < frames; f++) {
        setGoal(f);
        sweep();
        sweep();
    }
    const samples = [];
    for (let f = 0; f < frames; f++) {
        setGoal(f);
        sweep();
        sweep();
        if (f % SAMPLE_EVERY === 0)
            samples.push({ t: f / frames, V: V.slice(), angle: angle.slice(), goal: { ...goal } });
    }
    return samples;
}

/** Keeps only the points a straight line between them would miss by more than `tolerance` (Ramer-Douglas-Peucker). */
function simplify(points, tolerance) {
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
        const [a, b] = stack.pop();
        let worst = 0;
        let index = -1;
        for (let i = a + 1; i < b; i++) {
            const ratio = (points[i][0] - points[a][0]) / (points[b][0] - points[a][0]);
            const gap = Math.abs(points[i][1] - (points[a][1] + ratio * (points[b][1] - points[a][1])));
            if (gap > worst) {
                worst = gap;
                index = i;
            }
        }
        if (worst > tolerance) {
            keep[index] = 1;
            stack.push([a, index], [index, b]);
        }
    }
    return points.filter((_, i) => keep[i]);
}

const pct = (t) => `${Math.round(t * 1000) / 10}%`;
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => String(Math.round(v * 100) / 100).replace(/^0\./, '.');

function field(wall, samples, theme) {
    const css = [];
    const arrows = [];
    for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
            const i = y * cols + x;
            if (wall[i]) continue;
            const cx = x * CELL + CELL / 2;
            const cy = y * CELL + CELL / 2;
            const dim = fade(cx, cy);
            // Unwrapped, so that CSS turns the short way
            let turn = (samples[0].angle[i] * 180) / Math.PI;
            const rotation = samples.map((s, k) => {
                if (k) {
                    const next = (s.angle[i] * 180) / Math.PI;
                    turn += ((((next - turn) % 360) + 540) % 360) - 180;
                }
                return [s.t, turn];
            });
            rotation.push([1, rotation[0][1] + Math.round((turn - rotation[0][1]) / 360) * 360]);
            const alpha = samples.map((s) => [s.t, (0.25 + 0.75 * Math.sqrt(s.V[i])) * dim]);
            alpha.push([1, alpha[0][1]]);
            const hot = samples.map((s) => s.V[i] > HOT);
            const id = `a${i}`;
            const spin = simplify(rotation, 5);
            const glow = simplify(alpha, 0.07);
            const names = [];
            if (spin.length > 2) {
                css.push(`@keyframes r${i}{${spin.map(([t, v]) => `${pct(t)}{rotate:${r1(v)}deg}`).join('')}}`);
                names.push(`r${i}`);
            }
            if (glow.length > 2) {
                css.push(`@keyframes o${i}{${glow.map(([t, v]) => `${pct(t)}{opacity:${r2(v)}}`).join('')}}`);
                names.push(`o${i}`);
            }
            const flips = [];
            hot.forEach((h, k) => {
                if (k === 0 || h !== hot[k - 1]) flips.push([samples[k].t, h]);
            });
            if (flips.length > 1) {
                const color = (h) => (h ? 'var(--s)' : 'var(--c)');
                css.push(`@keyframes c${i}{${flips.map(([t, h]) => `${pct(t)}{stroke:${color(h)}}`).join('')}100%{stroke:${color(hot[hot.length - 1])}}}`);
                names.push(`c${i}`);
            }
            // The reward cell has no arrow, as on the site: the dot would not fully cover it
            const covered = samples.map((s) => s.goal.x === x && s.goal.y === y);
            if (covered.some(Boolean)) {
                const changes = [];
                covered.forEach((c, k) => {
                    if (k === 0 || c !== covered[k - 1]) changes.push([samples[k].t, c]);
                });
                const seen = (c) => `visibility:${c ? 'hidden' : 'visible'}`;
                css.push(`@keyframes h${i}{${changes.map(([t, c]) => `${pct(t)}{${seen(c)}}`).join('')}100%{${seen(covered[covered.length - 1])}}}`);
                names.push(`h${i}`);
            }
            const steps = names.map((n) => (n[0] === 'c' || n[0] === 'h' ? 'step-end' : 'linear')).join(',');
            const motion = names.length ? `animation-name:${names.join(',')};animation-timing-function:${steps};` : '';
            arrows.push(
                `<g transform="translate(${cx} ${cy})"><path class="a" d="M-9 0H9M4.5-4.5 9 0 4.5 4.5" style="${motion}rotate:${r1(rotation[0][1])}deg;opacity:${r2(alpha[0][1])};stroke:${hot[0] ? 'var(--s)' : 'var(--c)'}${covered[0] ? ';visibility:hidden' : ''}"/></g>`
            );
        }
    return { css: css.join(''), arrows: arrows.join('') };
}

function goalDot(samples) {
    const stops = [];
    samples.forEach((s, k) => {
        const p = samples[k - 1]?.goal;
        if (!p || p.x !== s.goal.x || p.y !== s.goal.y) stops.push(s);
    });
    const at = (s) => {
        const x = s.goal.x * CELL + CELL / 2;
        const y = s.goal.y * CELL + CELL / 2;
        // Dimmed only while it crosses the text block
        const overText = Math.abs(x - W / 2) < 420 && y > H / 2 - 175 && y < H / 2 + 140;
        return `translate:${x}px ${y}px;opacity:${overText ? 0.25 : 1}`;
    };
    return `@keyframes g{${stops.map((s) => `${pct(s.t)}{${at(s)}}`).join('')}100%{${at(samples[samples.length - 1])}}}`;
}

/** Each ending rises from under the mask, stays, then drops back: every 4.2 s, 450 ms each way, with the site's easing. */
function endingFrames() {
    const p = (seconds) => `${Math.round((seconds / TEXT_LOOP) * 10000) / 100}%`;
    const ease = 'animation-timing-function:cubic-bezier(.23,1,.32,1)';
    const hidden = `translate:0 ${DROP}px`;
    const shown = 'translate:0 0';
    return ENDINGS.map((_, k) => {
        const leave = (k + 1) * STEP - 2 * SLIDE;
        const gone = (k + 1) * STEP - SLIDE;
        if (k === 0)
            return `@keyframes e0{0%,${p(leave)}{${shown};${ease}}${p(gone)},${p(TEXT_LOOP - SLIDE)}{${hidden};${ease}}100%{${shown}}}`;
        return `@keyframes e${k}{0%,${p(k * STEP - SLIDE)}{${hidden};${ease}}${p(k * STEP)},${p(leave)}{${shown};${ease}}${p(gone)},100%{${hidden}}}`;
    }).join('');
}

const font = (file) => readFileSync(join(portfolio, 'node_modules', file)).toString('base64');
const SANS = font('@fontsource-variable/schibsted-grotesk/files/schibsted-grotesk-latin-wght-normal.woff2');
const MONO = font('@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2');

const wall = walls();
const samples = simulate(wall);

function svg(theme) {
    const blocks = [];
    for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++)
            if (wall[y * cols + x]) blocks.push(`M${x * CELL + 4} ${y * CELL + 4}h${CELL - 8}v${CELL - 8}h-${CELL - 8}z`);
    const { css, arrows } = field(wall, samples, theme);
    const lineY = H / 2 + 62;
    const first = samples[0].goal;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t">
<title id="t">Nexlein. AI &amp; Full-Stack Developer at Epitech. I build AI agents and web apps, and I deploy them.</title>
<style>
@font-face{font-family:S;src:url(data:font/woff2;base64,${SANS}) format("woff2");font-weight:100 900}
@font-face{font-family:M;src:url(data:font/woff2;base64,${MONO}) format("woff2");font-weight:500}
svg{--s:${theme.signal};--c:${theme.cold}}
text{text-anchor:middle}
.name{font:800 128px S,system-ui,sans-serif;letter-spacing:-.035em}
.end{font:700 76px S,system-ui,sans-serif;letter-spacing:-.03em;animation:${TEXT_LOOP}s linear infinite}
.role{font:500 27px M,ui-monospace,monospace}
.sub{font:400 30px S,system-ui,sans-serif}
.a{fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;animation-duration:${LOOP}s;animation-iteration-count:infinite}
.dot{animation:g ${LOOP}s step-end infinite}
${goalDot(samples)}
${endingFrames()}
${css}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<defs>
<clipPath id="c"><rect width="${W}" height="${H}" rx="20"/></clipPath>
<clipPath id="m"><rect x="0" y="${lineY - 74}" width="${W}" height="96"/></clipPath>
</defs>
<g clip-path="url(#c)">
<rect width="${W}" height="${H}" fill="${theme.bg}"/>
<path d="${blocks.join('')}" fill="${theme.line}"/>
${arrows}
<circle class="dot" r="9" fill="${theme.signal}" style="translate:${first.x * CELL + CELL / 2}px ${first.y * CELL + CELL / 2}px"/>
<text class="role" x="${W / 2}" y="${H / 2 - 148}" fill="${theme.signal}">AI &amp; Full-Stack Developer · Epitech</text>
<text class="name" x="${W / 2}" y="${H / 2 - 28}" fill="${theme.ink}">Nexlein.</text>
<g clip-path="url(#m)">${ENDINGS.map(
        (text, k) =>
            `<text class="end" x="${W / 2}" y="${lineY}" fill="${theme.muted}" style="animation-name:e${k};translate:0 ${k ? DROP : 0}px">${text}</text>`
    ).join('')}</g>
<text class="sub" x="${W / 2}" y="${H / 2 + 128}" fill="${theme.muted}">I build AI agents and web apps, and I deploy them.</text>
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="19.5" fill="none" stroke="${theme.line}"/>
</svg>
`;
}

for (const [name, theme] of Object.entries(THEMES)) {
    const file = join(out, `hero-${name}.svg`);
    writeFileSync(file, svg(theme));
    console.log(file.split('/').pop(), Math.round(readFileSync(file).length / 1024), 'KB');
}
