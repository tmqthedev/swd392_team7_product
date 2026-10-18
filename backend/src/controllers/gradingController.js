// Controller for lecturer examination review and AI grading (Step 8).

class GradingController {
  constructor({ gradingService, awsClients, audioBucketName, db }) {
    this.gradingService = gradingService;
    this.awsClients = awsClients;
    this.audioBucketName = audioBucketName || 'local-audio-bucket';
    this.db = db;
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
      const turnId = Number(req.params.id);
      const tRes = await this.db.query(
        'SELECT answer_audio_key, question_audio_key FROM qa_turn WHERE qa_turn_id = $1 LIMIT 1',
        [turnId]
      );
      const turn = tRes.rows[0];
      if (!turn) {
        const err = new Error('Turn not found');
        err.statusCode = 404;
        return next(err);
      }

      const key = turn.answer_audio_key || turn.question_audio_key;
      if (!key) {
        const err = new Error('No audio recording found for this turn');
        err.statusCode = 404;
        return next(err);
      }

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
