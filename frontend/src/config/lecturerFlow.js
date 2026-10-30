import { BookOpen, CalendarPlus, CheckSquare, ClipboardList, FileText, Inbox, Layers } from 'lucide-react';

// Lecturer tabs in working order: finishing steps 1-5 yields an approved
// question bank; steps 6-7 run and grade the exam. Each step depends on the
// previous ones (questions need a topic and a rubric, AI generation needs
// READY materials, exams draw only APPROVED questions). Used by the sidebar
// and by WorkflowNext at the top of each step's page.
export const LECTURER_FLOW = [
  {
    title: 'Question bank',
    items: [
      { step: 1, to: '/lecturer/topics', icon: Layers, label: 'Topics', doneHint: 'Topics are ready. Next, upload course materials for AI generation.' },
      { step: 2, to: '/lecturer/materials', icon: FileText, label: 'Materials', doneHint: 'Materials are READY. Next, create the rubrics used to grade answers.' },
      { step: 3, to: '/lecturer/rubrics', icon: CheckSquare, label: 'Rubrics', doneHint: 'Rubrics exist. Next, add, import or generate questions.' },
      { step: 4, to: '/lecturer/questions', icon: BookOpen, label: 'Questions', doneHint: 'Questions exist. Next, review the AI drafts and approve them with a rubric.' },
      { step: 5, to: '/lecturer/pending-review', icon: Inbox, label: 'Pending review', doneHint: 'Nothing left to review. The question bank is ready; next, set up an exam session.' },
    ],
  },
  {
    title: 'Exams',
    items: [
      { step: 6, to: '/lecturer/exam-sessions', icon: CalendarPlus, label: 'Exam sessions', doneHint: 'An exam is scheduled. After it runs, review and grade the results.' },
      { step: 7, to: '/lecturer/sessions', icon: ClipboardList, label: 'Results & grading', alsoActive: '/lecturer/evaluation' },
    ],
  },
];

export const LECTURER_STEPS = LECTURER_FLOW.flatMap((section) => section.items);
