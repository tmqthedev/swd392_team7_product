class QuestionController {
  constructor(questionService) {
    this.questionService = questionService;
  }

  list = async (_req, res, next) => {
    try {
      const questions = await this.questionService.listQuestions();
      res.json(questions);
    } catch (error) {
      next(error);
    }
  };

  getById = async (req, res, next) => {
    try {
      const questionId = this._parseQuestionId(req.params.id);
      const question = await this.questionService.getQuestionById(questionId);
      res.json(question);
    } catch (error) {
      next(error);
    }
  };

  create = async (req, res, next) => {
    try {
      const question = await this.questionService.createQuestion(req.body || {});
      res.status(201).json(question);
    } catch (error) {
      next(error);
    }
  };

  update = async (req, res, next) => {
    try {
      const questionId = this._parseQuestionId(req.params.id);
      const question = await this.questionService.updateQuestion(questionId, req.body || {});
      res.json(question);
    } catch (error) {
      next(error);
    }
  };

  remove = async (req, res, next) => {
    try {
      const questionId = this._parseQuestionId(req.params.id);
      const question = await this.questionService.deleteQuestion(questionId);
      res.json(question);
    } catch (error) {
      next(error);
    }
  };

  _parseQuestionId(rawId) {
    const questionId = Number(rawId);
    if (!Number.isInteger(questionId) || questionId <= 0) {
      const err = new Error('Question id must be a positive integer.');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    return questionId;
  }
}

module.exports = {
  QuestionController,
};
