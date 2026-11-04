#!/usr/bin/env node
// Builds docs/uml/deployment-diagram.drawio (UML deployment diagram) from the
// production topology in infrastructure/terraform/*.tf (defaults in
// variables.tf) and docker-compose.prod.yml. Region ap-southeast-1, names
// "aives-<env>-*".
const fs = require('fs');
const path = require('path');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const h = (s) => esc(s).replace(/\n/g, '&lt;br&gt;');

const cells = [];
let n = 0;
const nid = (p) => `${p}${++n}`;

const NODE = 'shape=cube;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;darkOpacity=0.05;darkOpacity2=0.1;size=12;verticalAlign=top;align=center;spacingTop=4;fontSize=11;fontColor=#000000;fillColor=#ffffff;strokeColor=#333333;';
const ART = 'html=1;whiteSpace=wrap;fontSize=10;fontColor=#000000;fillColor=#f7f7f7;strokeColor=#666666;align=center;';
const FRAME = 'html=1;dashed=1;fillColor=none;verticalAlign=top;align=left;spacingLeft=8;fontSize=11;fontColor=#000000;strokeColor=#888888;';

function node(id, stereo, name, x, y, w, ht, extra = '') {
  cells.push(`<mxCell id="${id}" value="${h(`«${stereo}»\n`)}&lt;b&gt;${h(name)}&lt;/b&gt;${extra ? `&lt;br&gt;${h(extra)}` : ''}" style="${NODE}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${ht}" as="geometry"/></mxCell>`);
}
function artifact(id, name, x, y, w = 170, ht = 40) {
  cells.push(`<mxCell id="${id}" value="${h('«artifact»\n')}${h(name)}" style="${ART}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${ht}" as="geometry"/></mxCell>`);
}
function frame(id, label, x, y, w, ht) {
  cells.push(`<mxCell id="${id}" value="${h(label)}" style="${FRAME}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${ht}" as="geometry"/></mxCell>`);
}
function link(src, tgt, label, style = '') {
  cells.push(`<mxCell id="${nid('e')}" value="${h(label)}" style="html=1;rounded=0;endArrow=none;fontSize=10;fontColor=#000000;strokeColor=#444444;labelBackgroundColor=#ffffff;${style}" edge="1" parent="1" source="${src}" target="${tgt}"><mxGeometry relative="1" as="geometry"/></mxCell>`);
}
function dep(src, tgt, label, style = '') {
  link(src, tgt, label, `dashed=1;endArrow=open;endSize=10;${style}`);
}

// Frames (not UML nodes; grouping only).
frame('aws', 'AWS account · region ap-southeast-1', 270, 10, 1440, 1100);
frame('vpc', 'VPC 10.30.0.0/16 · 1 public subnet · không NAT · SG :80 chỉ từ CloudFront prefix list', 560, 170, 560, 620);

// Client.
node('browser', 'device', 'Trình duyệt', 20, 340, 220, 150);
artifact('spa', 'React SPA (frontend/dist)', 45, 420);

// Edge.
node('cf', 'executionEnvironment', 'CloudFront distribution', 300, 340, 220, 120, 'CloudFront Function spa_rewrite\n(chỉ behavior S3)');
node('s3web', 'device', 'S3 aives-{env}-web', 300, 560, 220, 100, 'origin mặc định (*), OAC');

// EC2 host.
node('ec2', 'device', 'EC2 t4g.small', 590, 220, 500, 430, 'Amazon Linux 2023 arm64 · IMDSv2 · SSM Session Manager');
node('docker', 'executionEnvironment', 'Docker Engine (docker-compose.prod.yml)', 610, 290, 460, 300);
node('be', 'executionEnvironment', 'container aives-backend', 625, 340, 430, 110, 'Node 20 · :80 → 3000');
artifact('beimg', 'backend image\n(backend/Dockerfile)', 640, 395, 190, 44);
artifact('besrv', 'server.js + JobQueue\n+ Socket.IO /interview', 850, 395, 190, 44);
node('pg', 'executionEnvironment', 'container aives-postgres', 625, 465, 250, 110, 'pgvector/pgvector:pg16');
artifact('pgdb', 'database aives\n(migrations 001–029)', 640, 520, 220, 44);
artifact('cron', 'pg-backup.sh\n(/etc/cron.d, 02:00)', 890, 598, 180, 40);
node('ebs', 'device', 'EBS gp3 10 GB', 625, 690, 250, 80, '/data/postgres · prevent_destroy');

// Managed services.
node('s3mat', 'device', 'S3 aives-{env}-materials', 640, 40, 220, 80, 'S3 API');
node('s3aud', 'device', 'S3 aives-{env}-audio', 880, 40, 220, 80, 'answer audio, tts-cache/{sha256}.wav');
node('s3bak', 'device', 'S3 aives-{env}-backups', 1170, 160, 230, 90, 'pg/ (hết hạn 14 ngày), deploy/');
node('stt', 'executionEnvironment', 'Lambda aives-{env}-stt', 1170, 280, 230, 150, 'x86_64 · 3008 MB · package Image');
artifact('sttimg', 'lambda/stt image\nPhoWhisper-small / Whisper small', 1190, 360, 190, 50);
node('tts', 'executionEnvironment', 'Lambda aives-{env}-tts', 1170, 460, 230, 150, 'x86_64 · 3008 MB · package Image');
artifact('ttsimg', 'lambda/tts image\nKokoro-82M (ONNX)', 1190, 540, 190, 50);
node('bedrock', 'executionEnvironment', 'Amazon Bedrock', 1170, 640, 230, 100, 'InvokeModel: Nova Pro (LLM)\nTitan Embed Text v2 (1024)');
node('ddb', 'executionEnvironment', 'DynamoDB aives-{env}-session-context', 1170, 770, 230, 90, 'PAY_PER_REQUEST · TTL expiresAt');
node('ecrstt', 'device', 'ECR speech-to-text', 1450, 315, 200, 80);
node('ecrtts', 'device', 'ECR text-to-speech', 1450, 495, 200, 80);
node('ssm', 'executionEnvironment', 'SSM Parameter Store', 880, 900, 220, 80, '/aives/{env}/*');
node('ecrbe', 'device', 'ECR backend', 600, 900, 220, 80);
node('iam', 'executionEnvironment', 'IAM role github-deploy (OIDC)', 300, 900, 220, 80);

// Outside AWS.
node('smtp', 'device', 'Gmail SMTP', 1760, 900, 170, 80, 'App Password');
node('gh', 'executionEnvironment', 'GitHub Actions (deploy.yml)', 20, 900, 220, 90, 'Terraform cho hạ tầng');

// Communication paths.
const ORTH = 'edgeStyle=orthogonalEdgeStyle;';
link('browser', 'cf', '«HTTPS»');
link('cf', 's3web', '«HTTPS» default (*)');
link('cf', 'be', '«HTTP :80»\n/api/*, /socket.io/*\nWebSocket, no cache', 'exitX=1;exitY=0.4;entryX=0;entryY=0.5;');
link('be', 'pg', '«TCP 5432» compose network', 'exitX=0.3;exitY=1;entryX=0.4;entryY=0;');
link('pg', 'ebs', 'bind mount', 'exitX=0.5;exitY=1;entryX=0.5;entryY=0;');
link('be', 's3mat', '«HTTPS»', `${ORTH}exitX=0.12;exitY=0;entryX=0.5;entryY=1;`);
link('be', 's3aud', '«HTTPS»', `${ORTH}exitX=0.7;exitY=0;entryX=0.5;entryY=1;`);
link('cron', 's3bak', '«HTTPS» pg_dump', `${ORTH}exitX=1;exitY=0.5;entryX=0;entryY=0.5;`);
link('be', 'stt', '«HTTPS» Invoke', `${ORTH}exitX=1;exitY=0.15;entryX=0;entryY=0.5;`);
link('be', 'tts', '«HTTPS» Invoke', `${ORTH}exitX=1;exitY=0.4;entryX=0;entryY=0.5;`);
link('be', 'bedrock', '«HTTPS»', `${ORTH}exitX=1;exitY=0.65;entryX=0;entryY=0.5;`);
link('be', 'ddb', '«HTTPS»', `${ORTH}exitX=1;exitY=0.9;entryX=0;entryY=0.5;`);
link('be', 'smtp', '«SMTP/TLS»', `${ORTH}exitX=0.95;exitY=1;entryX=0;entryY=0.5;`);
dep('ssm', 'ec2', 'fetch-ssm-env.sh', 'exitX=0.5;exitY=0;entryX=0.8;entryY=1;');
dep('ecrbe', 'ec2', 'docker pull', 'exitX=0.5;exitY=0;entryX=0.2;entryY=1;');
dep('ecrstt', 'stt', 'image');
dep('ecrtts', 'tts', 'image');
dep('gh', 'iam', 'AssumeRoleWithWebIdentity');
dep('gh', 'ecrbe', 'docker push (backend, stt, tts)', `${ORTH}exitX=0.5;exitY=1;entryX=0.5;entryY=1;`);
dep('iam', 'cf', 's3 sync web, s3 cp deploy/,\nSSM SendCommand,\nlambda update-function-code,\ninvalidation', 'exitX=0.5;exitY=0;entryX=0.8;entryY=1;');
dep('s3web', 'spa', '«deploy»', 'exitX=0;exitY=0.5;entryX=0.5;entryY=1;');

const xml = `<mxfile host="aives-uml-generator">
  <diagram id="aives-deployment" name="Deployment Diagram">
    <mxGraphModel dx="1950" dy="1150" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="1950" pageHeight="1150" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        ${cells.join('\n        ')}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
`;
const out = process.argv[2] || path.join(__dirname, '..', 'deployment-diagram.drawio');
fs.writeFileSync(out, xml);
console.log(`wrote ${out}`);
