const express = require('express');

/**
 * Build the /question-generation-jobs router. Creating a generation job and
 * reading one back are both restricted to LECTURER accounts via requireAuth +
 * requireRole('LECTURER') (ADMIN scope handling lives in the service).
 */
function createQuestionGenerationRouter(controller, auth = {}) {
  const router = express.Router();
  const { requireAuth, requireRole } = auth;

  const guard = requireAuth && requireRole
    ? [requireAuth, requireRole('LECTURER', 'ADMIN')]
    : (requireAuth ? [requireAuth] : []);

  router.post('/', ...guard, controller.create);
  router.get('/:id', ...guard, controller.getById);

  return router;
}

module.exports = { createQuestionGenerationRouter };
