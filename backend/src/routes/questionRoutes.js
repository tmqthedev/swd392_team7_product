const express = require('express');

function createQuestionRouter(questionController) {
  const router = express.Router();

  router.post('/', questionController.create);
  router.get('/', questionController.list);
  router.get('/:id', questionController.getById);
  router.put('/:id', questionController.update);
  router.delete('/:id', questionController.remove);

  return router;
}

module.exports = {
  createQuestionRouter,
};
