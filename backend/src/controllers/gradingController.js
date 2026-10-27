// Controller for lecturer examination review and AI grading (Step 8).

class GradingController {
  constructor({ gradingService, awsClients, audioBucketName }) {
    this.gradingService = gradingService;
    this.awsClients = awsClients;
    this.audioBucketName = audioBucketName || 'local-audio-bucket';
  }

  async listSessionResults(req, res, next) {
    try {
      const examSessionId = Number(req.params.id);
      const results = await this.gradingService.listSessionResults({
        examSessionId,
        user: req.user,
      });
      res.json(results);
    } catch (err) {
      next(err);
    }
  }

  async getResultDetail(req, res, next) {
    try {
      const resultId = Number(req.params.id);
      const detail = await this.gradingService.getResultDetail({
        resultId,
        user: req.user,
      });
      res.json(detail);
    } catch (err) {
      next(err);
    }
  }

  async adjustCriterionScore(req, res, next) {
    try {
      const criterionScoreId = Number(req.params.id);
      const { score, reason } = req.body || {};
      const updated = await this.gradingService.adjustCriterionScore({
        criterionScoreId,
        newScore: score,
        reason,
        user: req.user,
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }

  async finalizeResult(req, res, next) {
    try {
      const resultId = Number(req.params.id);
      const finalized = await this.gradingService.finalizeResult({
        resultId,
        user: req.user,
      });
      res.json(finalized);
    } catch (err) {
      next(err);
    }
  }

  async reopenResult(req, res, next) {
    try {
      const resultId = Number(req.params.id);
      const reopened = await this.gradingService.reopenResult({
        resultId,
        user: req.user,
      });
      res.json(reopened);
    } catch (err) {
      next(err);
    }
  }

  async regradeResult(req, res, next) {
    try {
      const resultId = Number(req.params.id);
      const outcome = await this.gradingService.regradeResult({
        resultId,
        user: req.user,
      });
      res.json(outcome);
    } catch (err) {
      next(err);
    }
  }

  async getTurnAudio(req, res, next) {
    try {
      const key = await this.gradingService.getTurnAudioKey({
        turnId: Number(req.params.id),
        user: req.user,
      });

      if (this.awsClients && typeof this.awsClients.getObject === 'function') {
        const buf = await this.awsClients.getObject({
          bucket: this.audioBucketName,
          key,
        });
        res.setHeader('Content-Type', 'audio/webm');
        return res.send(buf);
      }

      const err = new Error('Storage client unavailable');
      err.statusCode = 503;
      next(err);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = {
  GradingController,
};
