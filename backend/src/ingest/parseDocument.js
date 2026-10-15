// Single document-parsing seam. parse(mimeType, buffer) returns the extracted
// text as an array of segments plus a page/slide count:
//   { segments: [{ page: number|null, text: string }], pageCount: number|null }
//
// - PDF  (pdfjs-dist legacy build): one segment per page, pageCount = pages.
// - DOCX (mammoth):                  one segment, page=null, pageCount=null.
// - PPTX (jszip):                    one segment per slide, pageCount = slides.
//
// Mock mode never short-circuits here: parsing is pure CPU work on an in-memory
// buffer with no network/AWS calls, so the same code runs offline.

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

function unsupportedType(mimeType) {
  const err = new Error(`Unsupported document type: ${mimeType || 'unknown'}`);
  err.statusCode = 400;
  err.code = 'UNSUPPORTED_TYPE';
  return err;
}

async function parsePdf(buffer) {
  // pdfjs-dist ships ESM-only; load it dynamically from a CommonJS module.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const segments = [];
  for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
    const page = await doc.getPage(pageNo);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item) => (item && typeof item.str === 'string' ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    segments.push({ page: pageNo, text });
  }
  const pageCount = doc.numPages;
  await doc.cleanup();
  return { segments, pageCount };
}

async function parseDocx(buffer) {
  const mammoth = require('mammoth');
  const { value } = await mammoth.extractRawText({ buffer });
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return { segments: [{ page: null, text }], pageCount: null };
}

// Decode XML entities (named + numeric decimal/hex) found in <a:t> text runs.
function decodeXmlEntities(text) {
  return String(text)
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// Extract the integer index embedded in a slide filename
// (ppt/slides/slide10.xml -> 10) so we sort numerically, not lexically.
function slideIndex(name) {
  const match = /slide(\d+)\.xml$/i.exec(name);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

async function parsePptx(buffer) {
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(buffer);
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => slideIndex(a) - slideIndex(b));

  const segments = [];
  for (let i = 0; i < slideNames.length; i += 1) {
    const xml = await zip.files[slideNames[i]].async('string');
    // Concatenate the inner text of every <a:t> run in document order.
    const runs = [];
    const re = /<a:t>([\s\S]*?)<\/a:t>/g;
    let m = re.exec(xml);
    while (m) {
      runs.push(decodeXmlEntities(m[1]));
      m = re.exec(xml);
    }
    const text = runs.join(' ').replace(/\s+/g, ' ').trim();
    segments.push({ page: i + 1, text });
  }
  return { segments, pageCount: slideNames.length };
}

async function parse(mimeType, buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('parse(mimeType, buffer) requires a Buffer.');
  }
  switch (mimeType) {
    case PDF_MIME:
      return parsePdf(buffer);
    case DOCX_MIME:
      return parseDocx(buffer);
    case PPTX_MIME:
      return parsePptx(buffer);
    default:
      throw unsupportedType(mimeType);
  }
}

module.exports = {
  parse,
  decodeXmlEntities,
  PDF_MIME,
  DOCX_MIME,
  PPTX_MIME,
};
