// The site's hero actions as images: a README has no CSS, and each link must stay its own link.
const { chromium } = require(`${process.argv[3]}/node_modules/playwright`);
const fs = require('fs');
const [dir, portfolio] = process.argv.slice(2);
const sans = fs.readFileSync(`${portfolio}/node_modules/@fontsource-variable/schibsted-grotesk/files/schibsted-grotesk-latin-wght-normal.woff2`).toString('base64');
const THEMES = { dark: { ink: '#e6eaf0', bg: '#0a0e14', signal: '#ff7a1a' }, light: { ink: '#111827', bg: '#fafaf9', signal: '#4f46e5' } };
const ITEMS = [['projects', 'See the projects', 'btn'], ['cv', 'CV', 'link'], ['linkedin', 'LinkedIn', 'link'], ['email', 'Email', 'link']];
(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ deviceScaleFactor: 3 });
    for (const [name, t] of Object.entries(THEMES))
        for (const [id, label, kind] of ITEMS) {
            await page.setContent(`<!doctype html><style>
@font-face{font-family:S;src:url(data:font/woff2;base64,${sans}) format("woff2");font-weight:100 900}
html,body{margin:0;background:transparent}
#b{display:inline-flex;align-items:center;height:44px;font:500 16px S;box-sizing:border-box}
.btn{padding:0 24px;border-radius:999px;background:${t.ink};color:${t.bg}}
.link{padding:0 6px;color:${t.signal}}
</style><span id="b" class="${kind}">${label}${kind === 'link' ? '&nbsp;›' : ''}</span>`);
            await page.evaluate(() => document.fonts.ready);
            await page.locator('#b').screenshot({ path: `${dir}/btn-${id}-${name}.png`, omitBackground: true });
        }
    await browser.close();
})();
