# GEMINI.md

Please refer to [AGENTS.md](./AGENTS.md) for full project architecture, guidelines, directory breakdown, commands, and conventions for AI pair programmers in this repository.

### Quick Reference
- **Backend Start**: `npm start` in `backend/`
- **Backend Unit Tests**: `npm test` in `backend/` (runs `node test/runTests.js unit`, which forces mock AI providers over `test/*Service.test.js`)
- **Backend E2E Tests**: `npm run test:e2e` in `backend/`
- **Runtime**: `npm start` refuses mock AI providers (`AI_CONFIG_INVALID`); see `docs/bilingual-real-ai.md`
- **Frontend Dev**: `npm run dev` in `frontend/`
- **Frontend Lint**: `npm run lint` in `frontend/`
- **Full Stack**: `docker compose up` in root directory
