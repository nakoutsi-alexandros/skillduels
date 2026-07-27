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
