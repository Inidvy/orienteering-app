import type { AgeBand, CompetitionClass, Gender } from "./types";

/*
 * Class = gender x age band, derived at run date (decision P7-D13-A).
 *
 *   age <14 ──▶ U14
 *   age <18 ──▶ U18
 *   age <40 ──▶ Elite   (the open adult class, orienteering's 21E)
 *   age <60 ──▶ O40
 *   else    ──▶ O60
 *
 * Age uses calendar-year arithmetic (orienteering convention: your class for
 * the whole year is set by the year you were born, not your birthday).
 */
export function ageBand(birthYear: number, runDate: Date): AgeBand {
  const age = runDate.getUTCFullYear() - birthYear;
  if (age < 14) return "U14";
  if (age < 18) return "U18";
  if (age < 40) return "Elite";
  if (age < 60) return "O40";
  return "O60";
}

export function classOf(
  birthYear: number,
  gender: Gender,
  runDate: Date,
): CompetitionClass {
  return `${gender}-${ageBand(birthYear, runDate)}`;
}
