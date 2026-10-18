const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { parse, decodeXmlEntities, PPTX_MIME } = require('../src/ingest/parseDocument');

function slideXml(runs) {
  const body = runs.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>`
    + `<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`;
}

async function buildPptx() {
  const zip = new JSZip();
  // Author slide10 before slide2 so lexical order would be wrong; the parser
  // must sort by the integer in the filename (2 then 10).
  zip.file('ppt/slides/slide10.xml', slideXml(['Tenth slide', 'A &amp; B &#65;']));
  zip.file('ppt/slides/slide2.xml', slideXml(['Second slide', '&#x42;eta']));
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('decodeXmlEntities handles named and numeric (decimal + hex) entities', () => {
  assert.equal(decodeXmlEntities('A &amp; B'), 'A & B');
  assert.equal(decodeXmlEntities('&#65;&#x42;'), 'AB');
  assert.equal(decodeXmlEntities('&lt;tag&gt; &quot;q&quot; &apos;a&apos;'), '<tag> "q" \'a\'');
});

test('PPTX: slides sort numerically and entities decode', async () => {
  const buffer = await buildPptx();
  const { segments, pageCount } = await parse(PPTX_MIME, buffer);

  assert.equal(pageCount, 2);
  assert.equal(segments.length, 2);

  // slide2 sorts before slide10.
  assert.equal(segments[0].page, 1);
  assert.equal(segments[1].page, 2);
  assert.equal(segments[0].text, 'Second slide Beta');
  assert.equal(segments[1].text, 'Tenth slide A & B A');
});

test('parse rejects an unsupported MIME type with 400 UNSUPPORTED_TYPE', async () => {
  await assert.rejects(
    () => parse('image/png', Buffer.from('x')),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, 'UNSUPPORTED_TYPE');
      return true;
    },
  );
});
