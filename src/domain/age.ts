export function ageAtEvent(birthdate: string, startsAt: string | undefined): number | null {
  const birth = birthdate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const event = startsAt?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!birth || !event) return null;
  let age = Number(event[1]) - Number(birth[1]);
  if (Number(event[2]) < Number(birth[2]) || (event[2] === birth[2] && Number(event[3]) < Number(birth[3]))) age -= 1;
  return age;
}
