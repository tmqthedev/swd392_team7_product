import {
  FLUENCY,
  GENERATION_STATUS,
  QUESTION_SOURCE,
  QUESTION_STATUS,
  SLOT_STATUS,
  TURN_TYPE,
} from '../constants/enums';

let questionSeq = 5;
let rubricSeq = 3;
let criterionSeq = 7;
let requestSeq = 1;

export const store = {
  courses: [
    { id: 'C01', code: 'PRJ301', name: 'Java Programming' },
    { id: 'C02', code: 'DBI202', name: 'Database Systems' },
  ],
  topics: [
    { id: 'T01', courseId: 'C01', name: 'Object-Oriented Programming' },
    { id: 'T02', courseId: 'C01', name: 'Collections and Generics' },
    { id: 'T03', courseId: 'C02', name: 'Normalization' },
  ],
  materials: [
    {
      id: 'M01',
      topicId: 'T01',
      title: 'Week 3 lecture slides — OOP in Java',
      excerpt: 'Encapsulation hides internal state behind accessors. Inheritance reuses type hierarchies.',
    },
    {
      id: 'M02',
      topicId: 'T03',
      title: 'Database textbook ch.4 — Normal forms',
      excerpt: '3NF requires that non-key attributes depend only on the candidate key.',
    },
  ],
  rubrics: [
    {
      id: 'R1',
      name: 'OOP oral rubric',
      criteria: [
        { id: 'CR1', name: 'Accuracy', maxScore: 5 },
        { id: 'CR2', name: 'Clarity', maxScore: 3 },
        { id: 'CR3', name: 'Terminology', maxScore: 2 },
      ],
    },
    {
      id: 'R2',
      name: 'Database oral rubric',
      criteria: [
        { id: 'CR4', name: 'Completeness', maxScore: 4 },
        { id: 'CR5', name: 'Technical depth', maxScore: 6 },
      ],
    },
  ],
  questions: [
    {
      id: 'Q001',
      content: 'Explain the principles of OOP in Java.',
      status: QUESTION_STATUS.APPROVED,
      source: QUESTION_SOURCE.LECTURER,
      bloomLevel: 'understand',
      topicId: 'T01',
      courseId: 'C01',
      rubricId: 'R1',
      citation: {
        materialId: 'M01',
        materialTitle: 'Week 3 lecture slides — OOP in Java',
        excerpt: 'Encapsulation, inheritance, polymorphism, and abstraction.',
      },
      rejectReason: null,
    },
    {
      id: 'Q002',
      content: 'What is the difference between a process and a thread?',
      status: QUESTION_STATUS.PENDING_REVIEW,
      source: QUESTION_SOURCE.LECTURER,
      bloomLevel: 'understand',
      topicId: 'T01',
      courseId: 'C01',
      rubricId: null,
      citation: null,
      rejectReason: null,
    },
    {
      id: 'Q003',
      content: 'How does encapsulation protect object state in a Java class?',
      status: QUESTION_STATUS.PENDING_REVIEW,
      source: QUESTION_SOURCE.AI,
      bloomLevel: 'apply',
      topicId: 'T01',
      courseId: 'C01',
      rubricId: null,
      citation: {
        materialId: 'M01',
        materialTitle: 'Week 3 lecture slides — OOP in Java',
        excerpt: 'Encapsulation hides internal state behind accessors.',
      },
      rejectReason: null,
    },
    {
      id: 'Q004',
      content: 'Why might a relation that is in 2NF still violate 3NF?',
      status: QUESTION_STATUS.APPROVED,
      source: QUESTION_SOURCE.AI,
      bloomLevel: 'analyze',
      topicId: 'T03',
      courseId: 'C02',
      rubricId: 'R2',
      citation: {
        materialId: 'M02',
        materialTitle: 'Database textbook ch.4 — Normal forms',
        excerpt: '3NF requires that non-key attributes depend only on the candidate key.',
      },
      rejectReason: null,
    },
  ],
  generationRequests: [],
  sessions: [
    {
      id: 'S001',
      studentName: 'Jane Doe',
      studentId: 'SE150123',
      exam: 'Java Programming Viva',
      date: '2026-09-25',
      status: SLOT_STATUS.PENDING_REVIEW,
      duration: '18 min',
      aiScore: 8.5,
      lecturerScore: null,
    },
    {
      id: 'S002',
      studentName: 'John Smith',
      studentId: 'SE150124',
      exam: 'Database Systems Viva',
      date: '2026-09-26',
      status: SLOT_STATUS.APPROVED,
      duration: '16 min',
      aiScore: 9.0,
      lecturerScore: 9.0,
    },
    {
      id: 'S003',
      studentName: 'Alice Johnson',
      studentId: 'SE150125',
      exam: 'Java Programming Viva',
      date: '2026-09-26',
      status: SLOT_STATUS.PENDING_REVIEW,
      duration: '21 min',
      aiScore: 7.0,
      lecturerScore: null,
    },
  ],
  evaluations: {
    S001: createEvaluation('S001', {
      name: 'Jane Doe',
      studentId: 'SE150123',
      exam: 'Java Programming Viva',
      rubricId: 'R1',
      aiOverall: 8.5,
      lecturerOverall: null,
      status: SLOT_STATUS.PENDING_REVIEW,
      criteriaScores: [
        { criterionId: 'CR1', name: 'Accuracy', maxScore: 5, aiScore: 4.5, lecturerScore: null, evidence: 'Named the four OOP principles correctly.' },
        { criterionId: 'CR2', name: 'Clarity', maxScore: 3, aiScore: 2.0, lecturerScore: null, evidence: 'Encapsulation answer is brief and lacks an example.' },
        { criterionId: 'CR3', name: 'Terminology', maxScore: 2, aiScore: 2.0, lecturerScore: null, evidence: 'Uses standard Java terms.' },
      ],
      strengths: ['Correctly lists encapsulation, inheritance, polymorphism, and abstraction.', 'Uses Java field/method vocabulary accurately.'],
      weaknesses: ['Encapsulation explanation stays at definition level.'],
      missingPoints: ['No concrete class example for private fields and accessors.'],
      signals: { avgAnswerSeconds: 38, fluency: FLUENCY.ADEQUATE },
      lecturerReason: '',
      turns: [
        {
          turnId: 'TN1',
          turn: 1,
          type: TURN_TYPE.MAIN,
          parentTurnId: null,
          reason: null,
          q: 'Explain the principles of Object-Oriented Programming (OOP) in Java.',
          a: 'OOP in Java is based on four main principles: Encapsulation, Inheritance, Polymorphism, and Abstraction. These principles allow us to create modular and reusable code.',
          durationSeconds: 41,
          audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        },
        {
          turnId: 'TN2',
          turn: 2,
          type: TURN_TYPE.FOLLOW_UP,
          parentTurnId: 'TN1',
          reason: 'Clarify encapsulation with a Java implementation example.',
          q: 'You mentioned Encapsulation. Can you explain how it is implemented in Java and why it is useful?',
          a: 'Encapsulation is implemented using private fields and public getter/setter methods. It protects the data from unauthorized access and modification.',
          durationSeconds: 35,
          audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
        },
      ],
    }),
    S002: createEvaluation('S002', {
      name: 'John Smith',
      studentId: 'SE150124',
      exam: 'Database Systems Viva',
      rubricId: 'R2',
      aiOverall: 9.0,
      lecturerOverall: 9.0,
      status: SLOT_STATUS.APPROVED,
      criteriaScores: [
        { criterionId: 'CR4', name: 'Completeness', maxScore: 4, aiScore: 3.5, lecturerScore: 3.5, evidence: 'Covered 1NF through 3NF.' },
        { criterionId: 'CR5', name: 'Technical depth', maxScore: 6, aiScore: 5.5, lecturerScore: 5.5, evidence: 'Explained transitive dependency with an example.' },
      ],
      strengths: ['Clear walkthrough of normal forms.', 'Used a worked example.'],
      weaknesses: ['Did not mention Boyce–Codd.'],
      missingPoints: [],
      signals: { avgAnswerSeconds: 44, fluency: FLUENCY.FLUENT },
      lecturerReason: 'Confirmed AI suggestion.',
      turns: [
        {
          turnId: 'TN3',
          turn: 1,
          type: TURN_TYPE.MAIN,
          parentTurnId: null,
          reason: null,
          q: 'Why might a relation that is in 2NF still violate 3NF?',
          a: 'Because a non-key attribute can still depend on another non-key attribute. That transitive dependency violates 3NF.',
          durationSeconds: 44,
          audioUrl: '',
        },
      ],
    }),
    S003: createEvaluation('S003', {
      name: 'Alice Johnson',
      studentId: 'SE150125',
      exam: 'Java Programming Viva',
      rubricId: 'R1',
      aiOverall: 7.0,
      lecturerOverall: null,
      status: SLOT_STATUS.PENDING_REVIEW,
      criteriaScores: [
        { criterionId: 'CR1', name: 'Accuracy', maxScore: 5, aiScore: 3.5, lecturerScore: null, evidence: 'Named three principles; omitted abstraction.' },
        { criterionId: 'CR2', name: 'Clarity', maxScore: 3, aiScore: 2.0, lecturerScore: null, evidence: 'Answer is understandable but loosely structured.' },
        { criterionId: 'CR3', name: 'Terminology', maxScore: 2, aiScore: 1.5, lecturerScore: null, evidence: 'Mixes “method” and “function”.' },
      ],
      strengths: ['Gave a practical inheritance example.'],
      weaknesses: ['Missed abstraction.', 'Terminology is inconsistent.'],
      missingPoints: ['No discussion of polymorphism in method overriding.'],
      signals: { avgAnswerSeconds: 52, fluency: FLUENCY.HESITANT },
      lecturerReason: '',
      turns: [
        {
          turnId: 'TN4',
          turn: 1,
          type: TURN_TYPE.MAIN,
          parentTurnId: null,
          reason: null,
          q: 'Explain the principles of Object-Oriented Programming (OOP) in Java.',
          a: 'OOP uses classes and objects. Inheritance lets a child class reuse a parent. Encapsulation keeps variables private.',
          durationSeconds: 52,
          audioUrl: '',
        },
      ],
    }),
  },
};

function createEvaluation(slotId, rest) {
  return { slotId, ...rest };
}

export function nextQuestionId() {
  questionSeq += 1;
  return `Q${String(questionSeq).padStart(3, '0')}`;
}

export function nextRubricId() {
  rubricSeq += 1;
  return `R${rubricSeq}`;
}

export function nextCriterionId() {
  criterionSeq += 1;
  return `CR${criterionSeq}`;
}

export function nextRequestId() {
  requestSeq += 1;
  return `GEN${String(requestSeq).padStart(3, '0')}`;
}

export function rubricMaxScore(rubric) {
  return (rubric?.criteria || []).reduce((sum, item) => sum + Number(item.maxScore || 0), 0);
}

export function findTopic(topicId) {
  return store.topics.find((topic) => topic.id === topicId) || null;
}

export function findCourse(courseId) {
  return store.courses.find((course) => course.id === courseId) || null;
}

export function findRubric(rubricId) {
  return store.rubrics.find((rubric) => rubric.id === rubricId) || null;
}

export function findMaterial(materialId) {
  return store.materials.find((material) => material.id === materialId) || null;
}

export { GENERATION_STATUS };
