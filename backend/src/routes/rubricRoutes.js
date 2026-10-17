const express = require('express');

/**
 * Build the /rubrics router. Reads are available to any authenticated user;
 * writes (create/update/delete/clone) are restricted to LECTURER accounts via
 * requireAuth + requireRole('LECTURER'). When no auth middleware is supplied the
 * router stays open; createApp always passes it.
 */
function createRubricRouter(rubricController, auth = {}) {
  const router = express.Router();
  const { requireAuth, requireRole } = auth;

  const read = requireAuth && requireRole
    ? [requireAuth, requireRole('LECTURER', 'ADMIN')]
    : (requireAuth ? [requireAuth] : []);
  const write = requireAuth && requireRole
    ? [requireAuth, requireRole('LECTURER')]
    : [];

  router.post('/', ...write, rubricController.create);
  router.get('/', ...read, rubricController.list);
  router.get('/:id', ...read, rubricController.getById);
  router.put('/:id', ...write, rubricController.update);
  router.delete('/:id', ...write, rubricController.remove);
  router.post('/:id/clone', ...write, rubricController.clone);

  return router;
}

module.exports = {
  createRubricRouter,
};
