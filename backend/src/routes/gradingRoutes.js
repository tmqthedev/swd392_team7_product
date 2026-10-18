const express = require('express');

function createGradingRouter(gradingController, authMiddleware = {}) {
  const router = express.Router();

  const requireAuth = authMiddleware.requireAuth || ((_req, _res, next) => next());
  const requireRole = authMiddleware.requireRole || (() => (_req, _res, next) => next());
  const lecturerOnly = [requireAuth, requireRole('LECTURER', 'ADMIN')];

  // Exam session results list
  router.get('/exam-sessions/:id/results', ...lecturerOnly, (req, res, next) =>
    gradingController.listSessionResults(req, res, next)
  );

  // Single result detail for evaluation review
  router.get('/results/:id', ...lecturerOnly, (req, res, next) =>
    gradingController.getResultDetail(req, res, next)
  );

  // Adjust score for a single criterion
  router.put('/criterion-scores/:id', ...lecturerOnly, (req, res, next) =>
    gradingController.adjustCriterionScore(req, res, next)
  );

  // Finalize result score
  router.post('/results/:id/finalize', ...lecturerOnly, (req, res, next) =>
    gradingController.finalizeResult(req, res, next)
  );

  // Reopen finalized result
  router.post('/results/:id/reopen', ...lecturerOnly, (req, res, next) =>
    gradingController.reopenResult(req, res, next)
  );

  // Re-run AI grading
  router.post('/results/:id/regrade', ...lecturerOnly, (req, res, next) =>
    gradingController.regradeResult(req, res, next)
  );

  // Fetch audio playback of a student turn
  router.get('/turns/:id/audio', ...lecturerOnly, (req, res, next) =>
    gradingController.getTurnAudio(req, res, next)
  );

  return router;
}

module.exports = {
  createGradingRouter,
};
