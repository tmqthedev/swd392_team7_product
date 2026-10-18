import { SLOT_STATUS } from '../../../constants/enums';
import { store } from '../../../data/mockStore';
import { clone, wait } from '../../../services/mockClient';

export async function listSessions(search = '') {
  await wait();
  const term = search.trim().toLowerCase();
  return store.sessions
    .filter((session) => {
      if (!term) return true;
      return (
        session.studentName.toLowerCase().includes(term) ||
        session.studentId.toLowerCase().includes(term) ||
        session.exam.toLowerCase().includes(term)
      );
    })
    .map((session) => clone(session));
}

export async function getSessionStats() {
  await wait(80);
  const pending = store.sessions.filter((session) => session.status === SLOT_STATUS.PENDING_REVIEW).length;
  const approved = store.sessions.filter((session) => session.status === SLOT_STATUS.APPROVED).length;
  const exams = new Set(store.sessions.map((session) => session.exam)).size;
  return { pending, approved, exams, total: store.sessions.length };
}
