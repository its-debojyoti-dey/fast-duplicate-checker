/**
 * fast-duplicate-checker
 * High-performance, zero-dependency text duplicate detection and clustering engine.
 */

/**
 * Computes Sørensen-Dice similarity coefficient between two strings (bigram-based).
 * Returns a value between 0.0 (no similarity) and 1.0 (exact match).
 *
 * @param {string} str1
 * @param {string} str2
 * @returns {number}
 */
function diceCoefficient(str1, str2) {
  if (str1 === str2) return 1.0;
  if (!str1 || !str2 || str1.length < 2 || str2.length < 2) return 0.0;

  const len1 = str1.length - 1;
  const len2 = str2.length - 1;

  // Build frequency map of bigrams for str1
  const bigrams = new Map();
  for (let i = 0; i < len1; i++) {
    const bigram = str1.slice(i, i + 2);
    bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
  }

  // Count matching bigrams with str2
  let intersection = 0;
  for (let i = 0; i < len2; i++) {
    const bigram = str2.slice(i, i + 2);
    const count = bigrams.get(bigram) || 0;
    if (count > 0) {
      bigrams.set(bigram, count - 1);
      intersection++;
    }
  }

  return (2.0 * intersection) / (len1 + len2);
}

/**
 * Default text normalization: lowercase and strip non-alphanumeric characters.
 *
 * @param {string} text
 * @returns {string}
 */
function defaultNormalizer(text) {
  if (!text || typeof text !== "string") return "";
  return text.toLowerCase().replace(/[^\w]/g, "");
}

/**
 * Finds and clusters duplicate or near-duplicate texts/objects.
 *
 * @param {Array<string|object>} items - Collection of texts or objects to check.
 * @param {object} [options]
 * @param {number} [options.threshold=0.8] - Similarity threshold (0.0 to 1.0). Default 0.8.
 * @param {function} [options.getText] - Extractor function: item => string.
 * @param {function} [options.getId] - ID extractor: (item, index) => string.
 * @param {function} [options.normalize] - Normalizer function: text => string.
 * @param {function} [options.similarityFn] - Custom similarity function: (s1, s2) => number.
 * @param {function} [options.groupBy] - Optional bucketing function: (item, index) => bucketKey.
 * @returns {{ totalGroups: number, totalDuplicates: number, groups: Array<object> }}
 */
function findDuplicates(items, options = {}) {
  const {
    threshold = 0.8,
    getText = (item) => {
      if (typeof item === "string") return item;
      return item?.text ?? item?.content ?? item?.title ?? item?.question ?? "";
    },
    getId = (item, index) => {
      if (item && item.id != null) return String(item.id);
      if (item && item._id != null) return String(item._id);
      return String(index);
    },
    normalize = defaultNormalizer,
    similarityFn = diceCoefficient,
    groupBy = null,
  } = options;

  if (!Array.isArray(items) || items.length === 0) {
    return { totalGroups: 0, totalDuplicates: 0, groups: [] };
  }

  // If bucketing is configured, partition items and run per partition
  if (typeof groupBy === "function") {
    const buckets = new Map();
    for (let i = 0; i < items.length; i++) {
      const key = String(groupBy(items[i], i) ?? "__default__");
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(items[i]);
    }

    const allGroups = [];
    let totalDuplicates = 0;

    for (const [bucketKey, bucketItems] of buckets.entries()) {
      const subResult = findDuplicates(bucketItems, {
        ...options,
        groupBy: null,
      });

      for (const group of subResult.groups) {
        allGroups.push({ ...group, groupKey: bucketKey });
      }
      totalDuplicates += subResult.totalDuplicates;
    }

    return {
      totalGroups: allGroups.length,
      totalDuplicates,
      groups: allGroups,
    };
  }

  // Step 1: Pre-process and normalize each item once
  const preprocessed = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const rawText = getText(item);
    const clean = normalize(rawText);
    preprocessed.push({
      index: i,
      id: getId(item, i),
      original: item,
      clean,
      len: clean.length,
    });
  }

  const visited = new Set();
  const groups = [];
  let totalDuplicates = 0;

  // Length ratio filter constant:
  // For Dice coefficient, max score <= 2 * minLen / (minLen + maxLen).
  // Thus minLen / maxLen must be >= threshold / (2 - threshold).
  // We use a safe bound of (threshold / (2 - threshold)) * 0.95 to account for boundary lengths.
  const minLengthRatio = (threshold / (2 - threshold)) * 0.95;

  // Step 2: Compare pairs with symmetric pruning and visited-set clustering
  for (let i = 0; i < preprocessed.length; i++) {
    const a = preprocessed[i];
    if (visited.has(a.id) || a.len === 0) continue;

    const matchedItems = [];

    for (let j = i + 1; j < preprocessed.length; j++) {
      const b = preprocessed[j];
      if (visited.has(b.id) || b.len === 0) continue;

      // Fast length ratio pre-filter: Skip in O(1) before computing bigrams
      const minLen = Math.min(a.len, b.len);
      const maxLen = Math.max(a.len, b.len);
      if (minLen / maxLen < minLengthRatio) {
        continue;
      }

      const score = similarityFn(a.clean, b.clean);
      if (score >= threshold) {
        matchedItems.push({
          id: b.id,
          item: b.original,
          similarity: Number(score.toFixed(4)),
        });
        visited.add(b.id);
      }
    }

    if (matchedItems.length > 0) {
      visited.add(a.id);
      totalDuplicates += matchedItems.length;
      groups.push({
        primary: {
          id: a.id,
          item: a.original,
        },
        duplicates: matchedItems,
        count: matchedItems.length + 1,
      });
    }
  }

  return {
    totalGroups: groups.length,
    totalDuplicates,
    groups,
  };
}

module.exports = {
  findDuplicates,
  diceCoefficient,
  defaultNormalizer,
};
