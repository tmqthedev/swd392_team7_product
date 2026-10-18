const express = require('express');
const multer = require('multer');

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Build the /materials router. Every route requires an authenticated LECTURER
 * (ADMIN scope handling lives in the service). Uploads use multer memory
 * storage so the service can hand the buffer straight to S3; multer's
 * LIMIT_FILE_SIZE is mapped to a 413 FILE_TOO_LARGE error.
 */
function createMaterialRouter(materialController, auth = {}) {
  const router = express.Router();
  const { requireAuth, requireRole } = auth;

  const guard = requireAuth && requireRole
    ? [requireAuth, requireRole('LECTURER', 'ADMIN')]
    : (requireAuth ? [requireAuth] : []);

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_BYTES },
  });

  // Translate multer's own errors (notably file-size overflow) into the
  // project's structured error shape before they reach the app error handler.
  function uploadSingle(req, res, next) {
    upload.single('file')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          const tooLarge = new Error('The uploaded file exceeds the 50MB limit.');
          tooLarge.statusCode = 413;
          tooLarge.code = 'FILE_TOO_LARGE';
          return next(tooLarge);
        }
        return next(err);
      }
      return next();
    });
  }

  router.post('/', ...guard, uploadSingle, materialController.upload);
  router.get('/', ...guard, materialController.list);
  router.delete('/:id', ...guard, materialController.remove);

  return router;
}

module.exports = { createMaterialRouter, MAX_FILE_BYTES };
