// Admin audit trail: IDs only (actor, action, entity type, entity id, time).
class AuditLogRepository {
  constructor(db) {
    this.db = db;
  }

  async record({ actorId, action, entityType, entityId }) {
    const result = await this.db.query(
      `INSERT INTO admin_audit_log (actor_id, action, entity_type, entity_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [actorId ?? null, action, entityType, entityId],
    );
    return result.rows[0];
  }

  // Newest first; every filter is optional.
  async list({
    entityType, entityId, actorId, limit = 50, offset = 0,
  } = {}) {
    const where = [];
    const values = [];
    if (entityType) { values.push(entityType); where.push(`entity_type = $${values.length}`); }
    if (entityId != null) { values.push(entityId); where.push(`entity_id = $${values.length}`); }
    if (actorId != null) { values.push(actorId); where.push(`actor_id = $${values.length}`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await this.db.query(`SELECT COUNT(*)::int AS count FROM admin_audit_log ${whereSql}`, values);
    values.push(limit, offset);
    const rows = await this.db.query(
      `SELECT * FROM admin_audit_log ${whereSql}
       ORDER BY created_at DESC, admin_audit_log_id DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return { entries: rows.rows, total: Number(total.rows[0].count) };
  }
}

module.exports = { AuditLogRepository };
