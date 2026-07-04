export const currencyDisplayMarker = (currency: string): string => {
  const normalizedCurrency = currency.toUpperCase();
  if (normalizedCurrency.startsWith("C::")) {
    return normalizedCurrency;
  }

  try {
    const formatter = new Intl.NumberFormat(undefined, {
      currency: normalizedCurrency,
      currencyDisplay: "narrowSymbol",
      style: "currency",
    });
    const marker = formatter
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value;
    if (
      marker &&
      marker !== "¤" &&
      marker.toUpperCase() !== normalizedCurrency
    ) {
      return marker;
    }
  } catch {
    return normalizedCurrency;
  }

  return normalizedCurrency;
};
