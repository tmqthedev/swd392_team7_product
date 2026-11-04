#!/usr/bin/env node
// Builds docs/uml/erd.drawio (physical ERD, crow's foot notation) from
// erd-model.js, after checking the model against the migrations: every table
// and column created by backend/db/migrations/*.sql must be in the model and
// vice versa, so the drawing cannot silently drift from the schema.
// Usage: node docs/uml/tools/build-erd.js [outFile]
const fs = require('fs');
const path = require('path');
const { tables, layout, AUDIT_USER_FKS } = require('./erd-model');

// ---- 1. Check against migrations ---------------------------------------
const migDir = path.join(__dirname, '..', '..', '..', 'backend', 'db', 'migrations');
const schema = {};
for (const f of fs.readdirSync(migDir).filter((x) => x.endsWith('.sql')).sort()) {
  const sql = fs.readFileSync(path.join(migDir, f), 'utf8').replace(/--.*$/gm, '');
  for (const m of sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n\);/g)) {
    const cols = schema[m[1]] || (schema[m[1]] = new Set());
    for (const line of m[2].split('\n')) {
      const c = line.trim().match(/^(\w+)\s/);
      if (c && !['CONSTRAINT', 'PRIMARY', 'UNIQUE', 'FOREIGN', 'CHECK'].includes(c[1])) cols.add(c[1]);
    }
  }
  for (const m of sql.matchAll(/ALTER TABLE (\w+)([\s\S]*?);/g)) {
    for (const c of m[2].matchAll(/ADD COLUMN IF NOT EXISTS (\w+)/g)) {
      (schema[m[1]] || (schema[m[1]] = new Set())).add(c[1]);
    }
  }
}
const problems = [];
for (const [t, cols] of Object.entries(schema)) {
  if (!tables[t]) { problems.push(`table ${t} missing from erd-model.js`); continue; }
  const modelCols = new Set(tables[t].cols.map((c) => c[0]));
  for (const c of cols) if (!modelCols.has(c)) problems.push(`${t}.${c} missing from erd-model.js`);
  for (const c of modelCols) if (!cols.has(c)) problems.push(`${t}.${c} is in erd-model.js but not in any migration`);
}
for (const t of Object.keys(tables)) if (!schema[t]) problems.push(`table ${t} is in erd-model.js but not in any migration`);
if (problems.length) {
  console.error(`ERD model does not match the migrations:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

// ---- 2. Layout -----------------------------------------------------------
const W = 420;
const HEAD = 28;
const ROW = 18;
const GAP = 46;
const box = {};
const COL_STEP = W + 190;
Object.values(layout).forEach((c, i) => { c.x = 60 + i * COL_STEP; });
for (const { x, order } of Object.values(layout)) {
  let y = 20;
  for (const t of order) {
    const def = tables[t];
    const h = HEAD + def.cols.length * ROW + (def.note ? ROW : 0) + 6;
    box[t] = { x, y, w: W, h };
    y += h + GAP;
  }
}
for (const t of Object.keys(tables)) if (!box[t]) throw new Error(`table ${t} has no layout position`);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const html = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function label(name, def) {
  const rows = def.cols.map(([col, type, flags, ref, note]) => {
    const keys = flags.split(' ').filter((f) => ['PK', 'FK', 'UK'].includes(f)).join(',');
    const nn = flags.includes('PK') || flags.includes('NN');
    const colName = flags.includes('PK') ? `<u>${html(col)}</u>` : html(col);
    const right = [ref ? `→ ${ref}` : '', note || ''].filter(Boolean).join(' · ');
    return `<tr style="height:${ROW}px"><td style="color:#555">${keys}</td>`
      + `<td style="${nn ? 'font-weight:bold;' : ''}">${colName}</td>`
      + `<td style="color:#333">${html(type)}${nn && !flags.includes('PK') ? ' NN' : ''}</td>`
      + `<td style="color:#777;font-size:9px;overflow:hidden;text-overflow:ellipsis">${html(right)}</td></tr>`;
  }).join('');
  const note = def.note ? `<tr style="height:${ROW}px"><td></td><td colspan="3" style="color:#777;font-style:italic">${html(def.note)}</td></tr>` : '';
  return `<div style="background:#dfe8f5;height:${HEAD - 2}px;line-height:${HEAD - 2}px;text-align:center;font-weight:bold;border-bottom:1px solid #4a6fa5">${html(name)}</div>`
    + `<table style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:10px;margin-top:2px;white-space:nowrap" cellpadding="0" cellspacing="0"><colgroup><col style="width:34px"><col style="width:168px"><col style="width:112px"><col></colgroup>${rows}${note}</table>`;
}

const cells = [];
for (const [t, def] of Object.entries(tables)) {
  const b = box[t];
  cells.push(`<mxCell id="t_${t}" value="${esc(label(t, def))}" style="verticalAlign=top;align=left;overflow=fill;html=1;whiteSpace=wrap;fontSize=10;fontFamily=Helvetica;fontColor=#000000;fillColor=#ffffff;strokeColor=#4a6fa5;spacingLeft=4;spacingRight=4;" vertex="1" parent="1"><mxGeometry x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" as="geometry"/></mxCell>`);
}

// ---- 3. Relationships (crow's foot) --------------------------------------
// Child end at the FK row, parent end at the parent's PK row. Edges between
// adjacent layout columns run through the gap between them; edges that would
// cross a column go up to a lane above all tables, so no line crosses a table.
const colKeys = Object.keys(layout);
const colIdx = {};
for (const [k, { order }] of Object.entries(layout)) for (const t of order) colIdx[t] = colKeys.indexOf(k);
const gapSlots = {};
const slot = (gap) => { gapSlots[gap] = (gapSlots[gap] || 0) + 1; return gapSlots[gap]; };
const STEP = 7;
let lane = 0;
let n = 0;
const rowAbs = (t, idx) => box[t].y + HEAD + idx * ROW + ROW / 2;
const rels = [];
for (const [t, def] of Object.entries(tables)) {
  def.cols.forEach(([col, , flags, ref], idx) => {
    if (ref && !AUDIT_USER_FKS.has(`${t}.${col}`)) rels.push({ t, idx, flags, ref });
  });
}
for (const { t, idx, flags, ref } of rels) {
  const ci = colIdx[t]; const pi = colIdx[ref];
  const child = box[t]; const parent = box[ref];
  const yc = rowAbs(t, idx); const yp = rowAbs(ref, 0);
  const pts = [];
  let exitX; let entryX;
  // gap g lies between layout column g-1 and g; gap 0 is left of column 0.
  const gapX = (g, k) => (g === 0 ? box[layout[colKeys[0]].order[0]].x - 12 - k * STEP
    : layout[colKeys[g]].x - 14 - k * STEP);
  if (ci === pi) {
    exitX = 0; entryX = 0;
    const x = gapX(ci, slot(ci));
    pts.push([x, yc], [x, yp]);
  } else {
    const right = pi > ci;
    exitX = right ? 1 : 0; entryX = right ? 0 : 1;
    const gChild = right ? ci + 1 : ci;
    const gParent = right ? pi : pi + 1;
    if (gChild === gParent) {
      const x = gapX(gChild, slot(gChild));
      pts.push([x, yc], [x, yp]);
    } else {
      lane += 1;
      const ly = 10 - lane * STEP;
      const x1 = gapX(gChild, slot(gChild));
      const x2 = gapX(gParent, slot(gParent));
      pts.push([x1, yc], [x1, ly], [x2, ly], [x2, yp]);
    }
  }
  const childEnd = flags.includes('UK') ? 'ERzeroToOne' : 'ERzeroToMany';
  const parentEnd = flags.includes('NN') ? 'ERmandOne' : 'ERzeroToOne';
  const style = `edgeStyle=none;rounded=0;html=1;strokeColor=#4a6fa5;endArrow=${parentEnd};startArrow=${childEnd};endFill=0;startFill=0;endSize=10;startSize=10;`
    + `exitX=${exitX};exitY=${((yc - child.y) / child.h).toFixed(4)};exitDx=0;exitDy=0;entryX=${entryX};entryY=${((yp - parent.y) / parent.h).toFixed(4)};entryDx=0;entryDy=0;`;
  const points = pts.map(([x, y]) => `<mxPoint x="${x}" y="${y}"/>`).join('');
  cells.push(`<mxCell id="r${++n}" value="" style="${style}" edge="1" parent="1" source="t_${t}" target="t_${ref}"><mxGeometry relative="1" as="geometry"><Array as="points">${points}</Array></mxGeometry></mxCell>`);
}

// ---- 4. Legend -----------------------------------------------------------
const lastA = layout.A.order[layout.A.order.length - 1];
const legendY = box[lastA].y + box[lastA].h + GAP;
const legend = [
  'Nguồn: backend/db/migrations 001–029 (kiểm tra tự động khi sinh sơ đồ).',
  'PK gạch chân · FK → bảng cha · UK = unique · chữ đậm + NN = NOT NULL.',
  'Đầu dây: ┼ bắt buộc một · o┼ không hoặc một · o< không hoặc nhiều.',
  'CASCADE / SET NULL = hành vi ON DELETE của FK.',
  'Các FK "ai thực hiện" tới app_user (created_by, reviewed_by, uploaded_by,',
  'requested_by, scheduled_by, started_by, finalized_by, adjusted_by)',
  'không vẽ dây để sơ đồ dễ đọc; cột vẫn ghi "→ app_user".',
  'Ngoài Postgres: DynamoDB session-context (key interview#<id>, TTL expiresAt).',
];
cells.push(`<mxCell id="legend" value="${esc(`<b>Chú thích</b><br>${legend.map(html).join('<br>')}`)}" style="shape=note;size=14;verticalAlign=top;align=left;html=1;whiteSpace=wrap;fontSize=10;fontColor=#000000;fillColor=#fffde7;strokeColor=#b59f3b;spacing=8;" vertex="1" parent="1"><mxGeometry x="${layout.A.x}" y="${legendY}" width="${W}" height="${30 + legend.length * 14}" as="geometry"/></mxCell>`);

const xml = `<mxfile host="aives-uml-generator">
  <diagram id="aives-erd" name="Physical ERD (Postgres)">
    <mxGraphModel dx="3900" dy="2000" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="3900" pageHeight="2000" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        ${cells.join('\n        ')}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
`;
const out = process.argv[2] || path.join(__dirname, '..', 'erd.drawio');
fs.writeFileSync(out, xml);
console.log(`wrote ${out} (${Object.keys(tables).length} tables, ${n} relationships; model matches migrations)`);
