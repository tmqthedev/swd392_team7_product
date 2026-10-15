const { Router } = require('express');

function createAuthRouter(controller, { requireAuth }) {
  const router = Router();
  router.post('/login', controller.login.bind(controller));
  router.post('/logout', controller.logout.bind(controller));
  router.post('/refresh', controller.refresh.bind(controller));
  router.get('/me', requireAuth, controller.me.bind(controller));
  router.post('/forgot-password', controller.forgotPassword.bind(controller));
  router.post('/reset-password', controller.resetPassword.bind(controller));
  router.post('/set-password', controller.setPassword.bind(controller));
  router.put('/password', requireAuth, controller.changePassword.bind(controller));
  return router;
}

module.exports = { createAuthRouter };
