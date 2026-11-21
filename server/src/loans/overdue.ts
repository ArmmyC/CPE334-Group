const bangkokDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// F-10 (BR-09, NFR-08): a loan is overdue when today's Asia/Bangkok calendar date is after its
// due date. On the due date it is not overdue. `dueDate` is the `date` column, read as midnight
// UTC of that calendar date (see due-date.ts), so both sides compare as YYYY-MM-DD strings and
// no step uses the process time zone. Overdue is calculated on read and never stored.
export function isOverdue(dueDate: Date, now: Date): boolean {
  return bangkokDate.format(now) > dueDate.toISOString().slice(0, 10);
}
