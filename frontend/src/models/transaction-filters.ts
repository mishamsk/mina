import type {
  RecordRole,
  TransactionClass,
  TransactionLifecycleStatus,
  TransactionSettlement,
  TransactionShapeType,
} from "@/api/generated";

export const transactionLifecycleStatuses = [
  "active",
  "expected",
  "cancelled",
] as const satisfies readonly TransactionLifecycleStatus[];

export const transactionSettlements = [
  "pending",
  "posted",
  "mixed",
  "not_applicable",
] as const satisfies readonly TransactionSettlement[];

export const transactionClasses = [
  "spend",
  "income",
  "refund",
  "clawback",
  "transfer",
  "currency_exchange",
  "adjustment",
  "mixed",
] as const satisfies readonly TransactionClass[];

export const transactionShapes = [
  "spend",
  "refund",
  "income",
  "clawback",
  "adjustment",
  "exchange",
  "transfer",
] as const satisfies readonly TransactionShapeType[];

export const recordRoles = [
  "expense",
  "refund",
  "income",
  "clawback",
  "exchange",
  "adjustment",
  "balance",
] as const satisfies readonly RecordRole[];

export const transactionFilterDecimalPattern = /^-?(?:\d{1,10})(?:\.\d{1,8})?$/;
export const transactionFilterCurrencyPattern = /^(?:[A-Z]{3}|C::.+)$/;
export const transactionFilterDatePattern =
  /^(?:\d{4}-\d{2}-\d{2}|[+-]\d+(?:s|m|h|d|w|mo|y)|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:\d{2}))$/;

const transactionFilterMaxDepth = 10;

export type TransactionFilterOperator = ":" | "=" | ">" | ">=" | "<" | "<=";

export type TransactionFilterExpression =
  | {
      readonly kind: "and" | "or";
      readonly terms: readonly TransactionFilterExpression[];
    }
  | {
      readonly kind: "not";
      readonly term: TransactionFilterExpression;
    }
  | {
      readonly kind: "term";
      readonly field: string;
      readonly operator: TransactionFilterOperator;
      readonly scoped?: boolean;
      readonly value: string;
    };

export type TransactionFilterMembershipField =
  | "account"
  | "category"
  | "tag"
  | "member"
  | "currency"
  | "role"
  | "class"
  | "lifecycle"
  | "settlement"
  | "shape";

export type TransactionFilterMembershipMode = "any" | "all" | "none";

export type TransactionFilterChip =
  | {
      readonly field: TransactionFilterMembershipField;
      readonly kind: "membership";
      readonly mode: TransactionFilterMembershipMode;
      readonly scopedValues?: readonly string[];
      readonly values: readonly string[];
    }
  | {
      readonly field: "amount" | "amount_usd" | "initiated";
      readonly from?: string;
      readonly kind: "range";
      readonly to?: string;
    };

export interface TransactionFilterRow {
  readonly chips: readonly TransactionFilterChip[];
}

export interface TransactionFilters {
  readonly classes: readonly TransactionClass[];
  readonly expression?: TransactionFilterExpression;
  readonly filterText?: string;
  readonly search?: string;
}

export const emptyTransactionFilters: TransactionFilters = {
  classes: [],
};

const uniqueAllowedValues = <T extends string>(
  values: readonly T[],
  allowed: readonly T[],
): readonly T[] => {
  const allowedSet = new Set<T>(allowed);
  const selectedSet = new Set(values.filter((value) => allowedSet.has(value)));
  return allowed.filter((value) => selectedSet.has(value));
};

const trimmedValue = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const uniqueSortedStrings = (values: readonly string[]): readonly string[] =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right),
  );

export const normalizeTransactionFilterCurrency = (value: string): string => {
  const trimmed = value.trim();
  return trimmed.slice(0, 3).toUpperCase() === "C::"
    ? `C::${trimmed.slice(3)}`
    : trimmed.toUpperCase();
};

const uniqueSortedCurrencies = (values: readonly string[]): readonly string[] =>
  [...new Set(values.map(normalizeTransactionFilterCurrency))].sort(
    (left, right) => left.localeCompare(right),
  );

const term = (
  field: string,
  operator: TransactionFilterOperator,
  value: string,
  scoped = false,
): TransactionFilterExpression => ({
  field,
  kind: "term",
  operator,
  ...(scoped ? { scoped } : {}),
  value,
});

const joinedExpression = (
  kind: "and" | "or",
  terms: readonly (TransactionFilterExpression | undefined)[],
): TransactionFilterExpression | undefined => {
  const present = terms.filter(
    (candidate): candidate is TransactionFilterExpression =>
      candidate !== undefined,
  );
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  return { kind, terms: present };
};

const membershipFields = new Set<TransactionFilterMembershipField>([
  "account",
  "category",
  "tag",
  "member",
  "currency",
  "role",
  "class",
  "lifecycle",
  "settlement",
  "shape",
]);

const entityMembershipFields = new Set<TransactionFilterMembershipField>([
  "account",
  "category",
  "tag",
  "member",
]);

const multiValueMembershipFields = new Set<TransactionFilterMembershipField>([
  "account",
  "category",
  "tag",
  "member",
  "currency",
  "role",
  "shape",
]);

const membershipAllowedValues = new Map<
  TransactionFilterMembershipField,
  readonly string[]
>([
  ["class", transactionClasses],
  ["lifecycle", transactionLifecycleStatuses],
  ["role", recordRoles],
  ["settlement", transactionSettlements],
  ["shape", transactionShapes],
]);

const normalizedMembershipValues = (
  field: TransactionFilterMembershipField,
  values: readonly string[],
): readonly string[] => {
  const normalized =
    field === "currency"
      ? uniqueSortedCurrencies(values)
      : uniqueSortedStrings(values);
  const allowed = membershipAllowedValues.get(field);
  return allowed
    ? normalized.filter((value) => allowed.includes(value))
    : normalized;
};

const expressionFromFilterChip = (
  chip: TransactionFilterChip,
): TransactionFilterExpression | undefined => {
  if (chip.kind === "range") {
    return joinedExpression("and", [
      chip.from ? term(chip.field, ">=", chip.from) : undefined,
      chip.to ? term(chip.field, "<=", chip.to) : undefined,
    ]);
  }
  const values = normalizedMembershipValues(chip.field, chip.values);
  if (values.length === 0) return undefined;
  const terms = values.map((value) =>
    term(chip.field, ":", value, chip.scopedValues?.includes(value)),
  );
  const positive: TransactionFilterExpression =
    terms.length === 1
      ? chip.mode === "all"
        ? {
            kind: "and",
            terms: [{ kind: "and", terms: [terms[0]!] }],
          }
        : terms[0]!
      : { kind: chip.mode === "all" ? "and" : "or", terms };
  return chip.mode === "none" ? { kind: "not", term: positive } : positive;
};

const normalizedFilterRows = (
  rows: readonly TransactionFilterRow[],
): readonly TransactionFilterRow[] =>
  rows.map((row) => ({
    chips: row.chips.reduce<TransactionFilterChip[]>((chips, chip) => {
      if (chip.kind === "range") {
        const from = trimmedValue(chip.from);
        const to = trimmedValue(chip.to);
        if (from || to) chips.push({ ...chip, from, to });
        return chips;
      }
      const values = normalizedMembershipValues(chip.field, chip.values);
      if (values.length > 0) {
        const scopedValues = chip.scopedValues?.filter((value) =>
          values.includes(value),
        );
        chips.push({
          ...chip,
          ...(scopedValues?.length ? { scopedValues } : {}),
          values,
        });
      }
      return chips;
    }, []),
  }));

const transactionFilterRowExpressions = (
  rows: readonly TransactionFilterRow[],
): readonly TransactionFilterExpression[] =>
  normalizedFilterRows(rows).flatMap((row) => {
    const expressions = row.chips.flatMap((chip) => {
      const expression = expressionFromFilterChip(chip);
      return expression ? [expression] : [];
    });
    if (expressions.length === 0) return [];
    return [
      expressions.length === 1
        ? expressions[0]!
        : ({ kind: "and", terms: expressions } as const),
    ];
  });

const escapedFilterValue = (
  value: string,
  escapeExactScopeMarker = false,
): string => {
  let escaped = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (
      character === "\\" ||
      character === '"' ||
      (escapeExactScopeMarker &&
        character === "*" &&
        index === value.length - 1 &&
        (value === "*" || value.endsWith(":*")))
    ) {
      escaped += "\\";
    }
    escaped += character;
  }
  return escaped;
};

const quoteFilterValue = (
  value: string,
  escapeExactScopeMarker = false,
): string => {
  const escaped = escapedFilterValue(value, escapeExactScopeMarker);
  return value === "" || /[\s()":\\]/.test(value) || escaped !== value
    ? `"${escaped}"`
    : escaped;
};

const serializeTransactionFilterExpression = (
  expression: TransactionFilterExpression,
): string => {
  switch (expression.kind) {
    case "term":
      return `${expression.field}${expression.operator}${quoteFilterValue(
        expression.value,
        expression.operator === ":" &&
          !expression.scoped &&
          (expression.field === "account" ||
            expression.field === "category" ||
            expression.field === "tag"),
      )}`;
    case "not":
      return `not ${serializeTransactionFilterExpression(expression.term)}`;
    default:
      return `(${expression.terms.map(serializeTransactionFilterExpression).join(` ${expression.kind} `)})`;
  }
};

type FilterToken =
  | { readonly kind: "and" | "or" | "not" | "lparen" | "rparen" }
  | { readonly kind: "word"; readonly text: string };

const tokenizeFilterExpression = (
  text: string,
): readonly FilterToken[] | undefined => {
  const tokens: FilterToken[] = [];
  let position = 0;
  while (position < text.length) {
    const character = text[position]!;
    if (/\s/.test(character)) {
      position += 1;
      continue;
    }
    if (character === "(") {
      tokens.push({ kind: "lparen" });
      position += 1;
      continue;
    }
    if (character === ")") {
      tokens.push({ kind: "rparen" });
      position += 1;
      continue;
    }
    const start = position;
    while (
      position < text.length &&
      !/\s/.test(text[position]!) &&
      text[position] !== "(" &&
      text[position] !== ")" &&
      !":=><".includes(text[position]!)
    ) {
      position += 1;
    }
    const fieldEnd = position;
    while (/\s/.test(text[position] ?? "")) position += 1;
    if (!":=><".includes(text[position] ?? "")) {
      if (fieldEnd === start) return undefined;
      const word = text.slice(start, fieldEnd);
      const keyword = word.toLowerCase();
      if (keyword === "and" || keyword === "or" || keyword === "not") {
        tokens.push({ kind: keyword });
      } else {
        tokens.push({ kind: "word", text: word });
      }
      position = fieldEnd;
      continue;
    }
    const operator = text[position]!;
    position += 1;
    if ((operator === ">" || operator === "<") && text[position] === "=") {
      position += 1;
    }
    while (/\s/.test(text[position] ?? "")) position += 1;
    if (text[position] === '"') {
      let closed = false;
      position += 1;
      while (position < text.length) {
        if (text[position] === "\\") {
          if (position + 1 >= text.length) return undefined;
          position += 2;
          continue;
        }
        if (text[position] === '"') {
          position += 1;
          closed = true;
          break;
        }
        position += 1;
      }
      if (!closed) return undefined;
    }
    while (
      position < text.length &&
      !/\s/.test(text[position]!) &&
      text[position] !== "(" &&
      text[position] !== ")"
    ) {
      position += 1;
    }
    const word = text.slice(start, position);
    const keyword = word.toLowerCase();
    if (keyword === "and" || keyword === "or" || keyword === "not") {
      tokens.push({ kind: keyword });
    } else {
      tokens.push({ kind: "word", text: word });
    }
  }
  return tokens;
};

const splitFilterTerm = (
  text: string,
):
  | {
      readonly field: string;
      readonly operator: TransactionFilterOperator;
      readonly rawValue: string;
    }
  | undefined => {
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (quoted) {
      if (character === "\\") index += 1;
      continue;
    }
    if (character === ":" || character === "=") {
      return {
        field: text.slice(0, index).trim(),
        operator: character,
        rawValue: text.slice(index + 1).trim(),
      };
    }
    if (character === ">" || character === "<") {
      const inclusive = text[index + 1] === "=";
      return {
        field: text.slice(0, index).trim(),
        operator:
          `${character}${inclusive ? "=" : ""}` as TransactionFilterOperator,
        rawValue: text.slice(index + (inclusive ? 2 : 1)).trim(),
      };
    }
  }
  return undefined;
};

const decodeFilterValue = (rawValue: string): string | undefined => {
  const wrapped = rawValue.startsWith('"') && rawValue.endsWith('"');
  if (!wrapped) return rawValue.includes('"') ? undefined : rawValue;
  const value = rawValue.slice(1, -1);
  let decoded = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (character === '"') return undefined;
    if (character !== "\\") {
      decoded += character;
      continue;
    }
    const escape = value[++index];
    if (!escape) return undefined;
    if (escape !== "\\" && escape !== '"' && escape !== "*") return undefined;
    decoded += escape;
  }
  return decoded;
};

const filterValueHasScopeMarker = (rawValue: string): boolean => {
  const value =
    rawValue.startsWith('"') && rawValue.endsWith('"')
      ? rawValue.slice(1, -1)
      : rawValue;
  return value === "*" || (value.endsWith(":*") && !value.endsWith(":\\*"));
};

const singleGroupedMembershipTerm = (
  expression: TransactionFilterExpression,
): boolean => {
  if (expression.kind === "term") {
    return (
      expression.operator === ":" &&
      multiValueMembershipFields.has(
        expression.field as TransactionFilterMembershipField,
      )
    );
  }
  return (
    expression.kind === "and" &&
    expression.terms.length === 1 &&
    singleGroupedMembershipTerm(expression.terms[0]!)
  );
};

const parseTransactionFilterExpression = (
  text: string,
): TransactionFilterExpression | undefined => {
  const tokens = tokenizeFilterExpression(text);
  if (!tokens || tokens.length === 0) return undefined;
  let position = 0;
  const peek = (): FilterToken | undefined => tokens[position];
  const parseOr = (depth: number): TransactionFilterExpression | undefined => {
    const terms: TransactionFilterExpression[] = [];
    const first = parseAnd(depth);
    if (!first) return undefined;
    terms.push(first);
    while (peek()?.kind === "or") {
      position += 1;
      const next = parseAnd(depth);
      if (!next) return undefined;
      terms.push(next);
    }
    return joinedExpression("or", terms);
  };
  const parseAnd = (depth: number): TransactionFilterExpression | undefined => {
    const terms: TransactionFilterExpression[] = [];
    const first = parseUnary(depth);
    if (!first) return undefined;
    terms.push(first);
    while (peek()?.kind === "and") {
      position += 1;
      const next = parseUnary(depth);
      if (!next) return undefined;
      terms.push(next);
    }
    return joinedExpression("and", terms);
  };
  const parseUnary = (
    depth: number,
  ): TransactionFilterExpression | undefined => {
    const token = tokens[position];
    if (!token) return undefined;
    position += 1;
    if (token.kind === "not") {
      const nested = parseUnary(depth);
      return nested ? { kind: "not", term: nested } : undefined;
    }
    if (token.kind === "lparen") {
      if (depth >= transactionFilterMaxDepth) return undefined;
      const nested = parseOr(depth + 1);
      if (!nested || tokens[position]?.kind !== "rparen") return undefined;
      position += 1;
      return singleGroupedMembershipTerm(nested)
        ? { kind: "and", terms: [nested] }
        : nested;
    }
    if (token.kind !== "word") return undefined;
    const split = splitFilterTerm(token.text);
    if (!split) return undefined;
    const quoted =
      split.rawValue.startsWith('"') && split.rawValue.endsWith('"');
    if (split.rawValue.includes(":") && !quoted) return undefined;
    const scoped =
      split.operator === ":" &&
      (split.field === "account" ||
        split.field === "category" ||
        split.field === "tag") &&
      filterValueHasScopeMarker(split.rawValue);
    const value = decodeFilterValue(split.rawValue);
    return value === undefined || (split.operator !== ":" && value === "")
      ? undefined
      : term(split.field, split.operator, value, scoped);
  };
  const expression = parseOr(0);
  return expression && position === tokens.length ? expression : undefined;
};

export const normalizeTransactionFilters = (
  filters: Partial<TransactionFilters> = {},
): TransactionFilters => {
  const hasSource = typeof filters.filterText === "string";
  const source = filters.filterText;
  const parseSource = source?.trim();
  const expression =
    filters.expression ??
    (parseSource ? parseTransactionFilterExpression(parseSource) : undefined);
  const search = trimmedValue(filters.search);
  return {
    classes: uniqueAllowedValues(filters.classes ?? [], transactionClasses),
    ...(expression ? { expression } : {}),
    ...(hasSource
      ? { filterText: source ?? "" }
      : expression
        ? { filterText: serializeTransactionFilterExpression(expression) }
        : {}),
    ...(search ? { search } : {}),
  };
};

export const withTransactionFilterExpression = (
  filters: TransactionFilters,
  expression: TransactionFilterExpression | undefined,
): TransactionFilters =>
  normalizeTransactionFilters({
    classes: filters.classes,
    expression,
    search: filters.search,
  });

export const withTransactionFilterRows = (
  filters: TransactionFilters,
  rows: readonly TransactionFilterRow[],
): TransactionFilters => {
  const rowExpressions = transactionFilterRowExpressions(rows);
  if (rowExpressions.length === 0) {
    return withTransactionFilterExpression(filters, undefined);
  }
  const expression: TransactionFilterExpression =
    rowExpressions.length === 1
      ? rowExpressions[0]!
      : { kind: "or", terms: rowExpressions };
  const filterText =
    rowExpressions.length === 1
      ? serializeTransactionFilterExpression(expression)
      : `(${rowExpressions
          .map((rowExpression) => {
            const serialized =
              serializeTransactionFilterExpression(rowExpression);
            return rowExpression.kind === "and" || rowExpression.kind === "or"
              ? serialized
              : `(${serialized})`;
          })
          .join(" or ")})`;
  return normalizeTransactionFilters({
    classes: filters.classes,
    expression,
    filterText,
    search: filters.search,
  });
};

type MembershipTerm = Extract<
  TransactionFilterExpression,
  { readonly kind: "term" }
>;

const membershipTerms = (
  expression: TransactionFilterExpression,
  kind: "and" | "or",
): readonly MembershipTerm[] | undefined => {
  const candidates = expression.kind === kind ? expression.terms : [expression];
  if (
    candidates.length === 0 ||
    candidates.some(
      (candidate) => candidate.kind !== "term" || candidate.operator !== ":",
    )
  ) {
    return undefined;
  }
  const terms = candidates as readonly MembershipTerm[];
  const field = terms[0]!.field as TransactionFilterMembershipField;
  if (
    !membershipFields.has(field) ||
    terms.some((candidate) => candidate.field !== field) ||
    (entityMembershipFields.has(field) &&
      terms.some((candidate) => candidate.value.trim() === ""))
  ) {
    return undefined;
  }
  const allowed = membershipAllowedValues.get(field);
  if (
    allowed &&
    terms.some((candidate) => !allowed.includes(candidate.value))
  ) {
    return undefined;
  }
  const scopeByValue = new Map<string, boolean>();
  for (const candidate of terms) {
    const scoped = Boolean(candidate.scoped);
    if (
      scopeByValue.has(candidate.value) &&
      scopeByValue.get(candidate.value) !== scoped
    ) {
      return undefined;
    }
    scopeByValue.set(candidate.value, scoped);
  }
  return terms;
};

const membershipChipFromExpression = (
  expression: TransactionFilterExpression,
):
  | Extract<TransactionFilterChip, { readonly kind: "membership" }>
  | undefined => {
  if (
    expression.kind === "and" &&
    expression.terms.length === 1 &&
    expression.terms[0]?.kind === "and"
  ) {
    return membershipChipFromExpression(expression.terms[0]);
  }
  if (expression.kind === "not") {
    const terms = membershipTerms(expression.term, "or");
    if (!terms) return undefined;
    return {
      field: terms[0]!.field as TransactionFilterMembershipField,
      kind: "membership",
      mode: "none",
      scopedValues: terms
        .filter((candidate) => candidate.scoped)
        .map((candidate) => candidate.value),
      values: [...new Set(terms.map((candidate) => candidate.value))],
    };
  }
  const orTerms = membershipTerms(expression, "or");
  if (orTerms) {
    return {
      field: orTerms[0]!.field as TransactionFilterMembershipField,
      kind: "membership",
      mode: "any",
      scopedValues: orTerms
        .filter((candidate) => candidate.scoped)
        .map((candidate) => candidate.value),
      values: [...new Set(orTerms.map((candidate) => candidate.value))],
    };
  }
  const andTerms = membershipTerms(expression, "and");
  if (
    !andTerms ||
    !multiValueMembershipFields.has(
      andTerms[0]!.field as TransactionFilterMembershipField,
    )
  ) {
    return undefined;
  }
  return {
    field: andTerms[0]!.field as TransactionFilterMembershipField,
    kind: "membership",
    mode: "all",
    scopedValues: andTerms
      .filter((candidate) => candidate.scoped)
      .map((candidate) => candidate.value),
    values: [...new Set(andTerms.map((candidate) => candidate.value))],
  };
};

const filterRowFromExpression = (
  expression: TransactionFilterExpression,
): TransactionFilterRow | undefined => {
  const expressions =
    expression.kind === "and" ? expression.terms : [expression];
  const chips: TransactionFilterChip[] = [];
  const membershipTermsByField = new Map<string, MembershipTerm[]>();
  const groupedMembershipFields = new Set<string>();
  for (const candidate of expressions) {
    if (candidate.kind !== "term" || candidate.operator !== ":") continue;
    const candidates = membershipTermsByField.get(candidate.field) ?? [];
    candidates.push(candidate);
    membershipTermsByField.set(candidate.field, candidates);
  }
  const comparisons = new Map<
    "amount" | "amount_usd" | "initiated",
    { from?: string; to?: string }
  >();
  for (const candidate of expressions) {
    if (candidate.kind === "term" && candidate.operator === ":") {
      const groupedTerms = membershipTermsByField.get(candidate.field) ?? [];
      if (
        groupedTerms.length > 1 &&
        multiValueMembershipFields.has(
          candidate.field as TransactionFilterMembershipField,
        )
      ) {
        if (groupedMembershipFields.has(candidate.field)) continue;
        groupedMembershipFields.add(candidate.field);
        const groupedChip = membershipChipFromExpression({
          kind: "and",
          terms: groupedTerms,
        });
        if (!groupedChip) return undefined;
        chips.push(groupedChip);
        continue;
      }
    }
    if (candidate.kind === "and") {
      const nestedComparisons = candidate.terms;
      const nestedField =
        nestedComparisons[0]?.kind === "term"
          ? nestedComparisons[0].field
          : undefined;
      if (
        nestedComparisons.length > 0 &&
        (nestedField === "amount" ||
          nestedField === "amount_usd" ||
          nestedField === "initiated") &&
        nestedComparisons.every(
          (term) =>
            term.kind === "term" &&
            term.field === nestedField &&
            (term.operator === ">=" || term.operator === "<="),
        )
      ) {
        const firstComparison = !comparisons.has(nestedField);
        const bounds = comparisons.get(nestedField) ?? {};
        for (const nested of nestedComparisons as readonly Extract<
          TransactionFilterExpression,
          { kind: "term" }
        >[]) {
          const side = nested.operator === ">=" ? "from" : "to";
          if (bounds[side]) return undefined;
          bounds[side] = nested.value;
        }
        comparisons.set(nestedField, bounds);
        if (firstComparison) {
          chips.push({ field: nestedField, kind: "range" });
        }
        continue;
      }
    }
    if (
      candidate.kind === "term" &&
      (candidate.operator === ">=" || candidate.operator === "<=") &&
      (candidate.field === "amount" ||
        candidate.field === "amount_usd" ||
        candidate.field === "initiated")
    ) {
      const field = candidate.field;
      const firstComparison = !comparisons.has(field);
      const bounds = comparisons.get(field) ?? {};
      const side = candidate.operator === ">=" ? "from" : "to";
      if (bounds[side]) return undefined;
      comparisons.set(field, { ...bounds, [side]: candidate.value });
      if (firstComparison) {
        chips.push({ field, kind: "range" });
      }
      continue;
    }
    const chip = membershipChipFromExpression(candidate);
    if (!chip) return undefined;
    const existingIndex = chips.findIndex(
      (existing) =>
        existing.kind === "membership" &&
        existing.field === chip.field &&
        existing.mode === chip.mode,
    );
    if (existingIndex >= 0) {
      if (chip.mode !== "none") return undefined;
      const existing = chips[existingIndex]! as Extract<
        TransactionFilterChip,
        { readonly kind: "membership" }
      >;
      const existingScopes = new Set(existing.scopedValues);
      const chipScopes = new Set(chip.scopedValues);
      if (
        chip.values.some(
          (value) =>
            existing.values.includes(value) &&
            existingScopes.has(value) !== chipScopes.has(value),
        )
      ) {
        return undefined;
      }
      const scopedValues = [
        ...new Set([
          ...(existing.scopedValues ?? []),
          ...(chip.scopedValues ?? []),
        ]),
      ];
      chips[existingIndex] = {
        ...existing,
        ...(scopedValues.length ? { scopedValues } : {}),
        values: [...new Set([...existing.values, ...chip.values])],
      };
      continue;
    }
    chips.push(chip);
  }
  return {
    chips: chips.map((chip) =>
      chip.kind === "range"
        ? { ...chip, ...comparisons.get(chip.field) }
        : chip,
    ),
  };
};

const unwrapFilterGroup = (source: string): string | undefined => {
  const text = source.trim();
  if (!text.startsWith("(") || !text.endsWith(")")) return undefined;
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted && character === "\\") {
      index += 1;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (depth === 0 && index !== text.length - 1) return undefined;
  }
  return depth === 0 && !quoted ? text.slice(1, -1).trim() : undefined;
};

const filterRowsFromExplicitGroups = (
  source: string,
): readonly TransactionFilterRow[] | undefined => {
  const text = unwrapFilterGroup(source) ?? source.trim();
  const groups: string[] = [];
  let start = 0;
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted && character === "\\") {
      index += 1;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (
      depth === 0 &&
      text.slice(index, index + 2).toLowerCase() === "or" &&
      /\s/.test(text[index - 1] ?? "") &&
      /\s/.test(text[index + 2] ?? "")
    ) {
      groups.push(text.slice(start, index).trim());
      start = index + 2;
      index += 1;
    }
  }
  groups.push(text.slice(start).trim());
  if (groups.length < 2) return undefined;
  const rows = groups.map((group) => {
    const inner = unwrapFilterGroup(group);
    if (inner === undefined) return undefined;
    const expression = parseTransactionFilterExpression(group);
    return expression ? filterRowFromExpression(expression) : undefined;
  });
  return rows.some((row) => !row)
    ? undefined
    : (rows as readonly TransactionFilterRow[]);
};

export const transactionFilterRows = (
  filters: TransactionFilters,
): readonly TransactionFilterRow[] | undefined => {
  if (!filters.expression) {
    return filters.filterText !== undefined ? undefined : [{ chips: [] }];
  }
  const explicitRows = filters.filterText
    ? filterRowsFromExplicitGroups(filters.filterText)
    : undefined;
  if (explicitRows) return explicitRows;
  const singleAny = membershipTerms(filters.expression, "or");
  if (singleAny) {
    return [
      {
        chips: [
          {
            field: singleAny[0]!.field as TransactionFilterMembershipField,
            kind: "membership",
            mode: "any",
            scopedValues: singleAny
              .filter((candidate) => candidate.scoped)
              .map((candidate) => candidate.value),
            values: singleAny.map((candidate) => candidate.value),
          },
        ],
      },
    ];
  }
  const expressions =
    filters.expression.kind === "or"
      ? filters.expression.terms
      : [filters.expression];
  const rows = expressions.map(filterRowFromExpression);
  return rows.some((row) => !row)
    ? undefined
    : (rows as readonly TransactionFilterRow[]);
};

export const withTransactionFilterEntityScope = (
  filters: TransactionFilters,
  field: "category" | "tag",
  fqn: string,
  scoped: boolean,
): TransactionFilters =>
  withTransactionFilterExpression(
    filters,
    term(field, ":", scoped ? `${fqn}:*` : fqn, scoped),
  );

export const addTransactionFilterMembership = (
  filters: TransactionFilters,
  field: "account" | "category" | "member" | "tag",
  value: string,
): TransactionFilters => {
  const rows = transactionFilterRows(filters);
  if (rows) {
    const nextRows = (rows.length > 0 ? rows : [{ chips: [] }]).map((row) => {
      const existingIndex = row.chips.findIndex(
        (chip) =>
          chip.kind === "membership" &&
          chip.field === field &&
          chip.mode === "any",
      );
      const chips = [...row.chips];
      if (existingIndex >= 0) {
        const existing = chips[existingIndex]! as Extract<
          TransactionFilterChip,
          { readonly kind: "membership" }
        >;
        if (existing.values.includes(value)) {
          return row;
        }
        if (existing.scopedValues?.length) {
          const allIndex = chips.findIndex(
            (chip) =>
              chip.kind === "membership" &&
              chip.field === field &&
              chip.mode === "all",
          );
          if (allIndex >= 0) {
            const all = chips[allIndex]! as Extract<
              TransactionFilterChip,
              { readonly kind: "membership" }
            >;
            chips[allIndex] = { ...all, values: [...all.values, value] };
          } else {
            chips.push({
              field,
              kind: "membership",
              mode: "all",
              values: [value],
            });
          }
        } else {
          chips[existingIndex] = {
            ...existing,
            values: [...existing.values, value],
          };
        }
      } else {
        chips.push({ field, kind: "membership", mode: "any", values: [value] });
      }
      return { chips };
    });
    return withTransactionFilterRows(filters, nextRows);
  }
  return filters;
};

export const withoutTransactionFilterMembership = (
  filters: TransactionFilters,
  field: TransactionFilterMembershipField,
): TransactionFilters => {
  const rows = transactionFilterRows(filters);
  if (!rows) return filters;
  const hasMembership = rows.some((row) =>
    row.chips.some(
      (chip) => chip.kind === "membership" && chip.field === field,
    ),
  );
  if (!hasMembership) return filters;
  const nextRows = rows.map((row) => ({
    chips: row.chips.filter(
      (chip) => chip.kind !== "membership" || chip.field !== field,
    ),
  }));
  const removedWholeAlternative = rows.some(
    (row, index) => row.chips.length > 0 && nextRows[index]!.chips.length === 0,
  );
  return withTransactionFilterRows(
    filters,
    removedWholeAlternative ? [{ chips: [] }] : nextRows,
  );
};

export const addRequiredTransactionFilterMembership = (
  filters: TransactionFilters,
  field: "account" | "category" | "member" | "tag",
  value: string,
): TransactionFilters => {
  const requiredChip = {
    field,
    kind: "membership",
    mode: "any",
    values: [value],
  } as const;
  const rows = transactionFilterRows(filters);
  if (rows) {
    return withTransactionFilterRows(
      filters,
      (rows.length > 0 ? rows : [{ chips: [] }]).map((row) => {
        const alreadyRequired = row.chips.some(
          (chip) =>
            chip.kind === "membership" &&
            chip.field === field &&
            chip.mode !== "none" &&
            chip.values.includes(value) &&
            !chip.scopedValues?.includes(value) &&
            (chip.mode === "all" || chip.values.length === 1),
        );
        return {
          chips: alreadyRequired ? row.chips : [...row.chips, requiredChip],
        };
      }),
    );
  }
  if (!filters.expression) return filters;
  return withTransactionFilterExpression(filters, {
    kind: "and",
    terms: [filters.expression, term(field, ":", value)],
  });
};

export const transactionFilterSignature = (
  filters: Partial<TransactionFilters> = {},
): string => {
  const normalized = normalizeTransactionFilters(filters);
  return JSON.stringify([
    normalized.filterText === undefined
      ? ["absent"]
      : ["present", normalized.filterText],
    normalized.classes,
    normalized.search ?? "",
  ]);
};

const relativeFilterValuePattern = /^[+-]\d+(?:s|m|h|d|w|mo|y)$/;

export const transactionFilterUsesRelativeTime = (
  filters: Partial<TransactionFilters> = {},
): boolean => {
  const expression = normalizeTransactionFilters(filters).expression;
  if (!expression) return false;
  const containsRelativeTime = (
    candidate: TransactionFilterExpression,
  ): boolean => {
    switch (candidate.kind) {
      case "and":
      case "or":
        return candidate.terms.some(containsRelativeTime);
      case "not":
        return containsRelativeTime(candidate.term);
      case "term":
        return (
          (candidate.field === "initiated" ||
            candidate.field === "pending" ||
            candidate.field === "posted") &&
          relativeFilterValuePattern.test(candidate.value)
        );
    }
  };
  return containsRelativeTime(expression);
};
