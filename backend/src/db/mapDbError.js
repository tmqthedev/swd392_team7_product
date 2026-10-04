function mapDbError(error) {
  if (!error || typeof error !== 'object') {
    return error;
  }

  if (error.statusCode) {
    return error;
  }

  if (error.code === '23503' && /^update or delete on table/i.test(error.message || '')) {
    const mapped = new Error('Resource is still referenced by other records and cannot be deleted.');
    mapped.statusCode = 409;
    mapped.code = 'RESOURCE_IN_USE';
    return mapped;
  }

  if (error.code === '23503') {
    const mapped = new Error('Invalid foreign key reference');
    mapped.statusCode = 400;
    mapped.code = 'INVALID_FOREIGN_KEY';
    return mapped;
  }

  if (error.code === '23505') {
    let message = 'Duplicate data conflict.';
    if (error.constraint === 'uq_question_content_normalized') {
      message = 'This question already exists.';
    } else if (error.constraint === 'uq_rubric_criterion_name') {
      message = 'A criterion with this name already exists in the rubric.';
    }
    const mapped = new Error(message);
    mapped.statusCode = 409;
    mapped.code = 'DUPLICATE_DATA';
    return mapped;
  }

  if (error.code === '23514') {
    const mapped = new Error('Invalid data');
    mapped.statusCode = 400;
    mapped.code = 'CHECK_VIOLATION';
    return mapped;
  }

  if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', '57P01', '53300'].includes(error.code)) {
    const mapped = new Error('Database operation failed');
    mapped.statusCode = 503;
    mapped.code = 'DATABASE_UNAVAILABLE';
    return mapped;
  }

  const mapped = new Error('Database operation failed');
  mapped.statusCode = 500;
  mapped.code = 'DATABASE_ERROR';
  return mapped;
}

module.exports = {
  mapDbError,
};
