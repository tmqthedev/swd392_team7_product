// Parse a JSONB column that pg returns as a string, or that a fake/mock DB
// returns already parsed.
function parseJsonColumn(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toApiJob(row) {
  if (!row) return null;
  return {
    id: row.question_generation_job_id,
    topicId: row.topic_id,
    materialIds: parseJsonColumn(row.material_ids) || [],
    requestedCount: row.requested_count,
    bloomDistribution: parseJsonColumn(row.bloom_distribution),
    language: row.language ?? null,
    status: row.status ?? null,
    generatedCount: row.generated_count ?? 0,
    error: row.error ?? null,
  };
}

class QuestionGenerationController {
  constructor(questionGenerationService, { jobRepository } = {}) {
    this.questionGenerationService = questionGenerationService;
    this.jobRepository = jobRepository;
  }

  create = async (req, res, next) => {
    try {
      const {
        topicId, materialIds, requestedCount, bloomDistribution, language,
      } = req.body || {};
      const job = await this.questionGenerationService.createJob({
        user: req.user,
        topicId,
        materialIds,
        requestedCount,
        bloomDistribution,
        language,
      });
      res.status(201).json(toApiJob(job));
    } catch (error) {
      next(error);
    }
  };

  getById = async (req, res, next) => {
    try {
      const job = await this.jobRepository.findById(Number(req.params.id));
      if (!job) {
        const err = new Error('Generation job not found.');
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }
      res.json(toApiJob(job));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { QuestionGenerationController, toApiJob };
