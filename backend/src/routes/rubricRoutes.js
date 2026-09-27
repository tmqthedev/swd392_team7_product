const express = require('express');

function createRubricRouter(rubricController) {
  const router = express.Router();

  router.post('/', rubricController.create);
  router.get('/', rubricController.list);
  router.get('/:id', rubricController.getById);
  router.put('/:id', rubricController.update);
  router.delete('/:id', rubricController.remove);

  return router;
}

module.exports = {
  createRubricRouter,
};
