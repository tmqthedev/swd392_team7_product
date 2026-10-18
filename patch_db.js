const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'backend', 'src', 'db', 'createDatabase.js');
let code = fs.readFileSync(targetFile, 'utf8');

// Add fs and path imports if not exist
if (!code.includes("require('fs')")) {
  code = `const fs = require('fs');\nconst path = require('path');\n` + code;
}

// Modify constructor
const constructorRegex = /constructor\(\)\s*\{([\s\S]*?nextCriterionId = 1;\n\s*)\}/;
code = code.replace(constructorRegex, `constructor() {$1
    this.dbFilePath = path.join(process.cwd(), 'mock-database.json');
    this._writePromise = Promise.resolve();
    this._load();
  }

  _load() {
    if (fs.existsSync(this.dbFilePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.dbFilePath, 'utf8'));
        if (data.topics) this.topics = new Map(data.topics);
        if (data.rubrics) this.rubrics = new Map(data.rubrics);
        if (data.rubricCriteria) this.rubricCriteria = new Map(data.rubricCriteria);
        if (data.questions) this.questions = new Map(data.questions);
        if (data.nextQuestionId) this.nextQuestionId = data.nextQuestionId;
        if (data.nextRubricId) this.nextRubricId = data.nextRubricId;
        if (data.nextCriterionId) this.nextCriterionId = data.nextCriterionId;
      } catch (err) {
        console.error('Failed to load mock database:', err);
      }
    }
  }

  _save() {
    const data = {
      topics: Array.from(this.topics.entries()),
      rubrics: Array.from(this.rubrics.entries()),
      rubricCriteria: Array.from(this.rubricCriteria.entries()),
      questions: Array.from(this.questions.entries()),
      nextQuestionId: this.nextQuestionId,
      nextRubricId: this.nextRubricId,
      nextCriterionId: this.nextCriterionId,
    };
    
    this._writePromise = this._writePromise.then(() => 
      fs.promises.writeFile(this.dbFilePath, JSON.stringify(data, null, 2), 'utf8')
    ).catch(err => console.error('Failed to save mock database', err));
    
    return this._writePromise;
  }`);

// Modify query
const queryRegex = /async query\(text, params = \[\]\)\s*\{\s*try\s*\{\s*return await this\._dispatch\(text, params\);\s*\}\s*catch\s*\(error\)\s*\{\s*throw mapDbError\(error\);\s*\}\s*\}/;
code = code.replace(queryRegex, `async query(text, params = []) {
    try {
      const result = await this._dispatch(text, params);
      const upperText = text.toUpperCase().trim();
      if (upperText.startsWith('INSERT') || upperText.startsWith('UPDATE') || upperText.startsWith('DELETE')) {
        await this._save();
      }
      return result;
    } catch (error) {
      throw mapDbError(error);
    }
  }`);

fs.writeFileSync(targetFile, code);
console.log('Patched createDatabase.js');
