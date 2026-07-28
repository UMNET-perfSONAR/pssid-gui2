// Re-deriving a document's denormalised name array from its id array.
//
// This is the step that runs whenever a referenced object is renamed: rename one
// job and every batch's `jobs` array is rebuilt. It has to come back in the SAME
// order it went in, for two independent reasons:
//
//   * A batch runs its jobs in the listed order, and the interface says so, so a
//     reorder here silently changes what the probe executes.
//   * names[i] and *_ids[i] are matched by index everywhere else --
//     delete.service.ts finds a name's position and splices the id at the same
//     position -- so drift makes deleting one object remove another one's id.
//
// The bug these pin down was real: MongoDB's find({_id: {$in: [...]}}) returns
// documents in natural order, not in the order of the array it was handed, and
// the previous implementation used that result directly as the new name list.

import { describe, it, expect } from 'vitest';
import { alignReferences } from '../update.service';

/** Mirrors what the caller builds from the $in result -- deliberately not in id order. */
const lookup = (pairs: Array<[string, string]>) => new Map(pairs);

describe('alignReferences', () => {
  it('returns names in the order of the ids, not the lookup', () => {
    // The lookup is in alphabetical order, as a natural-order $in result would be.
    const nameById = lookup([
      ['a', 'job-alpha'],
      ['b', 'job-bravo'],
      ['c', 'job-charlie'],
    ]);
    const { names } = alignReferences(['c', 'a', 'b'], nameById);
    expect(names).toEqual(['job-charlie', 'job-alpha', 'job-bravo']);
  });

  it('keeps names and ids index-aligned', () => {
    const nameById = lookup([['x', 'one'], ['y', 'two'], ['z', 'three']]);
    const { names, ids } = alignReferences(['z', 'x', 'y'], nameById);
    expect(ids).toEqual(['z', 'x', 'y']);
    names.forEach((n, i) => expect(nameById.get(String(ids[i]))).toBe(n));
  });

  it('drops an id whose document no longer exists, from BOTH arrays', () => {
    // Leaving the stale id behind is what put the two arrays out of step.
    const nameById = lookup([['a', 'job-alpha'], ['b', 'job-bravo']]);
    const { names, ids } = alignReferences(['a', 'deleted-id', 'b'], nameById);
    expect(names).toEqual(['job-alpha', 'job-bravo']);
    expect(ids).toEqual(['a', 'b']);
  });

  it('preserves a repeated reference rather than collapsing it', () => {
    const nameById = lookup([['a', 'job-alpha']]);
    const { names, ids } = alignReferences(['a', 'a'], nameById);
    expect(names).toEqual(['job-alpha', 'job-alpha']);
    expect(ids).toEqual(['a', 'a']);
  });

  it('handles an empty reference list', () => {
    expect(alignReferences([], lookup([]))).toEqual({ names: [], ids: [] });
  });

  it('returns nothing when every referent is gone', () => {
    const { names, ids } = alignReferences(['gone-1', 'gone-2'], lookup([]));
    expect(names).toEqual([]);
    expect(ids).toEqual([]);
  });

  it('compares ids by string, so ObjectId-like values match their lookup key', () => {
    // The real caller keys the map with String(_id) and looks up String(id);
    // an ObjectId is an object, so identity comparison would never match.
    const objectIdLike = { toString: () => 'abc123' };
    const nameById = lookup([['abc123', 'job-alpha']]);
    const { names } = alignReferences([objectIdLike], nameById);
    expect(names).toEqual(['job-alpha']);
  });
});
