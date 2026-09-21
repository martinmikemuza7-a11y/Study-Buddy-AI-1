import assert from "node:assert/strict";
import { hasUnreadableCharacters, lexicalOverlap, normalizeStudyText } from "../lib/textQuality";

const xml = "  Mitochondria &amp; ATP &#x2014; energy  \u0000\n\n  production.  ";
assert.equal(normalizeStudyText(xml), "Mitochondria & ATP — energy production.");
assert.equal(hasUnreadableCharacters("Readable UTF-8 text."), false);
assert.equal(hasUnreadableCharacters("Broken ��� text"), true);
assert.ok(lexicalOverlap("Mitochondria produce ATP", "Mitochondria produce ATP for cellular energy") > 0.5);

console.log("Study text quality tests passed.");
