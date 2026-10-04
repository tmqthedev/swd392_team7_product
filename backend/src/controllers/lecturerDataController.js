const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'db', 'lecturer-data');

function getFilePath(entity) {
  return path.join(DATA_DIR, `${entity}.json`);
}

function readData(entity) {
  const filePath = getFilePath(entity);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return [];
}

function writeData(entity, data) {
  const filePath = getFilePath(entity);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

const entityMap = ['sessions', 'questions', 'rubrics'];

class LecturerDataController {
  
  list = (req, res, next) => {
    try {
      const entity = req.params.entity;
      if (!entityMap.includes(entity)) return res.status(404).json({ message: 'Not found' });
      const data = readData(entity);
      res.json(data);
    } catch (error) {
      next(error);
    }
  };

  getById = (req, res, next) => {
    try {
      const entity = req.params.entity;
      if (!entityMap.includes(entity)) return res.status(404).json({ message: 'Not found' });
      const data = readData(entity);
      const item = data.find(d => String(d.id) === String(req.params.id));
      if (!item) return res.status(404).json({ message: 'Item not found' });
      res.json(item);
    } catch (error) {
      next(error);
    }
  };

  create = (req, res, next) => {
    try {
      const entity = req.params.entity;
      if (!entityMap.includes(entity)) return res.status(404).json({ message: 'Not found' });
      const data = readData(entity);
      const newItem = { ...req.body };
      if (!newItem.id) {
          const prefix = entity === 'sessions' ? 'S' : entity === 'questions' ? 'Q' : 'R';
          newItem.id = prefix + Date.now();
      }
      data.push(newItem);
      writeData(entity, data);
      res.status(201).json(newItem);
    } catch (error) {
      next(error);
    }
  };

  update = (req, res, next) => {
    try {
      const entity = req.params.entity;
      if (!entityMap.includes(entity)) return res.status(404).json({ message: 'Not found' });
      const data = readData(entity);
      const idx = data.findIndex(d => String(d.id) === String(req.params.id));
      if (idx === -1) return res.status(404).json({ message: 'Item not found' });
      
      data[idx] = { ...data[idx], ...req.body, id: data[idx].id };
      writeData(entity, data);
      res.json(data[idx]);
    } catch (error) {
      next(error);
    }
  };

  remove = (req, res, next) => {
    try {
      const entity = req.params.entity;
      if (!entityMap.includes(entity)) return res.status(404).json({ message: 'Not found' });
      let data = readData(entity);
      const initialLength = data.length;
      data = data.filter(d => String(d.id) !== String(req.params.id));
      if (data.length === initialLength) return res.status(404).json({ message: 'Item not found' });
      
      writeData(entity, data);
      res.json({ success: true, message: 'Deleted' });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  LecturerDataController,
};
