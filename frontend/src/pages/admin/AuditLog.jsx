import { t, useLocale, translateMessage } from '../../i18n/index';
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Feedback } from '../../components/ui/Feedback';
import { LoadingSpinner } from '../../components/ui/Loading';
import { Table, Thead, Tbody, Tr, Th, Td } from '../../components/ui/Table';
import { listAuditLog } from '../../services/adminApi';
import { formatDateTime } from '../../shared/utils/formatDate';

const ENTITY_TYPES = ['USER', 'SUBJECT', 'EXAM_SESSION'];
const PAGE_SIZE = 50;

// Admin audit trail: IDs only (who, what action, which record, when).
export default function AdminAuditLog() {
  useLocale();
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [actorId, setActorId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listAuditLog({
        entityType: entityType || undefined,
        entityId: entityId || undefined,
        actorId: actorId || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setEntries(data.entries || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message || t("Could not load the audit log."));
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, actorId, page]);

  useEffect(() => {
    load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2>{t("Audit log")}</h2>
          <p style={{ color: 'var(--text-muted)' }}>{t("Every admin change: who, what, which record and when (IDs only)")}</p>
        </div>
        <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => load()}>{t("Refresh")}</Button>
      </div>

      {error && <Feedback type="error" message={translateMessage(error)} />}

      <Card style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">{t("Record type")}</label>
            <select className="form-select" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }}>
              <option value="">{t("All")}</option>
              {ENTITY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
          <Input label={t("Record ID")} type="number" min="1" value={entityId} onChange={(e) => { setEntityId(e.target.value); setPage(1); }} />
          <Input label={t("Actor ID")} type="number" min="1" value={actorId} onChange={(e) => { setActorId(e.target.value); setPage(1); }} />
        </div>
      </Card>

      <Card>
        {loading ? (
          <LoadingSpinner text={t("Loading...")} />
        ) : entries.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>{t("No entries.")}</p>
        ) : (
          <>
            <Table>
              <Thead>
                <Tr>
                  <Th>{t("Time")}</Th>
                  <Th>{t("Actor ID")}</Th>
                  <Th>{t("Action")}</Th>
                  <Th>{t("Record type")}</Th>
                  <Th>{t("Record ID")}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {entries.map((entry) => (
                  <Tr key={entry.admin_audit_log_id}>
                    <Td>{formatDateTime(entry.created_at, '—')}</Td>
                    <Td>{entry.actor_id ?? '—'}</Td>
                    <Td><code>{entry.action}</code></Td>
                    <Td>{entry.entity_type}</Td>
                    <Td>{entry.entity_id}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.75rem', marginTop: '1rem' }}>
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("Previous")}</Button>
              <span>{t("Page {v0} of {v1}", { v0: page, v1: pages })}</span>
              <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("Next")}</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
