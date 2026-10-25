class StudentExamController {
  constructor(studentExamService) {
    this.studentExamService = studentExamService;
  }

  listMySessions = async (req, res, next) => {
    try {
      const sessions = await this.studentExamService.listExamSessions({ user: req.user });
      res.json(sessions);
    } catch (error) {
      next(error);
    }
  };

  listMyResults = async (req, res, next) => {
    try {
      const results = await this.studentExamService.listResults({ user: req.user });
      res.json(results);
    } catch (error) {
      next(error);
    }
  };

  getMyResult = async (req, res, next) => {
    try {
      const resultId = Number(req.params.id);
      const detail = await this.studentExamService.getResultDetail({ user: req.user, resultId });
      res.json(detail);
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { StudentExamController };
