import assert from "node:assert/strict";
import test from "node:test";
import { generateRoundRobin } from "../packages/core/src/generator";

test("round robin for 9 groups yields 9 rounds with 4 matches + 1 bye and unique pairs", () => {
  const groups = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  const rounds = generateRoundRobin(groups);
  assert.equal(rounds.length, 9);

  const pairCounts = new Map<string, number>();
  for (const round of rounds) {
    assert.equal(round.matches.length, 4);
    assert.ok(round.bye);
    for (const [g1, g2] of round.matches) {
      const key = g1 < g2 ? `${g1}-${g2}` : `${g2}-${g1}`;
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    }
  }

  const expectedPairCount = (groups.length * (groups.length - 1)) / 2;
  assert.equal(pairCounts.size, expectedPairCount);
  for (const count of pairCounts.values()) {
    assert.equal(count, 1);
  }
});
