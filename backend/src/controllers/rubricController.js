class RubricController {
  constructor(rubricService) {
    this.rubricService = rubricService;
  }

  list = async (_req, res, next) => {
    try {
      const rubrics = await this.rubricService.listRubrics();
      res.json(rubrics);
    } catch (error) {
      next(error);
    }
  };

  getById = async (req, res, next) => {
    try {
      const rubricId = this._parseRubricId(req.params.id);
      const rubric = await this.rubricService.getRubricById(rubricId);
      res.json(rubric);
    } catch (error) {
      next(error);
    }
  };

  create = async (req, res, next) => {
    try {
      const rubric = await this.rubricService.createRubric(req.body || {});
      res.status(201).json(rubric);
    } catch (error) {
      next(error);
    }
  };

  update = async (req, res, next) => {
    try {
      const rubricId = this._parseRubricId(req.params.id);
      const rubric = await this.rubricService.updateRubric(rubricId, req.body || {});
      res.json(rubric);
    } catch (error) {
      next(error);
    }
  };

  remove = async (req, res, next) => {
    try {
      const rubricId = this._parseRubricId(req.params.id);
      const rubric = await this.rubricService.deleteRubric(rubricId);
      res.json(rubric);
    } catch (error) {
      next(error);
    }
  };

  _parseRubricId(rawId) {
    const rubricId = Number(rawId);
    if (!Number.isInteger(rubricId) || rubricId <= 0) {
      const err = new Error('Rubric id must be a positive integer.');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    return rubricId;
  }
}

module.exports = {
  RubricController,
};
