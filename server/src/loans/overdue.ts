// F-10 (BR-09, NFR-08): a loan is overdue when today's Asia/Bangkok date is after its due date.
// Placeholder so the red run fails on behavior; the real rule follows in the next commit.
export function isOverdue(_dueDate: Date, _now: Date): boolean {
  return false;
}
