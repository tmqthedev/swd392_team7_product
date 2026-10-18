const express = require('express');

/**
 * Build the /exam-sessions router. Every route is guarded by requireAuth +
 * requireRole('LECTURER'): the exam-session domain is lecturer-only. When no
 * auth middleware is supplied the router stays open (kept for narrow callers
 * that wire their own guards); createApp always passes it.
 */
function createExamSessionRouter(examSessionController, auth = {}) {
  const router = express.Router();
  const { requireAuth, requireRole } = auth;

  const guard = requireAuth && requireRole
    ? [requireAuth, requireRole('LECTURER')]
    : [];

  router.post('/', ...guard, examSessionController.create);
  router.get('/', ...guard, examSessionController.list);
  router.get('/:id', ...guard, examSessionController.getById);
  router.put('/:id', ...guard, examSessionController.update);
  router.put('/:id/students', ...guard, examSessionController.setStudents);
  router.put('/:id/examiners', ...guard, examSessionController.setExaminers);
  router.post('/:id/open', ...guard, examSessionController.open);
  router.post('/:id/close', ...guard, examSessionController.close);

  return router;
}

module.exports = { createExamSessionRouter };
