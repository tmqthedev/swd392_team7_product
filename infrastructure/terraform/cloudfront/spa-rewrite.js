// CloudFront Function (viewer-request) on the default S3 behavior only.
// SPA deep links (/lecturer/exams/123) have no file extension in the last
// path segment, so they are served index.html. Assets (/assets/app.js) pass
// through unchanged. /api/* and /socket.io/* never reach this function, so
// API 403/404 JSON responses are not rewritten.
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);

  if (lastSegment.indexOf('.') === -1) {
    request.uri = '/index.html';
  }

  return request;
}
