const REPLACEMENT_CHARACTER = /\uFFFD/g;
const CONTROL_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function normalizeStudyText(input: string): string {
  return decodeXmlEntities(input.normalize("NFC"))
    .replace(/\r\n?/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(CONTROL_CHARACTER, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function hasUnreadableCharacters(input: string): boolean {
  if (!input.trim()) return true;
  if (REPLACEMENT_CHARACTER.test(input)) {
    REPLACEMENT_CHARACTER.lastIndex = 0;
    return true;
  }
  const controlMatches = input.match(CONTROL_CHARACTER);
  if (controlMatches && controlMatches.length > Math.max(2, input.length * 0.001)) return true;
  const suspicious = (input.match(/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) ?? []).length;
  return suspicious > 0;
}

export function cleanForPrompt(input: string): string {
  return normalizeStudyText(input)
    .replace(/\uFFFD/g, "")
    .trim();
}

export function lexicalOverlap(a: string, b: string): number {
  const tokenize = (value: string) => new Set(
    normalizeStudyText(value)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4),
  );
  const left = tokenize(a);
  const right = tokenize(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return shared / Math.max(1, Math.min(left.size, right.size));
}
