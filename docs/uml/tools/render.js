#!/usr/bin/env node
// Renders the UML sources in docs/uml to PNG with headless Chromium:
//   - *.drawio  -> <name>.png       (mxGraph renderer)
//   - *.md      -> <name>-<n>.png   (every ```mermaid block, Mermaid renderer)
//
// Needs Playwright plus the two renderers, installed outside the repo:
//   mkdir -p /tmp/uml-render && cd /tmp/uml-render \
//     && npm init -y && npm i mermaid@11.4.1 mxgraph@4.2.2 playwright
//   UML_RENDER_MODULES=/tmp/uml-render/node_modules node docs/uml/tools/render.js [files...]
// Output goes to docs/uml/png/ (override with UML_RENDER_OUT).
const fs = require('fs');
const path = require('path');

const modules = process.env.UML_RENDER_MODULES || path.join(process.cwd(), 'node_modules');
// eslint-disable-next-line import/no-dynamic-require
const { chromium } = require(require.resolve('playwright', { paths: [modules, process.cwd()] }));

const umlDir = path.join(__dirname, '..');
const outDir = process.env.UML_RENDER_OUT || path.join(umlDir, 'png');

async function renderDrawio(page, file, out) {
  const xml = fs.readFileSync(file, 'utf8');
  await page.setContent('<!doctype html><html><body style="margin:0;background:#fff"><div id="g"></div></body></html>');
  await page.evaluate(() => {
    window.mxBasePath = '';
    window.mxLoadResources = false;
    window.mxLoadStylesheets = false;
  });
  await page.addScriptTag({ path: path.join(modules, 'mxgraph/javascript/mxClient.min.js') });
  const size = await page.evaluate((src) => {
    /* global mxGraph, mxCodec, mxUtils, mxConstants, mxShape, mxCellRenderer */
    const doc = mxUtils.parseXml(src);
    const model = doc.getElementsByTagName('mxGraphModel')[0];
    const container = document.getElementById('g');
    const graph = new mxGraph(container);
    graph.setHtmlLabels(true);
    graph.foldingEnabled = false;
    graph.isHtmlLabel = () => true;
    mxConstants.DEFAULT_FONTFAMILY = 'Helvetica';
    // draw.io's umlActor (stick figure) is not part of core mxGraph.
    function UmlActor() { mxShape.call(this); }
    mxUtils.extend(UmlActor, mxShape);
    UmlActor.prototype.paintVertexShape = function paint(c, x, y, w, h) {
      c.ellipse(x + w / 4, y, w / 2, h / 4);
      c.fillAndStroke();
      c.begin();
      c.moveTo(x + w / 2, y + h / 4); c.lineTo(x + w / 2, y + (2 * h) / 3);
      c.moveTo(x + w / 2, y + h / 3); c.lineTo(x, y + h / 3);
      c.moveTo(x + w / 2, y + h / 3); c.lineTo(x + w, y + h / 3);
      c.moveTo(x + w / 2, y + (2 * h) / 3); c.lineTo(x, y + h);
      c.moveTo(x + w / 2, y + (2 * h) / 3); c.lineTo(x + w, y + h);
      c.end();
      c.stroke();
    };
    mxCellRenderer.registerShape('umlActor', UmlActor);
    // draw.io's cube (UML node 3D box).
    function Cube() { mxShape.call(this); }
    mxUtils.extend(Cube, mxShape);
    Cube.prototype.paintVertexShape = function paint(c, x, y, w, h) {
      const s = Math.min(w, h, Number(mxUtils.getValue(this.style, 'size', 12)));
      c.begin();
      c.moveTo(x, y + s); c.lineTo(x + s, y); c.lineTo(x + w, y); c.lineTo(x + w, y + h - s);
      c.lineTo(x + w - s, y + h); c.lineTo(x, y + h); c.close();
      c.fillAndStroke();
      c.begin();
      c.moveTo(x, y + s); c.lineTo(x + w - s, y + s); c.lineTo(x + w, y);
      c.moveTo(x + w - s, y + s); c.lineTo(x + w - s, y + h);
      c.stroke();
    };
    mxCellRenderer.registerShape('cube', Cube);
    new mxCodec(model.ownerDocument).decode(model, graph.getModel());
    const b = graph.getGraphBounds();
    graph.view.setTranslate(-b.x + 20, -b.y + 20);
    container.style.width = `${b.width + 40}px`;
    container.style.height = `${b.height + 40}px`;
    return { w: Math.ceil(b.width + 40), h: Math.ceil(b.height + 40) };
  }, xml);
  await page.setViewportSize({ width: size.w, height: size.h });
  await page.locator('#g').screenshot({ path: out });
}

async function renderMermaid(page, code, out) {
  await page.setViewportSize({ width: 2400, height: 1200 });
  await page.setContent('<!doctype html><html><body style="margin:0;background:#fff"><div id="m"></div></body></html>');
  await page.addScriptTag({ path: path.join(modules, 'mermaid/dist/mermaid.min.js') });
  const err = await page.evaluate(async (src) => {
    /* global mermaid */
    mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose', maxTextSize: 200000 });
    try {
      const { svg } = await mermaid.render('d', src);
      document.getElementById('m').innerHTML = svg;
      const el = document.querySelector('#m svg');
      el.style.maxWidth = 'none';
      el.style.background = '#fff';
      el.style.padding = '16px';
      return null;
    } catch (e) {
      return String(e && e.message ? e.message : e);
    }
  }, code);
  if (err) throw new Error(`${out}: ${err}`);
  const box = await page.locator('#m svg').boundingBox();
  await page.setViewportSize({ width: Math.ceil(box.width) + 40, height: Math.ceil(box.height) + 40 });
  await page.locator('#m svg').screenshot({ path: out });
}

async function main() {
  const args = process.argv.slice(2);
  const files = args.length ? args : fs.readdirSync(umlDir)
    .filter((f) => f.endsWith('.drawio') || (f.endsWith('.md') && f !== 'README.md'))
    .map((f) => path.join(umlDir, f));
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  for (const file of files) {
    const base = path.basename(file).replace(/\.(drawio|md)$/, '');
    if (file.endsWith('.drawio')) {
      const out = path.join(outDir, `${base}.png`);
      await renderDrawio(page, file, out);
      console.log('rendered', out);
    } else {
      const src = fs.readFileSync(file, 'utf8');
      const blocks = [...src.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]);
      for (let i = 0; i < blocks.length; i += 1) {
        const out = path.join(outDir, `${base}-${i + 1}.png`);
        await renderMermaid(page, blocks[i], out);
        console.log('rendered', out);
      }
    }
  }
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
