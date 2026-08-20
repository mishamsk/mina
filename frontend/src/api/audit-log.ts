import {
  type ApiAuditEntry,
  type ApiAuditEntryListResponse,
  listApiAuditEntries as listGeneratedApiAuditEntries,
  type ListApiAuditEntriesData,
} from "./generated-access";

export interface ApiAuditEntryForDisplay extends ApiAuditEntry {
  readonly request_json_source: string;
  readonly response_json_source: string;
}

export interface ApiAuditEntryListForDisplay extends Omit<
  ApiAuditEntryListResponse,
  "entries"
> {
  readonly entries: readonly ApiAuditEntryForDisplay[];
}

export interface ApiAuditEntryListResult {
  readonly data?: ApiAuditEntryListForDisplay;
  readonly error?: unknown;
}

type AuditQuery = NonNullable<ListApiAuditEntriesData["query"]>;

interface SourceRange {
  readonly end: number;
  readonly start: number;
}

export const listApiAuditEntriesForDisplay = async (
  query: AuditQuery,
): Promise<ApiAuditEntryListResult> => {
  const result = await listGeneratedApiAuditEntries({ parseAs: "text", query });
  if (!result.data) {
    return { error: result.error };
  }
  const rawData: unknown = result.data;
  if (typeof rawData !== "string") {
    return { error: new Error("Audit history returned an invalid response.") };
  }

  try {
    return { data: parseAuditEntryList(rawData) };
  } catch (error) {
    return { error };
  }
};

export const formatAuditJSONSource = (source: string): string => {
  let formatted = "";
  let indent = 0;
  let index = 0;
  const appendIndent = () => {
    formatted += "  ".repeat(indent);
  };

  while (index < source.length) {
    const character = source.charAt(index);
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === '"') {
      const end = scanJSONString(source, index);
      formatted += source.slice(index, end);
      index = end;
      continue;
    }
    if (character === "{" || character === "[") {
      formatted += character;
      indent += 1;
      index += 1;
      const next = skipWhitespace(source, index);
      const closesImmediately =
        (character === "{" && source[next] === "}") ||
        (character === "[" && source[next] === "]");
      if (!closesImmediately) {
        formatted += "\n";
        appendIndent();
      }
      continue;
    }
    if (character === "}" || character === "]") {
      indent -= 1;
      const previous = formatted.at(-1);
      if (previous !== "{" && previous !== "[") {
        formatted += "\n";
        appendIndent();
      }
      formatted += character;
      index += 1;
      continue;
    }
    if (character === ",") {
      formatted += ",\n";
      appendIndent();
      index += 1;
      continue;
    }
    if (character === ":") {
      formatted += ": ";
      index += 1;
      continue;
    }

    const end = scanPrimitive(source, index);
    formatted += source.slice(index, end);
    index = end;
  }

  return formatted;
};

const parseAuditEntryList = (source: string): ApiAuditEntryListForDisplay => {
  const parsed = JSON.parse(source) as ApiAuditEntryListResponse;
  const rootFields = scanObjectFields(source, 0);
  const entriesRange = rootFields.get("entries");
  if (!entriesRange) {
    throw new Error("Audit history did not contain entries.");
  }
  const entryRanges = scanArrayItems(source, entriesRange.start);
  if (entryRanges.length !== parsed.entries.length) {
    throw new Error("Audit history entry sources did not match its metadata.");
  }

  return {
    ...parsed,
    entries: parsed.entries.map((entry, index) => {
      const entryRange = entryRanges[index];
      if (!entryRange) {
        throw new Error("Audit history entry source was missing.");
      }
      const fields = scanObjectFields(source, entryRange.start);
      const requestJSON = requiredField(fields, "request_json");
      const responseJSON = requiredField(fields, "response_json");
      return {
        ...entry,
        request_json_source: source.slice(requestJSON.start, requestJSON.end),
        response_json_source: source.slice(
          responseJSON.start,
          responseJSON.end,
        ),
      };
    }),
  };
};

const requiredField = (
  fields: ReadonlyMap<string, SourceRange>,
  name: string,
): SourceRange => {
  const range = fields.get(name);
  if (!range) {
    throw new Error(`Audit history entry did not contain ${name}.`);
  }
  return range;
};

const scanObjectFields = (
  source: string,
  start: number,
): ReadonlyMap<string, SourceRange> => {
  const fields = new Map<string, SourceRange>();
  let index = skipWhitespace(source, start);
  if (source[index] !== "{") {
    throw new Error("Expected a JSON object.");
  }
  index = skipWhitespace(source, index + 1);
  while (source[index] !== "}") {
    if (source[index] !== '"') {
      throw new Error("Expected a JSON object key.");
    }
    const keyEnd = scanJSONString(source, index);
    const key = JSON.parse(source.slice(index, keyEnd)) as string;
    index = skipWhitespace(source, keyEnd);
    if (source[index] !== ":") {
      throw new Error("Expected a JSON object separator.");
    }
    const valueStart = skipWhitespace(source, index + 1);
    const valueEnd = scanJSONValue(source, valueStart);
    fields.set(key, { end: valueEnd, start: valueStart });
    index = skipWhitespace(source, valueEnd);
    if (source[index] === ",") {
      index = skipWhitespace(source, index + 1);
      continue;
    }
    if (source[index] !== "}") {
      throw new Error("Expected the end of a JSON object.");
    }
  }
  return fields;
};

const scanArrayItems = (
  source: string,
  start: number,
): readonly SourceRange[] => {
  const items: SourceRange[] = [];
  let index = skipWhitespace(source, start);
  if (source[index] !== "[") {
    throw new Error("Expected a JSON array.");
  }
  index = skipWhitespace(source, index + 1);
  while (source[index] !== "]") {
    const itemStart = index;
    const itemEnd = scanJSONValue(source, itemStart);
    items.push({ end: itemEnd, start: itemStart });
    index = skipWhitespace(source, itemEnd);
    if (source[index] === ",") {
      index = skipWhitespace(source, index + 1);
      continue;
    }
    if (source[index] !== "]") {
      throw new Error("Expected the end of a JSON array.");
    }
  }
  return items;
};

const scanJSONValue = (source: string, start: number): number => {
  const character = source[start];
  if (character === '"') {
    return scanJSONString(source, start);
  }
  if (character !== "{" && character !== "[") {
    return scanPrimitive(source, start);
  }

  const stack = [character === "{" ? "}" : "]"];
  let index = start + 1;
  while (index < source.length && stack.length > 0) {
    const current = source[index];
    if (current === '"') {
      index = scanJSONString(source, index);
      continue;
    }
    if (current === "{") {
      stack.push("}");
    } else if (current === "[") {
      stack.push("]");
    } else if (current === stack.at(-1)) {
      stack.pop();
    }
    index += 1;
  }
  if (stack.length > 0) {
    throw new Error("Unterminated JSON value.");
  }
  return index;
};

const scanJSONString = (source: string, start: number): number => {
  let escaped = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      return index + 1;
    }
  }
  throw new Error("Unterminated JSON string.");
};

const scanPrimitive = (source: string, start: number): number => {
  let index = start;
  while (
    index < source.length &&
    source.charAt(index) !== "," &&
    source.charAt(index) !== "}" &&
    source.charAt(index) !== "]" &&
    !/\s/.test(source.charAt(index))
  ) {
    index += 1;
  }
  return index;
};

const skipWhitespace = (source: string, start: number): number => {
  let index = start;
  while (index < source.length && /\s/.test(source.charAt(index))) {
    index += 1;
  }
  return index;
};
