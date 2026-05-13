import assert from "node:assert/strict";
import test from "node:test";
import { parseParticipantsCsv } from "../packages/core/src/import";

test("parseParticipantsCsv: name only (legacy compat)", () => {
  const result = parseParticipantsCsv("Naam\nJan\nKlaas");
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].name, "Jan");
  assert.equal(result.rows[1].name, "Klaas");
});

test("parseParticipantsCsv: recognizes email + phone columns", () => {
  const raw = "Naam;Email;Telefoon\nJan;jan@example.nl;+31612345678\nKlaas;;+31698765432";
  const result = parseParticipantsCsv(raw);
  assert.equal(result.delimiter, ";");
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].email, "jan@example.nl");
  assert.equal(result.rows[0].phone, "+31612345678");
  assert.equal(result.rows[1].email, undefined, "empty email should be undefined");
  assert.equal(result.rows[1].phone, "+31698765432");
});

test("parseParticipantsCsv: alternative header aliases", () => {
  const raw = "name,e-mail,tel\nJan,jan@x.nl,06-12345678";
  const result = parseParticipantsCsv(raw);
  assert.equal(result.rows[0].email, "jan@x.nl");
  assert.equal(result.rows[0].phone, "06-12345678");
});

test("parseParticipantsCsv: parses 18+ boolean variants", () => {
  const raw = "Naam;18+\nJan;ja\nKlaas;nee\nPiet;yes\nMaria;\nLucy;1\nTim;0";
  const result = parseParticipantsCsv(raw);
  assert.equal(result.rows[0].is18Plus, true, "ja → true");
  assert.equal(result.rows[1].is18Plus, false, "nee → false");
  assert.equal(result.rows[2].is18Plus, true, "yes → true");
  assert.equal(result.rows[3].is18Plus, undefined, "empty → undefined");
  assert.equal(result.rows[4].is18Plus, true, "1 → true");
  assert.equal(result.rows[5].is18Plus, false, "0 → false");
});

test("parseParticipantsCsv: notes column", () => {
  const raw = "Naam;Notitie\nJan;Allergisch voor noten\nKlaas;";
  const result = parseParticipantsCsv(raw);
  assert.equal(result.rows[0].notes, "Allergisch voor noten");
  assert.equal(result.rows[1].notes, undefined);
});

test("parseParticipantsCsv: legacy klas/niveau still work", () => {
  const raw = "Naam,Klas,Niveau\nJan,3A,HAVO";
  const result = parseParticipantsCsv(raw);
  assert.equal(result.rows[0].className, "3A");
  assert.equal(result.rows[0].level, "HAVO");
});

test("parseParticipantsCsv: bulk paste pattern with prepended header", () => {
  // Simulate the bulk-paste flow used by TeamMembersEditor.
  const userPaste = "Jan Jansen; jan@example.nl; +31612345678\nKlaas de Vries\nPiet; piet@example.nl";
  const withHeader = `Naam;Email;Telefoon\n${userPaste}`;
  const { rows, warnings } = parseParticipantsCsv(withHeader);
  assert.equal(warnings.length, 0);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].name, "Jan Jansen");
  assert.equal(rows[0].email, "jan@example.nl");
  assert.equal(rows[0].phone, "+31612345678");
  assert.equal(rows[1].name, "Klaas de Vries");
  assert.equal(rows[1].email, undefined);
  assert.equal(rows[1].phone, undefined);
  assert.equal(rows[2].email, "piet@example.nl");
});

test("parseParticipantsCsv: skips empty name rows with warning", () => {
  const raw = "Naam;Email\nJan;jan@x.nl\n;empty@x.nl\nPiet;piet@x.nl";
  const result = parseParticipantsCsv(raw);
  assert.equal(result.rows.length, 2);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /missing name/);
});
