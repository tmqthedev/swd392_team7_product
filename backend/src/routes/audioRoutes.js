const express = require('express');

function createAudioRouter(audioWorkflowService) {
  const router = express.Router();

  router.post('/upload-url', async (req, res, next) => {
    try {
      const result = await audioWorkflowService.createUploadSession(req.body || {});
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/process', async (req, res, next) => {
    try {
      const result = await audioWorkflowService.startProcessing(req.body || {});
      res.status(202).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/status/:sessionId', async (req, res, next) => {
    try {
      const result = await audioWorkflowService.getSessionStatus(req.params.sessionId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/result/:sessionId', async (req, res, next) => {
    try {
      const result = await audioWorkflowService.getSessionResult(req.params.sessionId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = {
  createAudioRouter,
};
