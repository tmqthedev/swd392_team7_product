const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'backend', 'src', 'services', 'awsClients.js');
let code = fs.readFileSync(targetFile, 'utf8');

// Add fs and path imports if not exist
if (!code.includes("require('fs')")) {
  code = `const fs = require('fs');\nconst path = require('path');\n` + code;
}

// Modify InMemorySessionStore
const regex = /class InMemorySessionStore \{([\s\S]*?)\}\n\nclass AwsSessionStore/m;
code = code.replace(regex, `class InMemorySessionStore {
  constructor() {
    this.dbFilePath = path.join(process.cwd(), 'mock-session-store.json');
    this._writePromise = Promise.resolve();
    this.store = new Map();
    this._load();
  }

  _load() {
    if (fs.existsSync(this.dbFilePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.dbFilePath, 'utf8'));
        this.store = new Map(data);
      } catch (err) {
        console.error('Failed to load mock session store:', err);
      }
    }
  }

  _save() {
    const data = Array.from(this.store.entries());
    this._writePromise = this._writePromise.then(() => 
      fs.promises.writeFile(this.dbFilePath, JSON.stringify(data, null, 2), 'utf8')
    ).catch(err => console.error('Failed to save mock session store:', err));
    return this._writePromise;
  }

  async put(session) {
    this.store.set(session.sessionId, { ...session });
    await this._save();
  }

  async get(sessionId) {
    return this.store.get(sessionId) || null;
  }

  async update(sessionId, patch) {
    const current = this.store.get(sessionId) || { sessionId };
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    this.store.set(sessionId, next);
    await this._save();
    return next;
  }
}

class AwsSessionStore`);

fs.writeFileSync(targetFile, code);
console.log('Patched awsClients.js');
