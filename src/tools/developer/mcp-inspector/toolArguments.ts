import { parseFiniteJson } from "./config";

type JsonObject = Record<string, unknown>;
type ValueType = "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";
export type ArgumentDraft = string | null;
export interface ToolField {
  name: string;
  label: string;
  description?: string;
  kind: "text" | "number" | "boolean" | "choice" | "json";
  types: ValueType[];
  required: boolean;
  choices?: { value: string; label: string }[];
  initial?: ArgumentDraft;
}

const types = new Set<unknown>(["string", "number", "integer", "boolean", "object", "array", "null"]);
const isType = (value: unknown): value is ValueType => types.has(value);
const isObject = (value: unknown): value is JsonObject => value !== null && typeof value === "object" && !Array.isArray(value);
const isMultiline = (value: unknown): boolean => typeof value === "string" && /[\r\n]/.test(value);

function propertyTypes(schema: JsonObject): ValueType[] {
  const declared = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (declared.every(isType)) return declared;
  if (!Array.isArray(schema.anyOf)) return [];
  const members = schema.anyOf.map((item: unknown) => isObject(item) ? item.type : undefined);
  return members.every(isType) ? [...new Set<ValueType>(members)] : [];
}

function matches(value: unknown, type: ValueType): boolean {
  if (type === "null") return value === null;
  if (type === "object") return isObject(value);
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function asDraft(field: ToolField, value: unknown): ArgumentDraft | undefined {
  if (field.types.length && !field.types.some((type) => matches(value, type))) return;
  if (field.kind === "text") {
    if (value === null || (typeof value === "string" && !isMultiline(value))) return value;
    return;
  }
  const encoded = JSON.stringify(value, null, field.kind === "json" ? 2 : undefined);
  if (field.choices && !field.choices.some((choice) => choice.value === encoded)) return;
  return encoded;
}

export function fieldsFromSchema(schema: JsonObject): ToolField[] | undefined {
  if (schema.type !== "object" || "$ref" in schema || "$dynamicRef" in schema) return;
  const properties = schema.properties ?? {};
  if (!isObject(properties)) return;
  const required = Array.isArray(schema.required) ? schema.required : [];
  if (required.some((name: unknown) => typeof name !== "string" || !Object.prototype.hasOwnProperty.call(properties, name))) return;
  if (!Object.keys(properties).length && ["anyOf", "oneOf", "allOf"].some((key) => key in schema)) return;

  return Object.entries(properties).map(([name, value]) => {
    const property = isObject(value) ? value : {};
    const fieldTypes = "$ref" in property || "$dynamicRef" in property ? [] : propertyTypes(property);
    const baseTypes = fieldTypes.filter((type) => type !== "null");
    const base = baseTypes.length === 1 ? baseTypes[0] : undefined;
    const primitiveEnum = Array.isArray(property.enum) && property.enum.length > 0 && property.enum.every((item) =>
      item === null || typeof item === "string" || typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item)),
    );
    const choices = primitiveEnum ? (property.enum as unknown[]).map((item) => ({
      value: JSON.stringify(item), label: typeof item === "string" && item ? item : JSON.stringify(item),
    })) : undefined;
    const kind = choices ? "choice"
      : property.enum !== undefined || isMultiline(property.default) ? "json"
      : base === "string" ? "text"
      : base === "integer" || base === "number" ? "number"
      : base === "boolean" ? "boolean" : "json";
    const field: ToolField = {
      name, kind, choices, types: fieldTypes, required: required.includes(name),
      label: typeof property.title === "string" && property.title.trim() ? property.title : name,
      description: typeof property.description === "string" ? property.description : undefined,
    };
    if (property.default !== undefined) field.initial = asDraft(field, property.default);
    return field;
  }).sort((a, b) => Number(b.required) - Number(a.required));
}

export function draftsFromArgs(fields: ToolField[], args: JsonObject): Map<string, ArgumentDraft> | undefined {
  const drafts = new Map<string, ArgumentDraft>();
  const byName = new Map(fields.map((field) => [field.name, field]));
  for (const [name, value] of Object.entries(args)) {
    const field = byName.get(name);
    if (!field) return;
    const draft = asDraft(field, value);
    if (draft === undefined) return;
    drafts.set(name, draft);
  }
  return drafts;
}

export function initialDrafts(fields: ToolField[]): Map<string, ArgumentDraft> {
  return new Map(fields.flatMap(({ name, initial }) => initial === undefined ? [] : [[name, initial] as const]));
}

export function readDrafts(fields: ToolField[], drafts: Map<string, ArgumentDraft>) {
  const values: [string, unknown][] = [];
  const errors = new Map<string, "requiredField" | "invalidField">();
  for (const field of fields) {
    const draft = drafts.get(field.name);
    if (draft === undefined) {
      if (field.required) errors.set(field.name, "requiredField");
      continue;
    }
    try {
      const value = field.kind === "text" ? draft
        : field.kind === "number" && draft !== "null" ? Number(draft)
        : parseFiniteJson(draft ?? "null");
      if (asDraft(field, value) === undefined) errors.set(field.name, "invalidField");
      else values.push([field.name, value]);
    } catch {
      errors.set(field.name, "invalidField");
    }
  }
  return { args: Object.fromEntries(values), errors };
}
