// GIẢ ĐỊNH: enum bám ERD; camelCase để FE/BE thống nhất khi nối API.

export const QUESTION_STATUS = {
  PENDING_REVIEW: 'pending_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

export const QUESTION_STATUS_LABEL = {
  pending_review: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
};

export const QUESTION_SOURCE = {
  LECTURER: 'lecturer',
  AI: 'ai',
  IMPORT: 'import',
};

export const QUESTION_SOURCE_LABEL = {
  lecturer: 'Lecturer',
  ai: 'AI',
  import: 'Import',
};

export const BLOOM_LEVELS = [
  { value: 'remember', label: 'Remember' },
  { value: 'understand', label: 'Understand' },
  { value: 'apply', label: 'Apply' },
  { value: 'analyze', label: 'Analyze' },
];

export const BLOOM_LABEL = Object.fromEntries(BLOOM_LEVELS.map((item) => [item.value, item.label]));

export const GENERATION_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

export const SLOT_STATUS = {
  READY: 'ready',
  IN_PROGRESS: 'in_progress',
  PENDING_REVIEW: 'pending_review',
  APPROVED: 'approved',
};

export const TURN_TYPE = {
  MAIN: 'main',
  FOLLOW_UP: 'follow_up',
};

export const FLUENCY = {
  HESITANT: 'hesitant',
  ADEQUATE: 'adequate',
  FLUENT: 'fluent',
};
