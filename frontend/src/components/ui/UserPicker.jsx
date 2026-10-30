import { t, useLocale } from '../../i18n/index';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Input } from './Input';
import { Button } from './Button';
import { searchUsers } from '../../services/adminApi';

const PAGE_SIZE = 20;

/**
 * Server-side searchable, paged multi-select of users for large rosters.
 * - role: fixed role filter (e.g. 'LECTURER', 'STUDENT'); only ACTIVE users.
 * - selected: array of user objects ({ id, code, fullName, email }) currently
 *   chosen; onChange receives the new array. Selected users stay visible as
 *   chips even when they are not on the current result page.
 */
export function UserPicker({ role, selected, onChange }) {
  useLocale();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ users: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  useEffect(() => {
    const id = requestId.current + 1;
    requestId.current = id;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const data = await searchUsers({
          role, status: 'ACTIVE', q: q.trim() || undefined, page, pageSize: PAGE_SIZE,
        });
        if (requestId.current === id) setResult({ users: data.users || [], total: data.total || 0 });
      } catch (err) {
        if (requestId.current === id) setError(err.message || t("Could not load users."));
      } finally {
        if (requestId.current === id) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [role, q, page]);

  const selectedIds = new Set(selected.map((u) => u.id));
  const toggle = (user) => {
    onChange(selectedIds.has(user.id) ? selected.filter((u) => u.id !== user.id) : [...selected, user]);
  };
  const addPage = () => {
    const extra = result.users.filter((u) => !selectedIds.has(u.id));
    onChange([...selected, ...extra]);
  };
  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const label = (u) => `${u.code ? `${u.code} · ` : ''}${u.fullName || u.email}`;

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '12rem' }}>
          <Input
            placeholder={t("Search by code, name or email...")}
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
          />
        </div>
        <Button type="button" variant="secondary" onClick={addPage} disabled={result.users.length === 0}>{t("Select this page")}</Button>
        <Button type="button" variant="secondary" onClick={() => onChange([])} disabled={selected.length === 0}>{t("Clear")}</Button>
      </div>

      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.5rem 0' }}>
        {t("Selected: {v0}", { v0: selected.length })}
      </p>
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.75rem', maxHeight: '6.5rem', overflowY: 'auto' }}>
          {selected.map((u) => (
            <span key={u.id} className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              {label(u)}
              <button
                type="button"
                aria-label={t("Remove {v0}", { v0: label(u) })}
                onClick={() => toggle(u)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, display: 'inline-flex' }}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {error && <p style={{ color: 'var(--accent)', fontSize: '0.85rem' }}>{error}</p>}
      <div style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
        {loading && result.users.length === 0 ? (
          <p style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>{t("Loading...")}</p>
        ) : result.users.length === 0 ? (
          <p style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>{t("No users found.")}</p>
        ) : (
          result.users.map((u) => (
            <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid var(--border-color)' }}>
              <input type="checkbox" checked={selectedIds.has(u.id)} onChange={() => toggle(u)} />
              <span><strong>{u.code || '—'}</strong> {u.fullName || ''} <span style={{ color: 'var(--text-muted)' }}>{u.email}</span></span>
            </label>
          ))
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
        <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("Previous")}</Button>
        <span style={{ fontSize: '0.85rem' }}>{t("Page {v0} of {v1}", { v0: page, v1: pages })} · {t("{v0} found", { v0: result.total })}</span>
        <Button type="button" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("Next")}</Button>
      </div>
    </div>
  );
}
