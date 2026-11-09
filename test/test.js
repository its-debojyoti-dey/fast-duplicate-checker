const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { findDuplicates, diceCoefficient, defaultNormalizer } = require("../index.js");

describe("diceCoefficient", () => {
  test("returns 1.0 for identical strings", () => {
    assert.equal(diceCoefficient("hello world", "hello world"), 1.0);
  });

  test("returns 0.0 for empty or single-character strings", () => {
    assert.equal(diceCoefficient("", "hello"), 0.0);
    assert.equal(diceCoefficient("a", "b"), 0.0);
    assert.equal(diceCoefficient("", ""), 1.0);
  });

  test("calculates expected similarity for near-identical strings", () => {
    const s1 = defaultNormalizer("What is the capital of France?");
    const s2 = defaultNormalizer("What is the capital of France");
    const score = diceCoefficient(s1, s2);
    assert.ok(score >= 0.95, `Expected score >= 0.95, got ${score}`);
  });

  test("calculates low similarity for completely different strings", () => {
    const s1 = defaultNormalizer("Quantum electrodynamics of electrons");
    const s2 = defaultNormalizer("How to bake chocolate chip cookies");
    const score = diceCoefficient(s1, s2);
    assert.ok(score < 0.2, `Expected score < 0.2, got ${score}`);
  });
});

describe("defaultNormalizer", () => {
  test("removes spaces and special characters and converts to lowercase", () => {
    assert.equal(defaultNormalizer("  Hello, World! 123  "), "helloworld123");
  });

  test("handles null, undefined, and non-string values safely", () => {
    assert.equal(defaultNormalizer(null), "");
    assert.equal(defaultNormalizer(undefined), "");
    assert.equal(defaultNormalizer(123), "");
  });
});

describe("findDuplicates with string arrays", () => {
  test("finds duplicates in simple string list", () => {
    const list = [
      "What is the capital of France?",
      "How to calculate mortgage interest?",
      "What is the capital of France",
      "Which city is the capital of France?",
    ];

    const result = findDuplicates(list, { threshold: 0.8 });
    assert.equal(result.totalGroups, 1);
    assert.equal(result.totalDuplicates, 1);
    assert.equal(result.groups[0].primary.item, "What is the capital of France?");
    assert.equal(result.groups[0].duplicates[0].item, "What is the capital of France");
  });

  test("handles empty array and single element", () => {
    assert.deepEqual(findDuplicates([]), { totalGroups: 0, totalDuplicates: 0, groups: [] });
    assert.deepEqual(findDuplicates(["single item"]), { totalGroups: 0, totalDuplicates: 0, groups: [] });
  });

  test("returns zero duplicates when all items are distinct", () => {
    const list = [
      "The quick brown fox jumps over the lazy dog",
      "Sphinx of black quartz, judge my vow",
      "Pack my box with five dozen liquor jugs",
    ];
    const result = findDuplicates(list);
    assert.equal(result.totalGroups, 0);
    assert.equal(result.totalDuplicates, 0);
  });
});

describe("findDuplicates with object arrays", () => {
  test("finds duplicate objects with custom IDs and fields", () => {
    const items = [
      { id: "q1", text: "Explain the difference between TCP and UDP protocols." },
      { id: "q2", text: "Describe sorting algorithms in computer science." },
      { id: "q3", text: "Explain difference between TCP and UDP protocol." },
      { id: "q4", text: "Explain the difference between TCP and UDP protocols!" },
    ];

    const result = findDuplicates(items, { threshold: 0.85 });

    assert.equal(result.totalGroups, 1);
    assert.equal(result.totalDuplicates, 2);
    assert.equal(result.groups[0].primary.id, "q1");
    assert.equal(result.groups[0].count, 3);
  });

  test("supports bucketing via groupBy", () => {
    const items = [
      { id: 1, category: "networking", text: "What is an IP address?" },
      { id: 2, category: "networking", text: "What is an IP address" },
      { id: 3, category: "cooking", text: "What is an IP address?" },
    ];

    const result = findDuplicates(items, {
      threshold: 0.8,
      groupBy: (item) => item.category,
    });

    // Networking group has 1 duplicate group; cooking has none.
    assert.equal(result.totalGroups, 1);
    assert.equal(result.groups[0].groupKey, "networking");
    assert.equal(result.groups[0].duplicates.length, 1);
  });

  test("safely handles null and empty text properties", () => {
    const items = [
      { id: "1", text: null },
      { id: "2", text: "" },
      { id: "3" },
      { id: "4", text: "Valid text item for testing duplicate finder" },
      { id: "5", text: "Valid text item for testing duplicate finder." },
    ];

    const result = findDuplicates(items, { threshold: 0.85 });
    assert.equal(result.totalGroups, 1);
    assert.equal(result.groups[0].primary.id, "4");
  });
});

describe("Performance & Length Filtering Verification", () => {
  test("skips comparison when length difference is too vast", () => {
    let similarityCalls = 0;
    const trackedSimilarity = (a, b) => {
      similarityCalls++;
      return diceCoefficient(a, b);
    };

    const items = [
      "Short text.",
      "This is an exceptionally long paragraph designed to test that the length filter rejects it without invoking similarity function.",
    ];

    findDuplicates(items, {
      threshold: 0.8,
      similarityFn: trackedSimilarity,
    });

    // Because lengths are 9 and ~115, the length ratio filter skips it in O(1)
    assert.equal(similarityCalls, 0, "Expected length filter to skip similarity calculation");
  });
});
