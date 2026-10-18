class InterviewController {
  constructor(interviewService) {
    this.interviewService = interviewService;
  }

  startOrResume = async (req, res, next) => {
    try {
      const { examSessionId } = req.body || {};
      const result = await this.interviewService.startOrResume({
        user: req.user,
        examSessionId,
        clientIp: req.ip,
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getCurrentState = async (req, res, next) => {
    try {
      const result = await this.interviewService.getCurrentState({
        user: req.user,
        interviewId: req.params.id,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  markQuestionPlayed = async (req, res, next) => {
    try {
      const result = await this.interviewService.markQuestionPlayed({
        user: req.user,
        interviewId: req.params.id,
        turnId: req.params.turnId,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  submitAnswer = async (req, res, next) => {
    try {
      const { transcript, timedOut, signals } = req.body || {};
      const audio = req.file ? req.file.buffer : undefined;
      const contentType = req.file ? req.file.mimetype : (req.body && req.body.contentType);

      const result = await this.interviewService.submitAnswer({
        user: req.user,
        interviewId: req.params.id,
        turnId: req.params.turnId,
        audio,
        contentType,
        transcript,
        timedOut: timedOut === true || timedOut === 'true',
        signals,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { InterviewController };
