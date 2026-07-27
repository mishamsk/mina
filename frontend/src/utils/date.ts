export const localTodayISODate = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const localYearMonth = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

export const localCivilDate = (value: string): Date => {
  const [datePart = value] = value.split("T");
  const [year = "0", month = "1", day = "1"] = datePart.split("-");
  return new Date(Number(year), Number(month) - 1, Number(day));
};

export const localCivilDateStartISO = (value: string): string =>
  localCivilDate(value).toISOString();

const localTimestampDateValue = (value: string | null | undefined): string => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const lifecycleDayMarkerDateValue = (
  value: string | null | undefined,
): string => {
  if (!value) {
    return "";
  }

  const match = /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.0+)?Z$/.exec(value);
  if (!match) {
    return "";
  }

  const date = new Date(value);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === match[1]
    ? match[1]
    : "";
};

export const lifecycleTimestampDateValue = (
  value: string | null | undefined,
): string =>
  lifecycleDayMarkerDateValue(value) || localTimestampDateValue(value);

export const formatInstantTimestamp = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
};

export const formatLifecycleTimestamp = (value: string): string => {
  const dayMarker = lifecycleDayMarkerDateValue(value);
  if (dayMarker) {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(value));
  }

  return formatInstantTimestamp(value);
};

export const formatLocalCivilDate = (value: string): string => {
  const date = localCivilDate(value);
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(date);
};

export const formatLocalCivilDateParts = (
  value: string,
): { readonly day: string; readonly year: string } => {
  const date = localCivilDate(value);
  return {
    day: new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
    }).format(date),
    year: new Intl.DateTimeFormat(undefined, {
      year: "numeric",
    }).format(date),
  };
};
