const express = require('express');

function createMeRouter(studentExamController, auth = {}) {
  const router = express.Router();
  const { requireAuth, requireRole } = auth;

  const studentGuard = requireAuth && requireRole
    ? [requireAuth, requireRole('STUDENT')]
    : [];

  router.get('/exam-sessions', ...studentGuard, studentExamController.listMySessions);

  return router;
}

module.exports = { createMeRouter };
