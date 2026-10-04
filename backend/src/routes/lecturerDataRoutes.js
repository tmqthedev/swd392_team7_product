const express = require('express');

function createLecturerDataRouter(lecturerDataController) {
  const router = express.Router();

  router.get('/:entity', lecturerDataController.list);
  router.post('/:entity', lecturerDataController.create);
  router.get('/:entity/:id', lecturerDataController.getById);
  router.put('/:entity/:id', lecturerDataController.update);
  router.delete('/:entity/:id', lecturerDataController.remove);

  return router;
}

module.exports = {
  createLecturerDataRouter,
};
