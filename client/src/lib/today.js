// "Today", in Lagos.
//
// `new Date().toISOString().slice(0, 10)` returns the UTC date. Nigeria is
// UTC+1, so between midnight and 1am Lagos time that expression returns
// YESTERDAY. Everything keyed on it is wrong for that hour every single night:
// the attendance board shows the previous day, a leave request starting
// "tomorrow" is rejected as being in the past, a task due today reads overdue,
// and a journal entry defaults to the wrong date.
//
// It is a small window, but it is the window in which night-shift staff clock
// in — which is precisely the workforce the attendance module was built for.
//
// The suite is Nigeria-first and every tenant is Nigerian today. When a second
// country's rule pack arrives, this reads the organisation's timezone instead;
// the point of routing every caller through one function is that the change
// happens here and nowhere else.
export const LAGOS = 'Africa/Lagos';

// en-CA formats as YYYY-MM-DD, which is the shape the database wants.
export const todayISO = (tz = LAGOS) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());

// The same, for any instant — use when deciding which local day a timestamp
// belongs to, rather than which day it is now.
export const localDayISO = (d, tz = LAGOS) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(d instanceof Date ? d : new Date(d));

// First day of the current month, in Lagos.
export const monthStartISO = (tz = LAGOS) => `${todayISO(tz).slice(0, 7)}-01`;

// First day of the current year, in Lagos.
export const yearStartISO = (tz = LAGOS) => `${todayISO(tz).slice(0, 4)}-01-01`;
