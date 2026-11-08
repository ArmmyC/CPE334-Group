const bangkokDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// The due date of a loan (BR-05, SDS 8): the Asia/Bangkok calendar date of `now` plus whole
// days. The date is read in the Asia/Bangkok zone and the days are added to the plain year,
// month, and day, and the result is midnight UTC of that date, which Prisma stores as a `date`.
// No step uses the process time zone.
export function dueDateFor(now: Date, loanPeriodDays: number): Date {
  const parts = Object.fromEntries(
    bangkokDate.formatToParts(now).map(({ type, value }) => [type, Number(value)]),
  );
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day + loanPeriodDays));
}
