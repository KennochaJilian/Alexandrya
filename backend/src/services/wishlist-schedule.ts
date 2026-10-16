// Calendar conversion uses Paris local time, including summer/winter clock changes.
function parisParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const get = (name: string) => Number(parts.find(part => part.type === name)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}
export function nextWishlistDigest(now: Date): Date {
  const local = parisParts(now);
  const tomorrow = local.hour * 60 + local.minute >= 18 * 60 + 30 ? 1 : 0;
  const target = Date.UTC(local.year, local.month - 1, local.day + tomorrow, 18, 30);
  let candidate = target;
  for (let i = 0; i < 3; i++) {
    const parts = parisParts(new Date(candidate));
    const displayed = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    candidate += target - displayed;
  }
  return new Date(candidate);
}
