class MaterialController {
  constructor(materialService) {
    this.materialService = materialService;
  }

  upload = async (req, res, next) => {
    try {
      const { subjectId, topicId } = req.body || {};
      const material = await this.materialService.upload({
        user: req.user,
        subjectId,
        topicId,
        file: req.file,
      });
      res.status(201).json(material);
    } catch (error) {
      next(error);
    }
  };

  list = async (req, res, next) => {
    try {
      const { subjectId } = req.query || {};
      const materials = await this.materialService.list({ user: req.user, subjectId });
      res.json(materials);
    } catch (error) {
      next(error);
    }
  };

  remove = async (req, res, next) => {
    try {
      const material = await this.materialService.delete({
        user: req.user,
        materialId: req.params.id,
      });
      res.json(material);
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { MaterialController };
