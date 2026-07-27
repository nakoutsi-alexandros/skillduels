export const pad2 = (value) => String(value).padStart(2, "0");

export const utcDayKey = (value = Date.now()) => {
  const date = new Date(value);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
};

export const utcSeasonKey = (value = Date.now()) => {
  const date = new Date(value);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
};

export const utcSeasonEnd = (value = Date.now()) => {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
};

export const utcSeasonName = (value = Date.now(), locale = "en-US") =>
  new Date(value).toLocaleString(locale, { month: "long", timeZone: "UTC" });

export const utcStreak = (referenceDay, playedDays = []) => {
  const days = playedDays instanceof Set ? playedDays : new Set(playedDays);
  const cursor = new Date(`${referenceDay}T00:00:00.000Z`);
  if (!Number.isFinite(cursor.getTime())) return 0;

  // A player's existing streak remains visible before their first game today.
  if (!days.has(referenceDay)) cursor.setUTCDate(cursor.getUTCDate() - 1);

  let streak = 0;
  while (days.has(utcDayKey(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
};
