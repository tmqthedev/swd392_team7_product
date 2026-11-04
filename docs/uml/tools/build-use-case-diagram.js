#!/usr/bin/env node
// Builds docs/uml/use-case-diagram.drawio. Actors and use cases follow the
// role guards in backend/src/routes/*.js (requireRole) and backend/src/app.js:
//   /api/admin/*                      ADMIN
//   /api/exam-sessions, rubric/question writes   LECTURER
//   /api/topics, /api/materials, /api/question-generation-jobs,
//   question/rubric reads, grading routes          LECTURER + ADMIN
//   /api/interviews, /api/me/*        STUDENT
//   /api/auth/*                       any account
const fs = require('fs');
const path = require('path');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const actors = [
  { id: 'User', name: 'Người dùng\n(tài khoản bất kỳ)', x: 30, y: 40, abstract: true },
  { id: 'Staff', name: 'Cán bộ\n(LECTURER hoặc ADMIN)', x: 30, y: 700, abstract: true },
  { id: 'Admin', name: 'Admin', x: 170, y: 270 },
  { id: 'Lecturer', name: 'Lecturer', x: 170, y: 560 },
  { id: 'Student', name: 'Student', x: 170, y: 1090 },
  { id: 'SMTP', name: '«system»\nGmail SMTP', x: 1250, y: 60 },
  { id: 'Bedrock', name: '«system»\nAmazon Bedrock\n(Nova Pro, Titan Embed v2)', x: 1250, y: 680 },
  { id: 'STT', name: '«system»\nLambda STT\n(PhoWhisper / Whisper)', x: 1250, y: 1010 },
  { id: 'TTS', name: '«system»\nLambda TTS (Kokoro)', x: 1250, y: 1150 },
];

const C1 = 360; const C2 = 620; const C3 = 880;
const useCases = [
  ['login', 'Đăng nhập / đăng xuất', C1, 40],
  ['forgot', 'Quên & đặt lại mật khẩu', C2, 40],
  ['setpw', 'Đặt mật khẩu lần đầu (link email)', C2, 110],
  ['changepw', 'Đổi mật khẩu', C1, 110],
  ['email', 'Gửi email', C3, 75],
  ['users', 'Quản lý người dùng (tạo, import Excel, vai trò, khoá, xoá mềm)', C1, 210],
  ['subjects', 'Quản lý môn học (lưu trữ, phân công GV / SV)', C1, 290],
  ['audit', 'Xem nhật ký quản trị', C1, 370],
  ['adminExam', 'Tạo / sửa / xoá kỳ thi (admin)', C2, 210],
  ['start', 'Khởi động & làm nóng kỳ thi', C2, 290],
  ['prepare', 'Tạo sẵn audio câu hỏi', C3, 290],
  ['rubric', 'Quản lý rubric (tiêu chí, mức điểm, clone)', C1, 470],
  ['question', 'Tạo / sửa / import câu hỏi', C1, 545],
  ['review', 'Duyệt câu hỏi (approve / reject / batch)', C1, 620],
  ['exam', 'Tạo & lên lịch kỳ thi (roster, examiner)', C1, 695],
  ['progress', 'Xem tiến độ môn (dashboard)', C1, 770],
  ['topic', 'Quản lý topic', C2, 470],
  ['material', 'Tải tài liệu môn học', C2, 545],
  ['gen', 'Sinh câu hỏi bằng AI (RAG)', C2, 620],
  ['close', 'Đóng kỳ thi', C2, 695],
  ['results', 'Xem kết quả, transcript, nghe audio', C2, 790],
  ['adjust', 'Điều chỉnh điểm tiêu chí (kèm lý do)', C2, 865],
  ['finalize', 'Chốt / mở lại / chấm lại kết quả', C2, 940],
  ['index', 'Lập chỉ mục tài liệu (chunk + embed)', C3, 545],
  ['aiGrade', 'Chấm điểm bằng AI theo rubric', C3, 940],
  ['myExams', 'Xem kỳ thi của tôi', C1, 1050],
  ['myResults', 'Xem kết quả đã chốt', C1, 1150],
  ['viva', 'Thi vấn đáp với AI', C2, 1100],
  ['stt', 'Nhận dạng giọng nói', C3, 1030],
  ['tts', 'Đọc câu hỏi thành giọng nói', C3, 1105],
  ['followup', 'Quyết định câu tiếp / hỏi thêm', C3, 1180],
];

const assoc = [
  ['User', ['login', 'changepw', 'forgot', 'setpw']],
  ['Admin', ['users', 'subjects', 'audit', 'adminExam', 'start']],
  ['Lecturer', ['rubric', 'question', 'review', 'exam', 'progress']],
  ['Staff', ['topic', 'material', 'gen', 'close', 'results', 'adjust', 'finalize']],
  ['Student', ['myExams', 'viva', 'myResults']],
  ['SMTP', ['email']],
  ['Bedrock', ['index', 'gen', 'aiGrade', 'followup']],
  ['STT', ['stt']],
  ['TTS', ['tts', 'prepare']],
];
const includes = [
  ['forgot', 'email'], ['users', 'email'], ['material', 'index'], ['start', 'prepare'],
  ['viva', 'stt'], ['viva', 'tts'], ['viva', 'followup'], ['viva', 'aiGrade'],
];
const extendsRel = [
  ['finalize', 'aiGrade', 'chấm lại'],
];
const generalizations = [['Admin', 'Staff'], ['Lecturer', 'Staff'], ['Staff', 'User'], ['Student', 'User']];

const cells = [];
let n = 0;
const nid = (p) => `${p}${++n}`;
const UW = 220; const UH = 58;

cells.push(`<mxCell id="boundary" value="${esc('<b>AIVES</b>')}" style="html=1;verticalAlign=top;align=center;fillColor=#fcfcfc;strokeColor=#555555;fontSize=14;fontColor=#000000;" vertex="1" parent="1"><mxGeometry x="330" y="0" width="800" height="1270" as="geometry"/></mxCell>`);
for (const [id, name, x, y] of useCases) {
  cells.push(`<mxCell id="uc_${id}" value="${esc(name)}" style="shape=ellipse;perimeter=ellipsePerimeter;whiteSpace=wrap;html=1;fontSize=11;fontColor=#000000;fillColor=#ffffff;strokeColor=#333333;" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${UW}" height="${UH}" as="geometry"/></mxCell>`);
}
for (const a of actors) {
  const label = esc(a.name).replace(/\n/g, '&lt;br&gt;');
  cells.push(`<mxCell id="ac_${a.id}" value="${a.abstract ? `&lt;i&gt;${label}&lt;/i&gt;` : label}" style="shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;fontSize=11;fontColor=#000000;fillColor=#ffffff;strokeColor=#333333;" vertex="1" parent="1"><mxGeometry x="${a.x}" y="${a.y}" width="34" height="64" as="geometry"/></mxCell>`);
}
const edge = (src, tgt, style, value = '') => {
  cells.push(`<mxCell id="${nid('e')}" value="${esc(value).replace(/\n/g, '&lt;br&gt;')}" style="html=1;rounded=0;fontSize=10;fontColor=#000000;strokeColor=#555555;labelBackgroundColor=#ffffff;${style}" edge="1" parent="1" source="${src}" target="${tgt}"><mxGeometry relative="1" as="geometry"/></mxCell>`);
};
for (const [actor, ucs] of assoc) for (const uc of ucs) edge(`ac_${actor}`, `uc_${uc}`, 'endArrow=none;');
for (const [base, inc] of includes) edge(`uc_${base}`, `uc_${inc}`, 'endArrow=open;endSize=10;dashed=1;', '«include»');
for (const [ext, base, cond] of extendsRel) edge(`uc_${ext}`, `uc_${base}`, 'endArrow=open;endSize=10;dashed=1;', `«extend»\n[${cond}]`);
for (const [child, parent] of generalizations) edge(`ac_${child}`, `ac_${parent}`, 'endArrow=block;endFill=0;endSize=14;');

const xml = `<mxfile host="aives-uml-generator">
  <diagram id="aives-usecase" name="Use Case Diagram">
    <mxGraphModel dx="1600" dy="1300" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="1600" pageHeight="1300" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        ${cells.join('\n        ')}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
`;
const out = process.argv[2] || path.join(__dirname, '..', 'use-case-diagram.drawio');
fs.writeFileSync(out, xml);
console.log(`wrote ${out}`);
