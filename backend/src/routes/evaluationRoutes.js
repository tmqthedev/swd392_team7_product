const { Router } = require('express');
function createEvaluationRouter(controller) {
  const router = Router();
  router.post('/', controller.create.bind(controller));
  router.get('/', controller.list.bind(controller));
  router.get('/:id', controller.get.bind(controller));
  router.patch('/:id', controller.update.bind(controller));
  router.delete('/:id', controller.delete.bind(controller));
  return router;
}
module.exports = { createEvaluationRouter };
