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
}

module.exports = { StudentExamController };
