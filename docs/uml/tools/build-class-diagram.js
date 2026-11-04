#!/usr/bin/env node
// Builds docs/uml/class-diagram.drawio from class-model.js.
// Usage: node docs/uml/tools/build-class-diagram.js [outFile]
const fs = require('fs');
const path = require('path');
const {
  W, packages, classes, enums, associations,
} = require('./class-model');

const LINE = 15; // px per attribute line
const HEAD = 30; // name compartment

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
// Label HTML is itself stored in an XML attribute: escape the text for HTML,
// then the whole HTML for XML.
const html = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function classHeight(lines) {
  return HEAD + 8 + lines * LINE + 6;
}

function classLabel(title, stereotype, lines, note) {
  const head = `<p style="margin:0px;margin-top:4px;text-align:center;">${stereotype ? `<i>«${html(stereotype)}»</i><br>` : ''}<b>${html(title)}</b></p>`;
  const body = lines.map((l) => `<p style="margin:0px;margin-left:6px;line-height:${LINE}px;">${html(l)}</p>`).join('');
  const foot = note ? `<p style="margin:0px;margin-left:6px;line-height:${LINE}px;color:#666666;"><i>${html(note)}</i></p>` : '';
  return `${head}<hr size="1" style="border-style:solid;">${body}${foot}`;
}

const cells = [];
const boxes = {};
let n = 0;
const nid = (p) => `${p}${++n}`;

const BASE_CLASS = 'verticalAlign=top;align=left;overflow=fill;html=1;whiteSpace=wrap;fontSize=11;fontFamily=Helvetica;rounded=0;fontColor=#000000;';

// Packages (UML package = tab + body).
for (const p of packages) {
  cells.push(`<mxCell id="${p.id}_tab" value="${esc(`<b>${html(p.name)}</b>`)}" style="html=1;fontSize=12;align=left;spacingLeft=8;fillColor=#f5f5f5;strokeColor=#999999;" vertex="1" parent="1"><mxGeometry x="${p.x}" y="${p.y - 0}" width="${Math.min(380, p.name.length * 7 + 40)}" height="22" as="geometry"/></mxCell>`);
  cells.push(`<mxCell id="${p.id}" value="" style="html=1;fillColor=#fcfcfc;strokeColor=#999999;" vertex="1" parent="1"><mxGeometry x="${p.x}" y="${p.y + 22}" width="${p.w}" height="${p.h - 22}" as="geometry"/></mxCell>`);
}

// Classes.
for (const c of classes) {
  const lines = c.attrs.length + (c.note ? 1 : 0);
  const h = classHeight(lines) + (c.stereotype ? LINE : 0);
  const w = c.w || W;
  boxes[c.id] = { x: c.x, y: c.y, w, h };
  const title = c.table ? `${c.id}` : c.id;
  const stereo = c.stereotype || (c.table ? `table ${c.table}` : null);
  const fill = c.table ? '#ffffff' : '#fff8e1';
  cells.push(`<mxCell id="${c.id}" value="${esc(classLabel(title, stereo, c.attrs, c.note))}" style="${BASE_CLASS}fillColor=${fill};strokeColor=#333333;" vertex="1" parent="1"><mxGeometry x="${c.x}" y="${c.y}" width="${w}" height="${h}" as="geometry"/></mxCell>`);
}

// Enumerations, laid out in the enum package.
{
  const pkg = packages.find((p) => p.id === 'pkg_enums');
  const ew = 200;
  const gap = 14;
  let x = pkg.x + 20;
  let y = pkg.y + 40;
  let rowH = 0;
  for (const [name, values] of enums) {
    const isDatatype = name.includes('«datatype»');
    const title = name.replace(' «datatype»', '');
    const w = ew;
    const lines = values;
    const h = classHeight(lines.length) + LINE;
    if (x + w > pkg.x + pkg.w - 10) {
      x = pkg.x + 20;
      y += rowH + gap;
      rowH = 0;
    }
    const id = `enum_${title}`;
    cells.push(`<mxCell id="${id}" value="${esc(classLabel(title, isDatatype ? 'datatype' : 'enumeration', lines))}" style="${BASE_CLASS}fillColor=#eef4ff;strokeColor=#4a6fa5;" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`);
    x += w + gap;
    rowH = Math.max(rowH, h);
  }
}

// Associations.
for (const a of associations) {
  const id = nid('e');
  const pts = (a.via || []).map(([x, y]) => `<mxPoint x="${x}" y="${y}"/>`).join('');
  const anchors = ['exitX', 'exitY', 'entryX', 'entryY']
    .filter((k) => a[k] !== undefined).map((k) => `${k}=${a[k]};`).join('');
  let style;
  let value = '';
  let source = a.from;
  let target = a.to;
  if (a.kind === 'composition') {
    style = 'endArrow=none;startArrow=diamondThin;startFill=1;startSize=14;';
  } else if (a.kind === 'dependency') {
    style = 'endArrow=open;endSize=10;dashed=1;startArrow=none;';
    value = a.label || '';
    if (a.reverse) { source = a.to; target = a.from; }
  } else {
    style = 'endArrow=none;startArrow=none;';
  }
  let anchorStyle = anchors;
  if (a.kind === 'dependency' && a.reverse) {
    anchorStyle = `exitX=${a.entryX};exitY=${a.entryY};entryX=${a.exitX};entryY=${a.exitY};`;
  }
  cells.push(`<mxCell id="${id}" value="${esc(value)}" style="${style}html=1;rounded=0;edgeStyle=orthogonalEdgeStyle;fontSize=10;fontColor=#000000;strokeColor=#333333;${anchorStyle}" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry">${pts ? `<Array as="points">${pts}</Array>` : ''}</mxGeometry></mxCell>`);
  const label = (text, x, align) => {
    if (!text) return;
    cells.push(`<mxCell id="${nid('l')}" value="${esc(html(text).replace(/\n/g, '<br>'))}" style="edgeLabel;html=1;resizable=0;fontSize=10;fontColor=#000000;align=${align};verticalAlign=bottom;labelBackgroundColor=#ffffff;" vertex="1" connectable="0" parent="${id}"><mxGeometry x="${x}" relative="1" as="geometry"><mxPoint as="offset"/></mxGeometry></mxCell>`);
  };
  if (a.kind !== 'dependency') {
    label(a.fromMult, -0.92, 'left');
    label(a.toMult, 0.92, 'right');
    label(a.role, 0, 'center');
  }
}

// Legend.
{
  const legend = [
    'Nguồn: backend/db/migrations 001–029, backend/src/domain, backend/src/interview.',
    'Tên thuộc tính = tên cột. [0..1] = cột nullable. {id} = khóa chính.',
    'FK vẽ bằng association; nhãn ở đầu dây là tên cột FK (hoặc bảng nối «…»).',
    '◆ composition = ON DELETE CASCADE từ bảng chủ.',
    'Tham chiếu "ai thực hiện" tới AppUser (created_by, reviewed_by, …) ghi dạng thuộc tính kiểu AppUser.',
    'AI chỉ ghi ai_score; final_score / FINALIZED do giảng viên quyết định (human-in-the-loop).',
  ];
  const h = classHeight(legend.length);
  cells.push(`<mxCell id="legend" value="${esc(classLabel('Chú thích', null, legend))}" style="${BASE_CLASS}shape=note;size=14;fillColor=#fffde7;strokeColor=#b59f3b;" vertex="1" parent="1"><mxGeometry x="310" y="760" width="510" height="${h}" as="geometry"/></mxCell>`);
}

const xml = `<mxfile host="aives-uml-generator">
  <diagram id="aives-class" name="Class Diagram (domain)">
    <mxGraphModel dx="3400" dy="2000" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="3400" pageHeight="2000" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        ${cells.join('\n        ')}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
`;

const out = process.argv[2] || path.join(__dirname, '..', 'class-diagram.drawio');
fs.writeFileSync(out, xml);
console.log(`wrote ${out} (${classes.length} classes, ${enums.length} enums, ${associations.length} associations)`);
