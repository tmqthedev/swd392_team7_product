import re
import os

app_path = os.path.join('backend', 'src', 'app.js')

with open(app_path, 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add requires
requires = """const { TopicRepository } = require('./repositories/topicRepository');
const { TopicService } = require('./services/topicService');
const { TopicController } = require('./controllers/topicController');
const { createTopicRouter } = require('./routes/topicRoutes');
const { EvaluationRepository } = require('./repositories/evaluationRepository');
const { EvaluationService } = require('./services/evaluationService');
const { EvaluationController } = require('./controllers/evaluationController');
const { createEvaluationRouter } = require('./routes/evaluationRoutes');"""

code = code.replace("const { createRubricRouter } = require('./routes/rubricRoutes');", 
                    "const { createRubricRouter } = require('./routes/rubricRoutes');\n" + requires)

# 2. Add instantiation
instantiation = """  const topicRepository = overrides.topicRepository || new TopicRepository(database);
  const topicService = overrides.topicService || new TopicService({ repository: topicRepository });
  const topicController = overrides.topicController || new TopicController(topicService);
  const evaluationRepository = overrides.evaluationRepository || new EvaluationRepository(database);
  const evaluationService = overrides.evaluationService || new EvaluationService({ repository: evaluationRepository });
  const evaluationController = overrides.evaluationController || new EvaluationController(evaluationService);"""

code = code.replace("const rubricController = overrides.rubricController || new RubricController(rubricService);",
                    "const rubricController = overrides.rubricController || new RubricController(rubricService);\n" + instantiation)

# 3. Add app.use
routes = """  app.use('/topics', createTopicRouter(topicController));
  app.use('/evaluations', createEvaluationRouter(evaluationController));"""

code = code.replace("app.use('/rubrics', createRubricRouter(rubricController));",
                    "app.use('/rubrics', createRubricRouter(rubricController));\n" + routes)

with open(app_path, 'w', encoding='utf-8') as f:
    f.write(code)

print("Patched app.js")
