const { Router } = require('express');
const express = require('express');

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Build the /admin router. The entire router is guarded by requireAuth and
 * requireRole('ADMIN') from FEAT-001. The student-import route additionally
 * accepts a raw binary body (xlsx/octet-stream) in addition to the global JSON
 * parser's base64 path.
 */
function createAdminRouter(controller, { requireAuth, requireRole }) {
  const router = Router();
  router.use(requireAuth, requireRole('ADMIN'));

  // Users
  router.get('/users', controller.listUsers.bind(controller));
  router.post('/users', controller.createUser.bind(controller));
  router.post(
    '/users/import',
    express.raw({ type: [XLSX_MIME, 'application/octet-stream'], limit: '10mb' }),
    controller.importStudents.bind(controller),
  );
  router.put('/users/:id', controller.updateUser.bind(controller));
  router.post('/users/:id/lock', controller.lockUser.bind(controller));
  router.post('/users/:id/unlock', controller.unlockUser.bind(controller));
  router.post('/users/:id/resend-setup', controller.resendSetup.bind(controller));

  // Subjects
  router.get('/subjects', controller.listSubjects.bind(controller));
  router.post('/subjects', controller.createSubject.bind(controller));
  router.put('/subjects/:id', controller.updateSubject.bind(controller));
  router.delete('/subjects/:id', controller.deleteSubject.bind(controller));
  router.put('/subjects/:id/lecturers', controller.assignLecturers.bind(controller));

  return router;
}

module.exports = { createAdminRouter };
