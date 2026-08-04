const padDatePart = (value: number, length = 2): string =>
  value.toString().padStart(length, "0");

const timestampFraction = (value: string): string => {
  const match = value.match(/\.\d+(?=Z$|[+-]\d{2}:?\d{2}$|$)/);
  return match?.[0].slice(0, 4) ?? "";
};

export const localSettlementDateTimeValue = (
  value: string | null | undefined,
): string => {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return `${padDatePart(parsed.getFullYear(), 4)}-${padDatePart(
    parsed.getMonth() + 1,
  )}-${padDatePart(parsed.getDate())}T${padDatePart(
    parsed.getHours(),
  )}:${padDatePart(parsed.getMinutes())}:${padDatePart(
    parsed.getSeconds(),
  )}${timestampFraction(value)}`;
};

export const defaultPostSettlementDateTimeValue = (): {
  readonly dateTime: string;
  readonly sourceDate: string;
} => {
  const sourceDate = new Date().toISOString();
  return {
    dateTime: localSettlementDateTimeValue(sourceDate),
    sourceDate,
  };
};

export const settlementDateTimeToISO = (
  dateTime: string,
  sourceDate?: string | null,
): string | undefined => {
  const trimmed = dateTime.trim();
  if (!trimmed) {
    return undefined;
  }
  if (sourceDate && localSettlementDateTimeValue(sourceDate) === trimmed) {
    return sourceDate;
  }
  const match = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?$/,
  );
  if (!match) {
    return undefined;
  }
  const [, year, month, day, hours, minutes, seconds = "0", fraction = ""] =
    match;
  const milliseconds = fraction
    ? Number(fraction.slice(1, 4).padEnd(3, "0"))
    : 0;
  const expected = {
    day: Number(day),
    hours: Number(hours),
    milliseconds,
    minutes: Number(minutes),
    month: Number(month) - 1,
    seconds: Number(seconds),
    year: Number(year),
  };
  const parsed = new Date(
    expected.year,
    expected.month,
    expected.day,
    expected.hours,
    expected.minutes,
    expected.seconds,
    expected.milliseconds,
  );
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== expected.year ||
    parsed.getMonth() !== expected.month ||
    parsed.getDate() !== expected.day ||
    parsed.getHours() !== expected.hours ||
    parsed.getMinutes() !== expected.minutes ||
    parsed.getSeconds() !== expected.seconds ||
    parsed.getMilliseconds() !== expected.milliseconds
  ) {
    return undefined;
  }
  const iso = parsed.toISOString();
  return fraction ? `${iso.slice(0, 19)}${fraction}Z` : iso;
};
