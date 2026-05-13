import type { GroupV2, Id } from "./model";

export interface ParticipantRow {
  id: Id;
  name: string;
  email?: string;
  phone?: string;
  is18Plus?: boolean;
  notes?: string;
  // Legacy school fields, kept for backwards compatibility with old configs.
  className?: string;
  level?: string;
}

export interface ImportParticipantsResult {
  delimiter: "," | ";" | "\t";
  rows: ParticipantRow[];
  warnings: string[];
}

function detectDelimiter(input: string): "," | ";" | "\t" {
  const candidates: Array<"," | ";" | "\t"> = [",", ";", "\t"];
  const scores = candidates.map((delimiter) => ({
    delimiter,
    score: input
      .split(/\r?\n/)
      .slice(0, 5)
      .reduce((sum, line) => sum + line.split(delimiter).length, 0),
  }));
  scores.sort((a, b) => b.score - a.score);
  return scores[0].delimiter;
}

function parseLine(line: string, delimiter: string): string[] {
  const output: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && char === delimiter) {
      output.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  output.push(current.trim());
  return output;
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, "");
}

export function parseParticipantsCsv(raw: string): ImportParticipantsResult {
  const warnings: string[] = [];
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return { delimiter: ",", rows: [], warnings: ["Input is empty."] };
  }

  const delimiter = detectDelimiter(lines.join("\n"));
  const headerColumns = parseLine(lines[0], delimiter).map(normalizeHeader);

  const nameIndex = headerColumns.findIndex((header) => ["naam", "name", "student"].includes(header));
  const emailIndex = headerColumns.findIndex((header) =>
    ["email", "e-mail", "mail", "emailadres"].includes(header)
  );
  const phoneIndex = headerColumns.findIndex((header) =>
    ["telefoon", "phone", "tel", "telefoonnummer", "mobile", "mobiel"].includes(header)
  );
  const is18PlusIndex = headerColumns.findIndex((header) =>
    ["18plus", "18+", "is_18_plus", "is18plus", "achttienplus", "meerderjarig"].includes(header)
  );
  const notesIndex = headerColumns.findIndex((header) =>
    ["notitie", "notities", "notes", "opmerking", "opmerkingen"].includes(header)
  );
  const classIndex = headerColumns.findIndex((header) =>
    ["klas", "class", "afdeling", "department"].includes(header)
  );
  const levelIndex = headerColumns.findIndex((header) => ["niveau", "level"].includes(header));

  if (nameIndex === -1) {
    warnings.push("No 'naam/name' column found. First column is used as name.");
  }

  const rows: ParticipantRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const columns = parseLine(lines[i], delimiter);
    const name = columns[nameIndex >= 0 ? nameIndex : 0]?.trim();
    if (!name) {
      warnings.push(`Row ${i + 1} skipped: missing name.`);
      continue;
    }
    rows.push({
      id: `participant-${rows.length + 1}`,
      name,
      email: emailIndex >= 0 ? emptyToUndefined(columns[emailIndex]) : undefined,
      phone: phoneIndex >= 0 ? emptyToUndefined(columns[phoneIndex]) : undefined,
      is18Plus: is18PlusIndex >= 0 ? parseBoolean(columns[is18PlusIndex]) : undefined,
      notes: notesIndex >= 0 ? emptyToUndefined(columns[notesIndex]) : undefined,
      className: classIndex >= 0 ? emptyToUndefined(columns[classIndex]) : undefined,
      level: levelIndex >= 0 ? emptyToUndefined(columns[levelIndex]) : undefined,
    });
  }

  return { delimiter, rows, warnings };
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (["ja", "yes", "y", "true", "1", "x", "18+"].includes(trimmed)) return true;
  if (["nee", "no", "n", "false", "0", ""].includes(trimmed)) return false;
  return undefined;
}

export interface AutoGroupOptions {
  fixedSize?: number;
  minSize?: number;
  maxSize?: number;
  mixByLevel?: boolean;
}

function targetGroupSize(participantCount: number, options: AutoGroupOptions): number {
  if (typeof options.fixedSize === "number" && options.fixedSize > 0) {
    return Math.floor(options.fixedSize);
  }
  const minSize = Math.max(1, Math.floor(options.minSize ?? 4));
  const maxSize = Math.max(minSize, Math.floor(options.maxSize ?? minSize));
  if (participantCount <= minSize) {
    return minSize;
  }
  return Math.floor((minSize + maxSize) / 2);
}

export function autoCreateGroupsFromParticipants(
  participants: ParticipantRow[],
  options: AutoGroupOptions = {}
): GroupV2[] {
  if (participants.length === 0) {
    return [];
  }
  const targetSize = targetGroupSize(participants.length, options);
  const groupCount = Math.max(1, Math.ceil(participants.length / targetSize));
  const groups: GroupV2[] = Array.from({ length: groupCount }, (_, index) => ({
    id: `group-${index + 1}`,
    name: `Groep ${index + 1}`,
  }));

  return groups;
}
