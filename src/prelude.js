"use strict";
/**
 * This is the rq standard library as implemented in Javascript.
 *
 * Note that the examples in this file are doctests.  Any line with the format:
 *
 *     <input> → <process> <args>* → <output>
 *
 * ...will be verified as part of the build.
 * @module prelude
 */

// Regex for converting (most) lodash Array JSDoc:
// Search: "_\.(\w+)\(\[([^])]+?)\](?:, ([^)]+))?\);\n \* // => \[(.*)\]$"
// Replace: "$2 => $1($3) => $4"

var _ = require('lodash');

/**
 * Passes through all of the values it sees untouched.
 *
 * @static
 * @this rq.Context
 * @example
 * {"a": 2, "b": 3} → id → {"a": 2, "b": 3}
 * true             → id → true
 */
function* id() {
  while (yield* this.pull()) {
    yield* this.push(this.value);
  }
}

/**
 * Selects the field(s) at the specified path for each value in the stream.
 *
 * @static
 * @this rq.Context
 * @example
 * {"a": {"b": {"c": 3}}} → select "/a/b" → {"c": 3}
 * {"a": {"b": {"c": 3}}} → select "/a/x" → (empty)
 *
 * @param {string} path the field path to follow
 */
function* select(path) {
  var self = this;
  while (yield* this.pull()) {
    var lenses = rq.util.path(this.value, path);
    for (var i = 0; i < lenses.length; i++) {
      var lens = lenses[i];
      var value = lens.get();
      yield* self.push(value);
    }
  }
}

/**
 * Modifies the field at the specified path for each value in the stream, using the specified
 * function.
 *
 * @static
 * @this rq.Context
 * @example
 * {"a": {"b": 2, "c": true}} → modify "/a/b" (n => n + 2) → {"a": {"b": 4, "c": true}}
 * {"a": {"b": 2, "c": true}} → modify "/a/x" (n => n + 2) → {"a": {"b": 2, "c": true}}
 *
 * @param {string} path the field path to follow
 * @param {function(*): *} f the function to apply
 */
function* modify(path, f) {
  while (yield* this.pull()) {
    var lenses = rq.util.path(this.value, path);
    for (var i = 0; i < lenses.length; i++) {
      var lens = lenses[i];
      lens.set(f(lens.get()));
    }
    yield* this.push(this.value);
  }
}

/**
 * Logs each value that passes through to the info log.
 *
 * @static
 * @this rq.Context
 */
function* tee() {
  while (yield* this.pull()) {
    this.log.info(JSON.stringify(this.value));
    yield* this.push(this.value);
  }
}

/**
 * Collects all of the values from the input stream into an array.
 *
 * @static
 * @this rq.Context
 * @example
 * true [] 1 → collect → [true, [], 1]
 */
function* collect() {
  yield* this.push((yield* this.collect()));
}

/**
 * Spreads each array in the input stream into separate output values.
 *
 * @static
 * @this rq.Context
 * @example
 * [1, 2] [3, 4] 5 → spread → 1 2 3 4 5
 */
function* spread() {
  while (yield* this.pull()) {
    if (Array.isArray(this.value)) {
      yield* this.spread(this.value);
    } else {
      yield* this.push(this.value);
    }
  }
}

/**
 * Counts the number of input elements.
 *
 * @static
 * @this rq.Context
 * @method
 * @example
 * 6.1 4.2 6.3         → count → 3
 * "one" "two" "three" → count → 3
 */
var count = size;

/**
 * Checks if `predicate` returns truthy for **all** elements of the input stream.
 * Iteration is stopped once `predicate` returns falsey. The predicate is
 * invoked with two arguments: (value, index).
 *
 * @static
 * @this rq.Context
 * @method
 * @param {Function} [predicate=_.identity]
 *  The function invoked per iteration.
 * @example
 * true 1 null "yes" → all (Boolean) → false
 * // With index
 * 1 2 3 → all (x, i) => { i + 1 == x } → true
 * // The `matches` iteratee shorthand.
 * {"u": "b", "g": 36, "a": false} {"u": "f", "g": 40, "a": false} → all {"u": "b", "a": false} → false
 * // The `matchesProperty` iteratee shorthand.
 * {"u": "b", "g": 36, "a": false} {"u": "f", "g": 40, "a": false} → all ["a", false] → true
 * // The `property` iteratee shorthand.
 * {"u": "b", "g": 36, "a": false} {"u": "f", "g": 40, "a": false} → all "a" → false
 */
var all = every;

/**
 * Checks if `predicate` returns truthy for **any** element of the input stream.
 * Iteration is stopped once `predicate` returns truthy. The predicate is
 * invoked with two arguments: (value, index).
 *
 * @static
 * @this rq.Context
 * @method
 * @param {Function} [predicate=_.identity] The function invoked per iteration.
 * @example
 * null 0 "yes" false → any (Boolean) → true
 * // With index
 * 5 1 8 → any (x, i) => { i == x } → true
 * // The `matches` iteratee shorthand.
 * {"u": "b", "a": true} {"u": "f", "a": false} → any {"u": "b", "a": false} → false
 * // The `matchesProperty` iteratee shorthand.
 * {"u": "b", "a": true} {"u": "f", "a": false} → any ["a", false] → true
 * // The `property` iteratee shorthand.
 * {"u": "b", "a": true} {"u": "f", "a": false} → any "a" → true
 */
var any = some;

/**
 * Creates a stream of elements, with the input sorted in ascending order. This
 * method performs a stable sort, that is, it preserves the original sort order
 * of equal elements.
 *
 * @static
 * @this rq.Context
 * @example
 * 3 1 2 → sort → 1 2 3
 */
function* sort() {
  yield* sortBy.call(this);
}

////////////////////////////////////////////////////////////////////////////////////////////////////
/// lodash wrappers - Array                                                                      ///
///                                                                                              ///
/// NOTE: These are not streaming!                                                               ///
////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a stream of elements split into groups the length of `size`.
 * If the input stream can't be split evenly, the final chunk will be the remaining
 * elements.
 *
 * @static
 * @this rq.Context
 * @param {number} [size=1] The length of each chunk
 * @example
 * "a" "b" "c" "d" → chunk    → ["a"] ["b"] ["c"] ["d"]
 * "a" "b" "c" "d" → chunk  2 → ["a", "b"] ["c", "d"]
 * "a" "b" "c" "d" → chunk  3 → ["a", "b", "c"] ["d"]
 *
 * // Edge cases
 * "a" "b" "c" "d" → chunk -1 → (empty)
 * "a" "b" "c" "d" → chunk  0 → (empty)
 */
function* chunk(size) {
  if (size === undefined) {
    size = 1;
  } else {
    size = Math.max(0, _.toInteger(size));
  }

  if (size > 0) {
    var buffer = [];

    while (yield* this.pull()) {
      buffer.push(this.value);
      if (buffer.length >= size) {
        yield* this.push(buffer);
        buffer = [];
      }
    }

    if (buffer.length > 0) {
      yield* this.push(buffer);
    }
  }
}

/**
 * Creates a stream with all falsey values removed. The values `false`, `null`,
 * `0`, `""`, `undefined`, and `NaN` are falsey.
 *
 * @static
 * @this rq.Context
 * @example
 * 0 1 false 2 "" 3 → compact → 1 2 3
 */
function* compact() {
  while (yield* this.pull()) {
    if (this.value) {
      yield* this.push(this.value);
    }
  }
}

/**
 * Creates a new stream concatenating all input arrays.
 *
 * @static
 * @this rq.Context
 * @example
 * [1] 2 [3] [[4]] → concat → [1, 2, 3, [4]]
 */
function* concat() {
  var result = [];
  while (yield* this.pull()) {
    if (_.isArray(this.value)) {
      result.push.apply(result, this.value);
    } else {
      result.push(this.value);
    }
  }
  yield* this.push(result);
}

/**
 * Creates a stream of values not included in the given array
 * using [`SameValueZero`](http://ecma-international.org/ecma-262/6.0/#sec-samevaluezero)
 * for equality comparisons. The order of result values is determined by the order they occur in
 * the input.
 *
 * @static
 * @this rq.Context
 * @param {Array} [values] The values to exclude.
 * @see without, xor
 * @example
 * 2 1 → difference [2, 3] → 1
 */
function* difference(values) {
  yield* this.spread(_.difference((yield* this.collect()), values));
}

/**
 * This method is like `difference` except that it accepts `iteratee` which
 * is invoked for each element of the input and `values` to generate the criterion
 * by which they're compared. Result values are chosen from the input stream.
 * The iteratee is invoked with one argument: (value).
 *
 * @static
 * @this rq.Context
 * @param {Array} [values] The values to exclude.
 * @param {Function} [iteratee=_.identity] The iteratee invoked per element.
 * @example
 * 2.1 1.2 → differenceBy [2.3, 3.4] (Math.floor) → 1.2
 * // The `property` iteratee shorthand.
 * {"x": 2} {"x": 1} → differenceBy [{"x": 1}] "x" → {"x": 2}
 */
function* differenceBy(values, iteratee) {
  yield* this.spread(_.differenceBy((yield* this.collect()), values, iteratee));
}

/**
 * This method is like `difference` except that it accepts `comparator`
 * which is invoked to compare elements of the input to `values`. The comparator is invoked with
 * two arguments: (inputVal, othVal).
 *
 * @static
 * @this rq.Context
 * @param {Array} [values] The values to exclude.
 * @param {Function} [comparator] The comparator invoked per element.
 * @example
 * {"x": 1, "y": 2} {"x": 2, "y": 1} → differenceWith [{"x": 1, "y": 2}] (_.isEqual) → {"x": 2, "y": 1}
 */
function* differenceWith(values, comparator) {
  yield* this.spread(_.differenceWith((yield* this.collect()), values, comparator));
}

/**
 * Creates a slice of the input stream with `n` elements dropped from the beginning.
 *
 * @static
 * @this rq.Context
 * @param {number} [n=1] The number of elements to drop.
 * @example
 * 1 2 3 → drop   → 2 3
 * 1 2 3 → drop 2 → 3
 * 1 2 3 → drop 5 → (empty)
 * 1 2 3 → drop 0 → 1 2 3
 */
function* drop(n) {
  n = n === undefined ? 1 : _.toInteger(n);
  while (n > 0 && (yield* this.pull())) {
    n -= 1;
  }

  yield* id.call(this);
}

/**
 * Creates a slice of the input stream with `n` elements dropped from the end.
 *
 * @static
 * @this rq.Context
 * @param {number} [n=1] The number of elements to drop.
 * @example
 * 1 2 3 → dropRight   → 1 2
 * 1 2 3 → dropRight 2 → 1
 * 1 2 3 → dropRight 5 → (empty)
 * 1 2 3 → dropRight 0 → 1 2 3
 */
function* dropRight(n) {
  yield* this.spread(_.dropRight((yield* this.collect()), n));
}

/**
 * Creates a slice of the input stream excluding elements dropped from the end.
 * Elements are dropped until `predicate` returns falsey. The predicate is
 * invoked with three arguments: (value, index, array).
 *
 * @static
 * @this rq.Context
 * @param {Function} [predicate=_.identity] The function invoked per iteration.
 * @example
 * {"u": "b", "a": true} {"u": "f", "a": false} {"u": "p", "a": false} → dropRightWhile (o => !o.a) → {"u": "b", "a": true}
 * // The `matches` iteratee shorthand.
 * {"u": "b", "a": true} {"u": "f", "a": false} {"u": "p", "a": false} → dropRightWhile {"u": "p", "a": false} → {"u": "b", "a": true} {"u": "f", "a": false}
 * // The `matchesProperty` iteratee shorthand.
 * {"u": "b", "a": true} {"u": "f", "a": false} {"u": "p", "a": false} → dropRightWhile ["a", false] → {"u": "b", "a": true}
 * // The `property` iteratee shorthand.
 * {"u": "b", "a": true} {"u": "f", "a": false} {"u": "p", "a": false} → dropRightWhile "a" → {"u": "b", "a": true} {"u": "f", "a": false} {"u": "p", "a": false}
 */
function* dropRightWhile(predicate) {
  yield* this.spread(_.dropRightWhile((yield* this.collect()), predicate));
}

/**
 * Creates a slice of the input stream excluding elements dropped from the beginning.
 * Elements are dropped until `predicate` returns falsey. The predicate is
 * invoked with three arguments: (value, index, array).
 *
 * @static
 * @this rq.Context
 * @param {Function} [predicate=_.identity]
 *  The function invoked per iteration.
 * @example
 * {"u": "b", "a": false} {"u": "f", "a": false} {"u": "p", "a": true} → dropWhile (o => !o.a) → {"u": "p", "a": true}
 * // The `matches` iteratee shorthand.
 * {"u": "b", "a": false} {"u": "f", "a": false} {"u": "p", "a": true} → dropWhile {"u": "b", "a": false} → {"u": "f", "a": false} {"u": "p", "a": true}
 * // The `matchesProperty` iteratee shorthand.
 * {"u": "b", "a": false} {"u": "f", "a": false} {"u": "p", "a": true} → dropWhile ["a", false] → {"u": "p", "a": true}
 * // The `property` iteratee shorthand.
 * {"u": "b", "a": false} {"u": "f", "a": false} {"u": "p", "a": true} → dropWhile "a" → {"u": "b", "a": false} {"u": "f", "a": false} {"u": "p", "a": true}
 */
function* dropWhile(predicate) {
  yield* this.spread(_.dropWhile((yield* this.collect()), predicate));
}

/**
 * Fills elements of the input stream with `value` from `start` up to, but not
 * including, `end`.
 *
 * @static
 * @this rq.Context
 * @param {*} value The value to fill the input stream with.
 * @param {number} [start=0] The start position.
 * @param {number} [end=array.length] The end position.
 * @example
 * 4 6 8 10 → fill "*" 1 3 → 4 "*" "*" 10
 */
function* fill(value, start, end) {
  yield* this.spread(_.fill((yield* this.collect()), value, start, end));
}

/**
 * This method is like `find` except that it returns the index of the first
 * element `predicate` returns truthy for instead of the element itself.
 *
 * @static
 * @this rq.Context
 * @param {Function} [predicate=_.identity]
 *  The function invoked per iteration.
 * @param {number} [fromIndex=0] The index to search from.
 * @example
 * {"u": "b", "a": false} {"u": "f", "a": false} {"u": "p", "a": true} → findIndex (o => o.u == 'b') → 0
 * // The `matches` iteratee shorthand.
 * {"u": "b", "a": false} {"u": "f", "a": false} {"u": "p", "a": true} → findIndex {"u": "f", "a": false} → 1
 * // The `matchesProperty` iteratee shorthand.
 * {"u": "b", "a": false} {"u": "f", "a": false} {"u": "p", "a": true} → findIndex ["a", false] → 0
 * // The `property` iteratee shorthand.
 * {"u": "b", "a": false} {"u": "f", "a": false} {"u": "p", "a": true} → findIndex "a" → 2
 */
function* findIndex(predicate, fromIndex) {
  yield* this.push(_.findIndex((yield* this.collect()), predicate, fromIndex));
}

/**
 * This method is like `findIndex` except that it iterates over elements
 * of `collection` from right to left.
 *
 * @static
 * @this rq.Context
 * @param {Function} [predicate=_.identity]
 *  The function invoked per iteration.
 * @param {number} [fromIndex=array.length-1] The index to search from.
 * @example
 * {"u": "b", "a": true} {"u": "f", "a": false} {"u": "p", "a": false} → findLastIndex (o => o.u == 'p') → 2
 * // The `matches` iteratee shorthand.
 * {"u": "b", "a": true} {"u": "f", "a": false} {"u": "p", "a": false} → findLastIndex {"u": "b", "a": true} → 0
 * // The `matchesProperty` iteratee shorthand.
 * {"u": "b", "a": true} {"u": "f", "a": false} {"u": "p", "a": false} → findLastIndex ["a", false] → 2
 * // The `property` iteratee shorthand.
 * {"u": "b", "a": true} {"u": "f", "a": false} {"u": "p", "a": false} → findLastIndex "a" → 0
 */
function* findLastIndex(predicate, fromIndex) {
  yield* this.push(_.findLastIndex((yield* this.collect()), predicate, fromIndex));
}

/**
 * Flattens the input stream a single level deep.
 *
 * @static
 * @this rq.Context
 * @example
 * 1  [2, [3, [4]], 5] → flatten → 1 2 [3, [4]] 5
 */
function* flatten() {
  yield* this.spread(_.flatten((yield* this.collect())));
}

/**
 * Recursively flattens the input stream.
 *
 * @static
 * @this rq.Context
 * @example
 * 1 [2, [3, [4]], 5] → flattenDeep → 1 2 3 4 5
 */
function* flattenDeep() {
  yield* this.spread(_.flattenDeep((yield* this.collect())));
}

/**
 * Recursively flatten the input stream up to `depth` times.
 *
 * @static
 * @this rq.Context
 * @param {number} [depth=1] The maximum recursion depth.
 * @example
 * 1 [2, [3, [4]], 5] → flattenDepth 1 → 1 2 [3, [4]] 5
 * 1 [2, [3, [4]], 5] → flattenDepth 2 → 1 2 3 [4] 5
 */
function* flattenDepth(depth) {
  yield* this.spread(_.flattenDepth((yield* this.collect()), depth));
}

/**
 * The inverse of `toPairs`; this method returns an object composed
 * from key-value `pairs`.
 *
 * @static
 * @this rq.Context
 * @example
 * ["a", 1] ["b", 2] → fromPairs → {"a": 1, "b": 2}
 */
function* fromPairs() {
  yield* this.push(_.fromPairs((yield* this.collect())));
}

/**
 * Gets the first element of the input stream.
 *
 * @static
 * @this rq.Context
 * @example
 * 1 2 3   → head → 1
 * (empty) → head → null
 */
function* head() {
  yield* this.push(_.head((yield* this.collect())));
}

/**
 * Gets the index at which the first occurrence of `value` is found in the input stream
 * using [`SameValueZero`](http://ecma-international.org/ecma-262/6.0/#sec-samevaluezero)
 * for equality comparisons. If `fromIndex` is negative, it's used as the
 * offset from the end of the input stream.
 *
 * @static
 * @this rq.Context
 * @param {*} value The value to search for.
 * @param {number} [fromIndex=0] The index to search from.
 * @example
 * 1 2 1 2 → indexOf 2   → 1
 * // Search from the `fromIndex`.
 * 1 2 1 2 → indexOf 2 2 → 3
 */
function* indexOf(value, fromIndex) {
  yield* this.push(_.indexOf((yield* this.collect()), value, fromIndex));
}

/**
 * Gets all but the last element of the input stream.
 *
 * @static
 * @this rq.Context
 * @example
 * 1 2 3 → initial → 1 2
 */
function* initial() {
  yield* this.spread(_.initial((yield* this.collect())));
}

/**
 * Creates a stream of unique values that are included in the given array
 * using [`SameValueZero`](http://ecma-international.org/ecma-262/6.0/#sec-samevaluezero)
 * for equality comparisons. The order of result values is determined by the
 * order they occur in the input stream.
 *
 * @static
 * @this rq.Context
 * @param {Array} [values] The values to inspect.
 * @example
 * 2 1 → intersection [2, 3] → 2
 */
function* intersection(values) {
  yield* this.spread(_.intersection((yield* this.collect()), values));
}

/**
 * This method is like `intersection` except that it accepts `iteratee`
 * which is invoked for each element in `values` to generate the criterion
 * by which they're compared. Result values are chosen from the input stream.
 * The iteratee is invoked with one argument: (value).
 *
 * @static
 * @this rq.Context
 * @param {Array} [values] The values to inspect.
 * @param {Function} [iteratee=_.identity] The iteratee invoked per element.
 * @example
 * 2.1 1.2 → intersectionBy [2.3, 3.4] (Math.floor) → 2.1
 * // The `property` iteratee shorthand.
 * {"x": 1} → intersectionBy [{"x": 2}, {"x": 1}] "x" → {"x": 1}
 */
function* intersectionBy(values, iteratee) {
  yield* this.spread(_.intersectionBy((yield* this.collect()), values, iteratee));
}

/**
 * This method is like `intersection` except that it accepts `comparator`
 * which is invoked to compare elements of `values`. Result values are chosen
 * from the input stream. The comparator is invoked with two arguments:
 * (arrVal, othVal).
 *
 * @static
 * @this rq.Context
 * @param {Array} [values] The values to inspect.
 * @param {Function} [comparator] The comparator invoked per element.
 * @example
 * {"x": 1, "y": 2} {"x": 2, "y": 1} → intersectionWith [{"x": 1, "y": 1}, {"x": 1, "y": 2}] (_.isEqual) → {"x": 1, "y": 2}
 */
function* intersectionWith(values, comparator) {
  yield* this.spread(_.intersectionWith((yield* this.collect()), values, comparator));
}

/**
 * Converts all elements in the input stream into a string separated by `separator`.
 *
 * @static
 * @this rq.Context
 * @param {string} [separator=','] The element separator.
 * @example
 * "a" "b" "c" → join     → "a,b,c"
 * "a" "b" "c" → join "~" → "a~b~c"
 */
function* join(separator) {
  yield* this.push(_.join((yield* this.collect()), separator));
}

/**
 * Gets the last element of the input stream.
 *
 * @static
 * @this rq.Context
 * @example
 * 1 2 3 → last → 3
 */
function* last() {
  yield* this.push(_.last((yield* this.collect())));
}

/**
 * This method is like `indexOf` except that it iterates over elements of
 * the input stream from right to left.
 *
 * @static
 * @this rq.Context
 * @param {*} value The value to search for.
 * @param {number} [fromIndex=array.length-1] The index to search from.
 * @example
 * 1 2 1 2 → lastIndexOf 2   → 3
 * 1 2 1 2 → lastIndexOf 2 2 → 1
 */
function* lastIndexOf(value, fromIndex) {
  yield* this.push(_.lastIndexOf((yield* this.collect()), value, fromIndex));
}

/**
 * Gets the element at index `n` of the input stream. If `n` is negative, the nth
 * element from the end is returned.
 *
 * @static
 * @this rq.Context
 * @param {number} [n=0] The index of the element to return.
 * @example
 * "a" "b" "c" "d" → nth  1 → "b"
 * "a" "b" "c" "d" → nth -2 → "c"
 */
function* nth(n) {
  yield* this.push(_.nth((yield* this.collect()), n));
}

// pull, pullAll, pullAllBy, pullAllWith, pullAt, remove don't make sense

/**
 * Reverses the input stream so that the first element becomes the last, the second
 * element becomes the second to last, and so on.
 *
 * @static
 * @this rq.Context
 * @example
 * 1 2 3 → reverse → 3 2 1
 */
function* reverse() {
  yield* this.spread(_.reverse((yield* this.collect())));
}

/**
 * Creates a slice of the input stream from `start` up to, but not including, `end`.
 *
 * @static
 * @this rq.Context
 * @param {number} [start=0] The start position.
 * @param {number} [end=array.length] The end position.
 * @example
 * 1 2 3 4 → slice 1 3 → 2 3
 */
function* slice(start, end) {
  yield* this.spread(_.slice((yield* this.collect()), start, end));
}

/**
 * Uses a binary search to determine the lowest index at which `value`
 * should be inserted into the input stream in order to maintain its sort order.
 *
 * @static
 * @this rq.Context
 * @param {*} value The value to evaluate.
 *  into the input stream.
 * @example
 * 30 50 → sortedIndex 40 → 1
 */
function* sortedIndex(value) {
  yield* this.push(_.sortedIndex((yield* this.collect()), value));
}

/**
 * This method is like `sortedIndex` except that it accepts `iteratee`
 * which is invoked for `value` and each element of the input stream to compute their
 * sort ranking. The iteratee is invoked with one argument: (value).
 *
 * @static
 * @this rq.Context
 * @param {*} value The value to evaluate.
 * @param {Function} [iteratee=_.identity]
 *  The iteratee invoked per element.
 *  into the input stream.
 * @example
 * {"x": 4} {"x": 5} → sortedIndexBy {"x": 4} (o => o.x) → 0
 * // The `property` iteratee shorthand.
 * {"x": 4} {"x": 5} → sortedIndexBy {"x": 4} "x" → 0
 */
function* sortedIndexBy(value, iteratee) {
  yield* this.push(_.sortedIndexBy((yield* this.collect()), value, iteratee));
}

/**
 * This method is like `indexOf` except that it performs a binary
 * search on a sorted the input stream.
 *
 * @static
 * @this rq.Context
 * @param {*} value The value to search for.
 * @example
 * 4 5 5 5 6 → sortedIndexOf 5 → 1
 */
function* sortedIndexOf(value) {
  yield* this.push(_.sortedIndexOf((yield* this.collect()), value));
}

/**
 * This method is like `sortedIndex` except that it returns the highest
 * index at which `value` should be inserted into the input stream in order to
 * maintain its sort order.
 *
 * @static
 * @this rq.Context
 * @param {*} value The value to evaluate.
 *  into the input stream.
 * @example
 * 4 5 5 5 6 → sortedLastIndex 5 → 4
 */
function* sortedLastIndex(value) {
  yield* this.push(_.sortedLastIndex((yield* this.collect()), value));
}

/**
 * This method is like `sortedLastIndex` except that it accepts `iteratee`
 * which is invoked for `value` and each element of the input stream to compute their
 * sort ranking. The iteratee is invoked with one argument: (value).
 *
 * @static
 * @this rq.Context
 * @param {*} value The value to evaluate.
 * @param {Function} [iteratee=_.identity]
 *  The iteratee invoked per element.
 *  into the input stream.
 * @example
 * {"x": 4} {"x": 5} → sortedLastIndexBy {"x": 4} (o => o.x) → 1
 * // The `property` iteratee shorthand.
 * {"x": 4} {"x": 5} → sortedLastIndexBy {"x": 4} "x" → 1
 */
function* sortedLastIndexBy(value, iteratee) {
  yield* this.push(_.sortedLastIndexBy((yield* this.collect()), value, iteratee));
}

/**
 * This method is like `lastIndexOf` except that it performs a binary
 * search on a sorted the input stream.
 *
 * @static
 * @this rq.Context
 * @param {*} value The value to search for.
 * @example
 * 4 5 5 5 6 → sortedLastIndexOf 5 → 3
 */
function* sortedLastIndexOf(value) {
  yield* this.push(_.sortedLastIndexOf((yield* this.collect()), value));
}

/**
 * This method is like `uniq` except that it's designed and optimized
 * for sorted arrays.
 *
 * @static
 * @this rq.Context
 * @example
 * 1 1 2 → sortedUniq → 1 2
 */
function* sortedUniq() {
  yield* this.spread(_.sortedUniq((yield* this.collect())));
}

/**
 * This method is like `uniqBy` except that it's designed and optimized
 * for sorted arrays.
 *
 * @static
 * @this rq.Context
 * @param {Function} [iteratee] The iteratee invoked per element.
 * @example
 * 1.1 1.2 2.3 2.4 → sortedUniqBy (Math.floor) → 1.1 2.3
 */
function* sortedUniqBy(iteratee) {
  yield* this.spread(_.sortedUniqBy((yield* this.collect()), iteratee));
}

/**
 * Gets all but the first element of the input stream.
 *
 * @static
 * @this rq.Context
 * @example
 * 1 2 3 → tail → 2 3
 */
function* tail() {
  yield* this.spread(_.tail((yield* this.collect())));
}

/**
 * Creates a slice of the input stream with `n` elements taken from the beginning.
 *
 * @static
 * @this rq.Context
 * @param {number} [n=1] The number of elements to take.
 * @example
 * 1 2 3 → take   → 1
 * 1 2 3 → take 2 → 1 2
 * 1 2 3 → take 5 → 1 2 3
 * 1 2 3 → take 0 → (empty)
 */
function* take(n) {
  yield* this.spread(_.take((yield* this.collect()), n));
}

/**
 * Creates a slice of the input stream with `n` elements taken from the end.
 *
 * @static
 * @this rq.Context
 * @param {number} [n=1] The number of elements to take.
 * @example
 * 1 2 3 → takeRight   → 3
 * 1 2 3 → takeRight 2 → 2 3
 * 1 2 3 → takeRight 5 → 1 2 3
 * 1 2 3 → takeRight 0 → (empty)
 */
function* takeRight(n) {
  yield* this.spread(_.takeRight((yield* this.collect()), n));
}

/**
 * Creates a slice of the input stream with elements taken from the end. Elements are
 * taken until `predicate` returns falsey. The predicate is invoked with
 * three arguments: (value, index, array).
 *
 * @static
 * @this rq.Context
 * @param {Function} [predicate=_.identity]
 *  The function invoked per iteration.
 * @example
 * {"u": "b", "a": true} {"u": "f", "a": false} {"u": "p", "a": false} → takeRightWhile (o => !o.a) → {"u": "f", "a": false} {"u": "p", "a": false}
 * // The `matches` iteratee shorthand.
 * {"u": "b", "a": true} {"u": "f", "a": false} {"u": "p", "a": false} → takeRightWhile {"u": "p", "a": false} → {"u": "p", "a": false}
 * // The `matchesProperty` iteratee shorthand.
 * {"u": "b", "a": true} {"u": "f", "a": false} {"u": "p", "a": false} → takeRightWhile ["a", false] → {"u": "f", "a": false} {"u": "p", "a": false}
 * // The `property` iteratee shorthand.
 * {"u": "b", "a": true} {"u": "f", "a": false} {"u": "p", "a": false} → takeRightWhile "a" → (empty)
 */
function* takeRightWhile(predicate) {
  yield* this.spread(_.takeRightWhile((yield* this.collect()), predicate));
}

/**
 * Creates a slice of the input stream with elements taken from the beginning. Elements
 * are taken until `predicate` returns falsey. The predicate is invoked with
 * three arguments: (value, index, array).
 *
 * @static
 * @this rq.Context
 * @param {Function} [predicate=_.identity]
 *  The function invoked per iteration.
 * @example
 * {"u": "b", "a": false} {"u": "f", "a": false} {"u": "p", "a": true} → takeWhile (o => !o.a) → {"u": "b", "a": false} {"u": "f", "a": false}
 * // The `matches` iteratee shorthand.
 * {"u": "b", "a": false} {"u": "f", "a": false} {"u": "p", "a": true} → takeWhile {"u": "b", "a": false} → {"u": "b", "a": false}
 * // The `matchesProperty` iteratee shorthand.
 * {"u": "b", "a": false} {"u": "f", "a": false} {"u": "p", "a": true} → takeWhile ["a", false] → {"u": "b", "a": false} {"u": "f", "a": false}
 * // The `property` iteratee shorthand.
 * {"u": "b", "a": false} {"u": "f", "a": false} {"u": "p", "a": true} → takeWhile "a" → (empty)
 */
function* takeWhile(predicate) {
  yield* this.spread(_.takeWhile((yield* this.collect()), predicate));
}

/**
 * Creates a stream of unique values, in order, from all given values using
 * [`SameValueZero`](http://ecma-international.org/ecma-262/6.0/#sec-samevaluezero)
 * for equality comparisons.
 *
 * @static
 * @this rq.Context
 * @param {Array} [values] The values to inspect.
 * @example
 * 2 → union [1, 2] → 2 1
 */
function* union(values) {
  yield* this.spread(_.union((yield* this.collect()), values));
}

/**
 * This method is like `union` except that it accepts `iteratee` which is
 * invoked for each element of `values` to generate the criterion by
 * which uniqueness is computed. Result values are chosen from the input stream.
 * The iteratee is invoked with one argument: (value).
 *
 * @static
 * @this rq.Context
 * @param {Array} [values] The values to inspect.
 * @param {Function} [iteratee=_.identity]
 *  The iteratee invoked per element.
 * @example
 * 2.1 → unionBy [1.2, 2.3] (Math.floor) → 2.1 1.2
 * // The `property` iteratee shorthand.
 * {"x": 1} → unionBy [{"x": 2}, {"x": 1}] "x" → {"x": 1} {"x": 2}
 */
function* unionBy(values, iteratee) {
  yield* this.spread(_.unionBy((yield* this.collect()), values, iteratee));
}

/**
 * This method is like `union` except that it accepts `comparator` which
 * is invoked to compare elements of `values`. Result values are chosen from
 * the input stream. The comparator is invoked with two arguments: (arrVal, othVal).
 *
 * @static
 * @this rq.Context
 * @param {Array} [values] The values to inspect.
 * @param {Function} [comparator] The comparator invoked per element.
 * @example
 * {"x": 1, "y": 2} {"x": 2, "y": 1} → unionWith [{"x": 1, "y": 1}, {"x": 1, "y": 2}] (_.isEqual) → {"x": 1, "y": 2} {"x": 2, "y": 1} {"x": 1, "y": 1}
 */
function* unionWith(values, comparator) {
  yield* this.spread(_.unionWith((yield* this.collect()), values, comparator));
}

/**
 * Creates a duplicate-free version of the input stream, using
 * [`SameValueZero`](http://ecma-international.org/ecma-262/6.0/#sec-samevaluezero)
 * for equality comparisons, in which only the first occurrence of each
 * element is kept.
 *
 * @static
 * @this rq.Context
 * @example
 * 2 1 2 → uniq → 2 1
 */
function* uniq() {
  yield* this.spread(_.uniq((yield* this.collect())));
}

/**
 * This method is like `uniq` except that it accepts `iteratee` which is
 * invoked for each element in the input stream to generate the criterion by which
 * uniqueness is computed. The iteratee is invoked with one argument: (value).
 *
 * @static
 * @this rq.Context
 * @param {Function} [iteratee=_.identity]
 *  The iteratee invoked per element.
 * @example
 * 2.1 1.2 2.3 → uniqBy (Math.floor) → 2.1 1.2
 * // The `property` iteratee shorthand.
 * {"x": 1} {"x": 2} {"x": 1} → uniqBy "x" → {"x": 1} {"x": 2}
 */
function* uniqBy(iteratee) {
  yield* this.spread(_.uniqBy((yield* this.collect()), iteratee));
}

/**
 * This method is like `uniq` except that it accepts `comparator` which
 * is invoked to compare elements of the input stream. The comparator is invoked with
 * two arguments: (arrVal, othVal).
 *
 * @static
 * @this rq.Context
 * @param {Function} [comparator] The comparator invoked per element.
 * @example
 * {"x": 1, "y": 2} {"x": 2, "y": 1} {"x": 1, "y": 2} → uniqWith (_.isEqual) → {"x": 1, "y": 2} {"x": 2, "y": 1}
 */
function* uniqWith(comparator) {
  yield* this.spread(_.uniqWith((yield* this.collect()), comparator));
}

/**
 * This method is like `zip` except that it accepts a stream of grouped
 * elements and creates an array regrouping the elements to their pre-zip
 * configuration.
 *
 * @static
 * @this rq.Context
 * @example
 * ["a", 1, true] ["b", 2, false] → unzip → ["a", "b"] [1, 2] [true, false]
 */
function* unzip() {
  yield* this.spread(_.unzip((yield* this.collect())));
}

/**
 * This method is like `unzip` except that it accepts `iteratee` to specify
 * how regrouped values should be combined. The iteratee is invoked with the
 * elements of each group: (...group).
 *
 * @static
 * @this rq.Context
 * @param {Function} [iteratee=_.identity] The function to combine
 *  regrouped values.
 * @example
 * [1, 10, 100] [2, 20, 200] → unzipWith (_.add) → 3 30 300
 */
function* unzipWith(iteratee) {
  yield* this.spread(_.unzipWith((yield* this.collect()), iteratee));
}

/**
 * Creates a stream excluding all given values using
 * [`SameValueZero`](http://ecma-international.org/ecma-262/6.0/#sec-samevaluezero)
 * for equality comparisons.
 *
 * @static
 * @this rq.Context
 * @param {...*} [values] The values to exclude.
 * @see _.difference, _.xor
 * @example
 * 2 1 2 3 → without 1 2 → 3
 */
function* without(values) {
  var args = Array.prototype.slice.call(arguments);
  args.unshift((yield* this.collect()));
  yield* this.spread(_.without.apply(null, args));
}

/**
 * Creates a stream of unique values that is the
 * [symmetric difference](https://en.wikipedia.org/wiki/Symmetric_difference)
 * of the given values. The order of result values is determined by the order
 * they occur in the input stream.
 *
 * @static
 * @this rq.Context
 * @param {Array} [values] The values to inspect.
 * @see _.difference, _.without
 * @example
 * 2 1 → xor [2, 3] → 1 3
 */
function* xor(values) {
  yield* this.spread(_.xor((yield* this.collect()), values));
}

/**
 * This method is like `xor` except that it accepts `iteratee` which is
 * invoked for each element of each `values` to generate the criterion by
 * which by which they're compared. The iteratee is invoked with one argument:
 * (value).
 *
 * @static
 * @this rq.Context
 * @param {Array} [values] The arrays to inspect.
 * @param {Function} [iteratee=_.identity]
 *  The iteratee invoked per element.
 * @example
 * 2.1 1.2 → xorBy [2.3, 3.4] (Math.floor) → 1.2 3.4
 * // The `property` iteratee shorthand.
 * {"x": 1} → xorBy [{"x": 2}, {"x": 1}] "x" → {"x": 2}
 */
function* xorBy(values, iteratee) {
  yield* this.spread(_.xorBy((yield* this.collect()), values, iteratee));
}

/**
 * This method is like `xor` except that it accepts `comparator` which is
 * invoked to compare elements of `values`. The comparator is invoked with
 * two arguments: (arrVal, othVal).
 *
 * @static
 * @this rq.Context
 * @param {Array} [values] The values to inspect.
 * @param {Function} [comparator] The comparator invoked per element.
 * @example
 * {"x": 1, "y": 2} {"x": 2, "y": 1} → xorWith [{"x": 1, "y": 1}, {"x": 1, "y": 2}] (_.isEqual) → {"x": 2, "y": 1} {"x": 1, "y": 1}
 */
function* xorWith(values, comparator) {
  yield* this.spread(_.xorWith((yield* this.collect()), values, comparator));
}

/**
 * Creates a stream of grouped elements, the first of which contains the
 * first elements of the given arrays, the second of which contains the
 * second elements of the given arrays, and so on.
 *
 * @static
 * @this rq.Context
 * @example
 * ["a", "b"] [1, 2] [true, false] → zip → ["a", 1, true] ["b", 2, false]
 */
function* zip() {
  yield* this.spread(_.zip.apply(null, (yield* this.collect())));
}

// zipObject and zipObjectDeep don't make sense

/**
 * This method is like `zip` except that it accepts `iteratee` to specify
 * how grouped values should be combined. The iteratee is invoked with the
 * elements of each group: (...group).
 *
 * @static
 * @this rq.Context
 * @param {Function} [iteratee=_.identity] The function to combine grouped values.
 * @example
 *
 * [1, 2] [10, 20] [100, 200] → zipWith (a, b, c)=>{a + b + c} → 111 222
 */
function* zipWith(iteratee) {
  var args = [];
  while (yield* this.pull()) {
    args.push(this.value);
  }
  args.push(iteratee);
  yield* this.spread(_.zipWith.apply(null, args));
}

////////////////////////////////////////////////////////////////////////////////////////////////////
/// lodash wrappers - Collection                                                                 ///
///                                                                                              ///
/// NOTE: These are not streaming!                                                               ///
////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Checks if `predicate` returns truthy for **all** elements of the input stream.
 * Iteration is stopped once `predicate` returns falsey. The predicate is
 * invoked with two arguments: (value, index).
 *
 * @static
 * @this rq.Context
 * @param {Function} [predicate=_.identity]
 *  The function invoked per iteration.
 * @example
 * true 1 null "yes" → every (Boolean) → false
 * // With index
 * 1 2 3 → every (x, i) => { i + 1 == x } → true
 * // The `matches` iteratee shorthand.
 * {"u": "b", "g": 36, "a": false} {"u": "f", "g": 40, "a": false} → every {"u": "b", "a": false} → false
 * // The `matchesProperty` iteratee shorthand.
 * {"u": "b", "g": 36, "a": false} {"u": "f", "g": 40, "a": false} → every ["a", false] → true
 * // The `property` iteratee shorthand.
 * {"u": "b", "g": 36, "a": false} {"u": "f", "g": 40, "a": false} → every "a" → false
 */
function* every(predicate) {
  predicate = _.iteratee(predicate);

  var i = 0;
  while (yield* this.pull()) {
    if (!predicate(this.value, i)) {
      yield* this.push(false);
      return;
    }
    i++;
  }

  yield* this.push(true);
}

/**
 * Creates an object composed of keys generated from the results of running
 * each element of the input stream thru `iteratee`. The corresponding value of
 * each key is the number of times the key was returned by `iteratee`. The
 * iteratee is invoked with one argument: (value).
 *
 * @static
 * @this rq.Context
 * @param {Function} [iteratee=_.identity]
 *  The iteratee to transform keys.
 * @example
 *
 * 6.1 4.2 6.3         → countBy (Math.floor) → {"4": 1, "6": 2}
 * "one" "two" "three" → countBy "length"     → {"3": 2, "5": 1}
 */
function* countBy(iteratee) {
  yield* this.push(_.countBy((yield* this.collect()), iteratee));
}

/**
 * Iterates over elements of the input stream, returning an array of all elements
 * `predicate` returns truthy for. The predicate is invoked with two
 * arguments: (value, index).
 *
 * **Note:** Unlike `remove`, this method returns a new array.
 *
 * @static
 * @this rq.Context
 * @param {Function} [predicate=_.identity]
 *  The function invoked per iteration.
 * @see _.reject
 * @example
 * "a" "b"  "c"   → filter (s)=>{"a" === s}     → "a"
 * "a" "ab" "abc" → filter (s)=>{s.length == 2} → "ab"
 * "a" "ab" "abc" → filter (s, i)=>{i % 2 == 0} → "a" "abc"
 * {"u": "b", "g": 36, "a": true} {"u": "f", "g": 40, "a": false} → filter (o)=>{!o.a} → {"u": "f", "g": 40, "a": false}
 * // The `matches` iteratee shorthand.
 * {"u": "b", "g": 36, "a": true} {"u": "f", "g": 40, "a": false} → filter {"g": 36, "a": true} → {"u": "b", "g": 36, "a": true}
 * // The `matchesProperty` iteratee shorthand.
 * {"u": "b", "g": 36, "a": true} {"u": "f", "g": 40, "a": false} → filter ["a", false] → {"u": "f", "g": 40, "a": false}
 * // The `property` iteratee shorthand.
 * {"u": "b", "g": 36, "a": true} {"u": "f", "g": 40, "a": false} → filter "a" → {"u": "b", "g": 36, "a": true}
 */
function* filter(predicate) {
  predicate = _.iteratee(predicate);

  var i = 0;
  while (yield* this.pull()) {
    if (predicate(this.value, i)) {
      yield* this.push(this.value);
    }
    i++;
  }
}

/**
 * Iterates over elements of the input stream, returning the first element
 * `predicate` returns truthy for. The predicate is invoked with two
 * arguments: (value, index).
 *
 * @static
 * @this rq.Context
 * @param {Function} [predicate=_.identity]
 *  The function invoked per iteration.
 * @example
 * {"u": "b", "g": 36, "a": true} {"u": "f", "g": 40, "a": false} {"u": "p", "g": 1, "a": true} → find (o)=>{o.g < 40} → {"u": "b", "g": 36, "a": true}
 * // The `matches` iteratee shorthand.
 * {"u": "b", "g": 36, "a": true} {"u": "f", "g": 40, "a": false} {"u": "p", "g": 1, "a": true} → find {"g": 1, "a": true} → {"u": "p", "g": 1, "a": true}
 * // The `matchesProperty` iteratee shorthand.
 * {"u": "b", "g": 36, "a": true} {"u": "f", "g": 40, "a": false} {"u": "p", "g": 1, "a": true} → find ["a", false] → {"u": "f", "g": 40, "a": false}
 * // The `property` iteratee shorthand.
 * {"u": "b", "g": 36, "a": true} {"u": "f", "g": 40, "a": false} {"u": "p", "g": 1, "a": true} → find "a" → {"u": "b", "g": 36, "a": true}
 */
function* find(predicate) {
  predicate = _.iteratee(predicate);

  var i = 0;
  while (yield* this.pull()) {
    if (predicate(this.value, i)) {
      yield* this.push(this.value);
      return;
    }
    i++;
  }
}

/**
 * This method is like `find` except that it iterates over elements of
 * the input stream from right to left.
 *
 * @static
 * @this rq.Context
 * @param {Function} [predicate=_.identity]
 *  The function invoked per iteration.
 * @param {number} [fromIndex=collection.length-1] The index to search from.
 * @example
 * 1 2 3 4 → findLast (n)=>{n % 2 == 1} → 3
 */
function* findLast(predicate, fromIndex) {
  yield* this.push(_.findLast((yield* this.collect()), predicate, fromIndex));
}
/**
 * Creates a flattened array of values by running each element in the input stream
 * thru `iteratee` and flattening the mapped results. The iteratee is invoked
 * with three arguments: (value, index|key, collection).
 *
 * @static
 * @this rq.Context
 * @param {Function} [iteratee=_.identity]
 *  The function invoked per iteration.
 * @example
 * 1 2 → flatMap (n)=>{[n, n]} → 1 1 2 2
 */
function* flatMap(iteratee) {
  yield* this.spread(_.flatMap((yield* this.collect()), iteratee));
}

/**
 * This method is like `flatMap` except that it recursively flattens the
 * mapped results.
 *
 * @static
 * @this rq.Context
 * @param {Function} [iteratee=_.identity]
 *  The function invoked per iteration.
 * @example
 * 1 2 → flatMapDeep (n)=>{[[[n, n]]]} → 1 1 2 2
 */
function* flatMapDeep(iteratee) {
  yield* this.spread(_.flatMapDeep((yield* this.collect()), iteratee));
}

/**
 * This method is like `flatMap` except that it recursively flattens the
 * mapped results up to `depth` times.
 *
 * @static
 * @this rq.Context
 * @param {Function} [iteratee=_.identity]
 *  The function invoked per iteration.
 * @param {number} [depth=1] The maximum recursion depth.
 * @example
 * 1 2 → flatMapDepth (n)=>{[[[n, n]]]} 2 → [1, 1] [2, 2]
 */
function* flatMapDepth(iteratee, depth) {
  yield* this.spread(_.flatMapDepth((yield* this.collect()), iteratee, depth));
}

// forEach and forEachRight make no sense

/**
 * Creates an object composed of keys generated from the results of running
 * each element of the input stream thru `iteratee`. The order of grouped values
 * is determined by the order they occur in the input stream. The corresponding
 * value of each key is an array of elements responsible for generating the
 * key. The iteratee is invoked with one argument: (value).
 *
 * @static
 * @this rq.Context
 * @param {Function} [iteratee=_.identity]
 *  The iteratee to transform keys.
 * @example
 *
 * 6.1 4.2 6.3 → groupBy (Math.floor) → {"4": [4.2], "6": [6.1, 6.3]}
 * // The `property` iteratee shorthand.
 * "one" "two" "three" → groupBy "length" → {"3": ["one", "two"], "5": ["three"]}
 */
function* groupBy(iteratee) {
  yield* this.push(_.groupBy((yield* this.collect()), iteratee));
}

/**
 * Checks if `value` is in the input stream. If the input stream is a string, it's
 * checked for a substring of `value`, otherwise
 * [`SameValueZero`](http://ecma-international.org/ecma-262/6.0/#sec-samevaluezero)
 * is used for equality comparisons. If `fromIndex` is negative, it's used as
 * the offset from the end of the input stream.
 *
 * @static
 * @this rq.Context
 * @param {*} value The value to search for.
 * @param {number} [fromIndex=0] The index to search from.
 * @example
 *
 * 1 2 3 → includes 1   → true
 * 1 2 3 → includes 1 2 → false
 */
function* includes(value, fromIndex) {
  yield* this.push(_.includes((yield* this.collect()), value, fromIndex));
}

/**
 * Invokes the method at `path` of each element in the input stream, returning
 * an array of the results of each invoked method. Any additional arguments
 * are provided to each invoked method. If `path` is a function, it's invoked
 * for, and `this` bound to, each element in the input stream.
 *
 * @static
 * @this rq.Context
 * @param {Array|Function|string} path The path of the method to invoke or
 *  the function invoked per iteration.
 * @param {...*} [args] The arguments to invoke each method with.
 * @example
 * [5, 1, 7] [3, 2, 1] → invokeMap "sort" → [1, 5, 7] [1, 2, 3]
 * "123" "456" → invokeMap "split" "" → ["1", "2", "3"] ["4", "5", "6"]
 */
function* invokeMap(path, args) {
  var fullArgs = Array.prototype.slice.call(arguments);
  fullArgs.unshift((yield* this.collect()));
  yield* this.spread(_.invokeMap.apply(null, fullArgs));
}

/**
 * Creates an object composed of keys generated from the results of running
 * each element of the input stream thru `iteratee`. The corresponding value of
 * each key is the last element responsible for generating the key. The
 * iteratee is invoked with one argument: (value).
 *
 * @static
 * @this rq.Context
 * @param {Function} [iteratee=_.identity]
 *  The iteratee to transform keys.
 * @example
 * {"dir": "left", "code": 97} {"dir": "right", "code": 100} → keyBy (o)=>{String.fromCharCode(o.code)} → {"a": {"dir": "left", "code": 97}, "d": {"dir": "right", "code": 100}}
 * {"dir": "left", "code": 97} {"dir": "right", "code": 100} → keyBy "dir" → {"left": {"dir": "left", "code": 97}, "right": {"dir": "right", "code": 100}}
 */
function* keyBy(iteratee) {
  yield* this.push(_.keyBy((yield* this.collect()), iteratee));
}

/**
 * Creates a stream of values by running each element in the input stream thru
 * `iteratee`. The iteratee is invoked with two arguments:
 * (value, index).
 *
 * Many lodash methods are guarded to work as iteratees for methods like
 * `every`, `filter`, `map`, `mapValues`, `reject`, and `some`.
 *
 * The guarded methods are:
 * `ary`, `chunk`, `curry`, `curryRight`, `drop`, `dropRight`, `every`,
 * `fill`, `invert`, `parseInt`, `random`, `range`, `rangeRight`, `repeat`,
 * `sampleSize`, `slice`, `some`, `sortBy`, `split`, `take`, `takeRight`,
 * `template`, `trim`, `trimEnd`, `trimStart`, and `words`
 *
 * @static
 * @this rq.Context
 * @param {Function} [iteratee=_.identity] The function invoked per iteration.
 * @example
 * 4 8 → map (x)=>{x*x} → 16 64
 * // With index
 * 4 8 → map (x, i)=>{x + i} → 4 9
 * // The `property` iteratee shorthand.
 * {"u": "b"} {"u": "f"} → map "u" → "b" "f"
 */
function* map(iteratee) {
  iteratee = _.iteratee(iteratee);

  var i = 0;
  while (yield* this.pull()) {
    yield* this.push(iteratee(this.value, i));
    i++;
  }
}

/**
 * This method is like `sortBy` except that it allows specifying the sort
 * orders of the iteratees to sort by. If `orders` is unspecified, all values
 * are sorted in ascending order. Otherwise, specify an order of "desc" for
 * descending or "asc" for ascending sort order of corresponding values.
 *
 * @static
 * @this rq.Context
 * @param {Array[]|Function[]|Object[]|string[]} [iteratees=[_.identity]]
 *  The iteratees to sort by.
 * @param {string[]} [orders] The sort orders of `iteratees`.
 * @example
 * {"u": "f", "g": 48} {"u": "b", "g": 34} {"u": "f", "g": 40} {"u": "b", "g": 36} → orderBy ["u", "g"] ["asc", "desc"] → {"u": "b", "g": 36} {"u": "b", "g": 34} {"u": "f", "g": 48} {"u": "f", "g": 40}
 */
function* orderBy(iteratees, orders) {
  yield* this.spread(_.orderBy((yield* this.collect()), iteratees, orders));
}

/**
 * Creates a stream of elements split into two groups, the first of which
 * contains elements `predicate` returns truthy for, the second of which
 * contains elements `predicate` returns falsey for. The predicate is
 * invoked with one argument: (value).
 *
 * @static
 * @this rq.Context
 * @param {Function} [predicate=_.identity] The function invoked per iteration.
 * @example
 * {"u": "b", "g": 36, "a": false} {"u": "f", "g": 40, "a": true} {"u": "p", "g": 1, "a": false} → partition (o)=>{o.a} → [{"u": "f", "g": 40, "a": true}] [{"u": "b", "g": 36, "a": false}, {"u": "p", "g": 1, "a": false}]
 * // The `matches` iteratee shorthand.
 * {"u": "b", "g": 36, "a": false} {"u": "f", "g": 40, "a": true} {"u": "p", "g": 1, "a": false} → partition {"g": 1, "a": false} → [{"u": "p", "g": 1, "a": false}] [{"u": "b", "g": 36, "a": false}, {"u": "f", "g": 40, "a": true}]
 * // The `matchesProperty` iteratee shorthand.
 * {"u": "b", "g": 36, "a": false} {"u": "f", "g": 40, "a": true} {"u": "p", "g": 1, "a": false} → partition ["a", false] → [{"u": "b", "g": 36, "a": false}, {"u": "p", "g": 1, "a": false}] [{"u": "f", "g": 40, "a": true}]
 * // The `property` iteratee shorthand.
 * {"u": "b", "g": 36, "a": false} {"u": "f", "g": 40, "a": true} {"u": "p", "g": 1, "a": false} → partition "a" → [{"u": "f", "g": 40, "a": true}] [{"u": "b", "g": 36, "a": false}, {"u": "p", "g": 1, "a": false}]
 */
function* partition(predicate) {
  yield* this.spread(_.partition((yield* this.collect()), predicate));
}

/**
 * Reduces the input stream to a value which is the accumulated result of running
 * each element in the input stream thru `iteratee`, where each successive
 * invocation is supplied the return value of the previous. If `accumulator`
 * is not given, the first element of the input stream is used as the initial
 * value. The iteratee is invoked with four arguments:
 * (accumulator, value, index|key, collection).
 *
 * Many lodash methods are guarded to work as iteratees for methods like
 * `reduce`, `reduceRight`, and `transform`.
 *
 * The guarded methods are:
 * `assign`, `defaults`, `defaultsDeep`, `includes`, `merge`, `orderBy`,
 * and `sortBy`
 *
 * @static
 * @this rq.Context
 * @param {Function} [iteratee=_.identity] The function invoked per iteration.
 * @param {*} [accumulator] The initial value.
 * @see _.reduceRight
 * @example
 * 1 2 → reduce (sum, n)=>{sum + n} 0 → 3
 */
function* reduce(iteratee, accumulator) {
  yield* this.push(_.reduce((yield* this.collect()), iteratee, accumulator));
}

/**
 * This method is like `reduce` except that it iterates over elements of
 * the input stream from right to left.
 *
 * @static
 * @this rq.Context
 * @param {Function} [iteratee=_.identity] The function invoked per iteration.
 * @param {*} [accumulator] The initial value.
 * @see _.reduce
 * @example
 * [0, 1] [2, 3] [4, 5] → reduceRight (flattened, other)=>{flattened.concat(other)} [] → [4, 5, 2, 3, 0, 1]
 */
function* reduceRight(iteratee, accumulator) {
  yield* this.push(_.reduceRight((yield* this.collect()), iteratee, accumulator));
}

/**
 * The opposite of `filter`; this method returns the elements of the input stream
 * that `predicate` does **not** return truthy for.
 *
 * @static
 * @this rq.Context
 * @param {Function} [predicate=_.identity] The function invoked per iteration.
 * @see _.filter
 * @example
 * {"u": "b", "g": 36, "a": false} {"u": "f", "g": 40, "a": true} → reject (o)=>{!o.a} → {"u": "f", "g": 40, "a": true}
 * // The `matches` iteratee shorthand.
 * {"u": "b", "g": 36, "a": false} {"u": "f", "g": 40, "a": true} → reject {"g": 40, "a": true} → {"u": "b", "g": 36, "a": false}
 * // The `matchesProperty` iteratee shorthand.
 * {"u": "b", "g": 36, "a": false} {"u": "f", "g": 40, "a": true} → reject ["a", false] → {"u": "f", "g": 40, "a": true}
 * // The `property` iteratee shorthand.
 * {"u": "b", "g": 36, "a": false} {"u": "f", "g": 40, "a": true} → reject "a" → {"u": "b", "g": 36, "a": false}
 */
function* reject(predicate) {
  predicate = _.iteratee(predicate);

  var i = 0;
  while (yield* this.pull()) {
    if (!predicate(this.value, i)) {
      yield* this.push(this.value);
    }
    i++;
  }
}

/**
 * Gets a random element from the input stream.
 *
 * @static
 * @this rq.Context
 * @example
 * 1 2 3 4 → sample → 2 (not tested)
 */
function* sample() {
  yield* this.push(_.sample((yield* this.collect())));
}

/**
 * Gets `n` random elements at unique keys from the input stream up to the
 * size of the input stream.
 *
 * @static
 * @this rq.Context
 * @param {number} [n=1] The number of elements to sample.
 * @example
 * 1 2 3 → sampleSize 2 → 3 1 (not tested)
 * 1 2 3 → sampleSize 4 → 2 3 1 (not tested)
 */
function* sampleSize(n) {
  yield* this.push(_.sampleSize((yield* this.collect()), n));
}

/**
 * Creates a stream of shuffled values, using a version of the
 * [Fisher-Yates shuffle](https://en.wikipedia.org/wiki/Fisher-Yates_shuffle).
 *
 * @static
 * @this rq.Context
 * @example
 * 1 2 3 4 → shuffle → 4 1 3 2 (not tested)
 */
function* shuffle() {
  yield* this.spread(_.shuffle((yield* this.collect())));
}

/**
 * Gets the size of the input stream by returning its length.
 *
 * @static
 * @this rq.Context
 * @example
 * 1 2 3 → size → 3
 */
function* size() {
  yield* this.push(_.size((yield* this.collect())));
}

/**
 * Checks if `predicate` returns truthy for **any** element of the input stream.
 * Iteration is stopped once `predicate` returns truthy. The predicate is
 * invoked with two arguments: (value, index).
 *
 * @static
 * @this rq.Context
 * @param {Function} [predicate=_.identity] The function invoked per iteration.
 * @example
 * null 0 "yes" false → some (x)=>{Boolean(x)} → true
 * // With index
 * 5 1 8 → some (x, i) => { i == x } → true
 * // The `matches` iteratee shorthand.
 * {"u": "b", "a": true} {"u": "f", "a": false} → some {"u": "b", "a": false} → false
 * // The `matchesProperty` iteratee shorthand.
 * {"u": "b", "a": true} {"u": "f", "a": false} → some ["a", false] → true
 * // The `property` iteratee shorthand.
 * {"u": "b", "a": true} {"u": "f", "a": false} → some "a" → true
 */
function* some(predicate) {
  predicate = _.iteratee(predicate);

  var i = 0;
  while (yield* this.pull()) {
    if (predicate(this.value, i)) {
      yield* this.push(true);
      return;
    }
    i++;
  }

  yield* this.push(false);
}

/**
 * Creates a stream of elements, sorted in ascending order by the results of
 * running each element in a collection thru each iteratee. This method
 * performs a stable sort, that is, it preserves the original sort order of
 * equal elements. The iteratees are invoked with one argument: (value).
 *
 * @static
 * @this rq.Context
 * @param {...(Function|Function[])} [iteratees=[_.identity]]
 *  The iteratees to sort by.
 * @example
 * {"u": "f", "g": 48} {"u": "b", "g": 36} {"u": "f", "g": 40} {"u": "b", "g": 34} → sortBy (o)=>{o.u} → {"u": "b", "g": 36} {"u": "b", "g": 34} {"u": "f", "g": 48} {"u": "f", "g": 40}
 * {"u": "f", "g": 48} {"u": "b", "g": 36} {"u": "f", "g": 40} {"u": "b", "g": 34} → sortBy ["u", "g"] → {"u": "b", "g": 34} {"u": "b", "g": 36} {"u": "f", "g": 40} {"u": "f", "g": 48}
 * {"u": "f", "g": 48} {"u": "b", "g": 36} {"u": "f", "g": 40} {"u": "b", "g": 34} → sortBy "u" (o)=>{o.a/10} → {"u": "b", "g": 36} {"u": "b", "g": 34} {"u": "f", "g": 48} {"u": "f", "g": 40}
 */
function* sortBy(iteratees) {
  yield* this.spread(_.orderBy((yield* this.collect()), iteratees));
}

////////////////////////////////////////////////////////////////////////////////////////////////////
/// lodash wrappers - Date                                                                       ///
///                                                                                              ///
/// NOTE: These are not streaming!                                                               ///
////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Gets the timestamp of the number of milliseconds that have elapsed since
 * the Unix epoch (1 January 1970 00:00:00 UTC).
 *
 * @static
 * @this rq.Context
 * @example
 * (empty) → now → 1470104632000 (not tested)
 */
function* now() {
  while (true) {
    yield* this.push(_.now());
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////
/// lodash wrappers - Lang                                                                       ///
///                                                                                              ///
/// NOTE: These are not streaming!                                                               ///
////////////////////////////////////////////////////////////////////////////////////////////////////

// castArray, clone, cloneDeep, cloneDeepWith, cloneWith don't make sense

/**
 * Checks if input objects conform to `source` by invoking the predicate
 * properties of `source` with the corresponding property values of each
 * input object.
 *
 * **Note:** This method is equivalent to `conforms` when `source` is
 * partially applied.
 *
 * @static
 * @this rq.Context
 * @param {Object} source The object of property predicates to conform to.
 * @example
 * {"a": 1, "b": 2 } → conformsTo {"b": (n)=>{ n > 1 } } → true (not tested)
 * {"a": 1, "b": 2 } → conformsTo {"b": (n)=>{ n > 2 } } → false (not tested)
 */
function* conformsTo(source) {
  while (yield* this.pull()) {
    yield* this.push(_.conformsTo(this.value, source));
  }
}

/**
 * Performs a
 * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
 * comparison between two values to determine if they are equivalent.
 *
 * @static
 * @this rq.Context
 * @param {*} other The other value to compare.
 * @example
 * 2 3     → eq 2   → true false
 * "a" "b" → eq "a" → true false
 * {}      → eq {}  → false
 */
function* eq(other) {
  while (yield* this.pull()) {
    yield* this.push(_.eq(this.value, other));
  }
}

/**
 * Checks if each input value is greater than `other`.
 *
 * @static
 * @this rq.Context
 * @param {*} other The other value to compare.
 * @example
 * 1 2 3 → gt 2 → false false true
 */
function* gt(other) {
  while (yield* this.pull()) {
    yield* this.push(_.gt(this.value, other));
  }
}

/**
 * Checks if each input value is greater than or equal to `other`.
 *
 * @static
 * @this rq.Context
 * @param {*} other The other value to compare.
 * @example
 * 1 2 3 → gte 2 → false true true
 */
function* gte(other) {
  while (yield* this.pull()) {
    yield* this.push(_.gte(this.value, other));
  }
}

// isArguments doesn't make sense

/**
 * Checks if each input value is classified as an `Array` object.
 *
 * @static
 * @this rq.Context
 * @example
 * [1, 2, 3] "abc" true {"length": 2} → isArray → true false false false
 */
function* isArray() {
  while (yield* this.pull()) {
    yield* this.push(_.isArray(this.value));
  }
}

/**
 * Checks if each input value is classified as an `ArrayBuffer` object.
 *
 * @static
 * @this rq.Context
 */
function* isArrayBuffer() {
  while (yield* this.pull()) {
    yield* this.push(_.isArrayBuffer(this.value));
  }
}

/**
 * Checks if each input value is array-like. A value is considered array-like if it's
 * not a function and has a `value.length` that's an integer greater than or
 * equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
 *
 * @static
 * @this rq.Context
 * @example
 * [1, 2, 3] "abc" true {"length": 2} → isArrayLike → true true false true
 */
function* isArrayLike() {
  while (yield* this.pull()) {
    yield* this.push(_.isArrayLike(this.value));
  }
}

/**
 * This method is like `isArrayLike` except that it also checks if `value`
 * is an object.
 *
 * @static
 * @this rq.Context
 * @example
 * [1, 2, 3] "abc" true {"length": 2} → isArrayLikeObject → true false false true
 */
function* isArrayLikeObject() {
  while (yield* this.pull()) {
    yield* this.push(_.isArrayLikeObject(this.value));
  }
}

/**
 * Checks if each input value is classified as a boolean primitive or object.
 *
 * @static
 * @this rq.Context
 * @example
 * false null → isBoolean → true false
 */
function* isBoolean() {
  while (yield* this.pull()) {
    yield* this.push(_.isBoolean(this.value));
  }
}

/**
 * Checks if each input value is a buffer.
 *
 * @static
 * @this rq.Context
 */
function* isBuffer() {
  while (yield* this.pull()) {
    yield* this.push(_.isBuffer(this.value));
  }
}

/**
 * Checks if each input value is classified as a `Date` object.
 *
 * @static
 * @this rq.Context
 */
function* isDate() {
  while (yield* this.pull()) {
    yield* this.push(_.isDate(this.value));
  }
}

// isElement doesn't make sense

/**
 * Checks if `value` is an empty object, collection, map, or set.
 *
 * Objects are considered empty if they have no own enumerable string keyed
 * properties.
 *
 * Array-like values such as `arguments` objects, arrays, buffers, strings, or
 * jQuery-like collections are considered empty if they have a `length` of `0`.
 * Similarly, maps and sets are considered empty if they have a `size` of `0`.
 *
 * @static
 * @this rq.Context
 * @example
 * null true 1 [1, 2, 3] {"a": 1} → isEmpty → true true true false false
 */
function* isEmpty() {
  while (yield* this.pull()) {
    yield* this.push(_.isEmpty(this.value));
  }
}

/**
 * Performs a deep comparison between two values to determine if they are
 * equivalent.
 *
 * **Note:** This method supports comparing arrays, array buffers, booleans,
 * date objects, error objects, maps, numbers, `Object` objects, regexes,
 * sets, strings, symbols, and typed arrays. `Object` objects are compared
 * by their own, not inherited, enumerable properties. Functions and DOM
 * nodes are **not** supported.
 *
 * @static
 * @this rq.Context
 * @param {*} other The other value to compare.
 * @example
 * {"a": 1} 2 {"a": 2} → isEqual {"a": 1} → true false false
 */
function* isEqual(other) {
  while (yield* this.pull()) {
    yield* this.push(_.isEqual(this.value, other));
  }
}

/**
 * This method is like `isEqual` except that it accepts `customizer` which
 * is invoked to compare values. If `customizer` returns `undefined`, comparisons
 * are handled by the method instead. The `customizer` is invoked with up to
 * six arguments: (objValue, othValue [, index|key, object, other, stack]).
 *
 * @static
 * @this rq.Context
 * @param {*} other The other value to compare.
 * @param {Function} [customizer] The function to customize comparisons.
 * @example
 * 1.2 2.1 3.2 → isEqualWith 1.2 (x, y)=>{Math.floor(x) == Math.ceil(y)} → true false false
 */
function* isEqualWith(other, customizer) {
  while (yield* this.pull()) {
    yield* this.push(_.isEqual(this.value, other, customizer));
  }
}

// isError doesn't make sense

function* isFinite(other) {
  while (yield* this.pull()) {
    yield* this.push(_.isFinite(this.value));
  }
}

function* isFunction() {
  while (yield* this.pull()) {
    yield* this.push(_.isFunction(this.value));
  }
}

function* isInteger() {
  while (yield* this.pull()) {
    yield* this.push(_.isInteger(this.value));
  }
}

function* isLength() {
  while (yield* this.pull()) {
    yield* this.push(_.isLength(this.value));
  }
}

function* isMap() {
  while (yield* this.pull()) {
    yield* this.push(_.isMap(this.value));
  }
}

function* isMatch(source) {
  while (yield* this.pull()) {
    yield* this.push(_.isMatch(this.value, source));
  }
}

function* isMatchWith(source, customizer) {
  while (yield* this.pull()) {
    yield* this.push(_.isMatch(this.value, source, customizer));
  }
}

function* isNaN() {
  while (yield* this.pull()) {
    yield* this.push(_.isNaN(this.value));
  }
}

// isNative doesn't make sense

function* isNil() {
  while (yield* this.pull()) {
    yield* this.push(_.isNil(this.value));
  }
}

function* isNull() {
  while (yield* this.pull()) {
    yield* this.push(_.isNull(this.value));
  }
}

function* isNumber() {
  while (yield* this.pull()) {
    yield* this.push(_.isNumber(this.value));
  }
}

function* isObject() {
  while (yield* this.pull()) {
    yield* this.push(_.isObject(this.value));
  }
}

function* isObjectLike() {
  while (yield* this.pull()) {
    yield* this.push(_.isObjectLike(this.value));
  }
}

function* isPlainObject() {
  while (yield* this.pull()) {
    yield* this.push(_.isPlainObject(this.value));
  }
}

function* isRegExp() {
  while (yield* this.pull()) {
    yield* this.push(_.isRegExp(this.value));
  }
}

function* isSafeInteger() {
  while (yield* this.pull()) {
    yield* this.push(_.isSafeInteger(this.value));
  }
}

function* isSet() {
  while (yield* this.pull()) {
    yield* this.push(_.isSet(this.value));
  }
}

function* isString() {
  while (yield* this.pull()) {
    yield* this.push(_.isString(this.value));
  }
}

function* isSymbol() {
  while (yield* this.pull()) {
    yield* this.push(_.isSymbol(this.value));
  }
}

function* isTypedArray() {
  while (yield* this.pull()) {
    yield* this.push(_.isTypedArray(this.value));
  }
}

function* isUndefined() {
  while (yield* this.pull()) {
    yield* this.push(_.isUndefined(this.value));
  }
}

function* isWeakMap() {
  while (yield* this.pull()) {
    yield* this.push(_.isWeakMap(this.value));
  }
}

function* isWeakSet() {
  while (yield* this.pull()) {
    yield* this.push(_.isWeakSet(this.value));
  }
}

function* lt(other) {
  while (yield* this.pull()) {
    yield* this.push(_.lte(this.value, other));
  }
}

function* lte(other) {
  while (yield* this.pull()) {
    yield* this.push(_.lte(this.value, other));
  }
}

function* toArray() {
  while (yield* this.pull()) {
    yield* this.push(_.toArray(this.value));
  }
}

function* toFinite() {
  while (yield* this.pull()) {
    yield* this.push(_.toFinite(this.value));
  }
}

function* toInteger() {
  while (yield* this.pull()) {
    yield* this.push(_.toInteger(this.value));
  }
}

function* toLength() {
  while (yield* this.pull()) {
    yield* this.push(_.toLength(this.value));
  }
}

function* toNumber() {
  while (yield* this.pull()) {
    yield* this.push(_.toNumber(this.value));
  }
}

function* toPlainObject() {
  while (yield* this.pull()) {
    yield* this.push(_.toPlainObject(this.value));
  }
}

function* toSafeInteger() {
  while (yield* this.pull()) {
    yield* this.push(_.toSafeInteger(this.value));
  }
}

function* toString() {
  while (yield* this.pull()) {
    yield* this.push(_.toString(this.value));
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////
/// lodash wrappers - Math                                                                       ///
///                                                                                              ///
/// NOTE: These are not streaming!                                                               ///
////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Adds something to each element of the input stream.
 *
 * @static
 * @this rq.Context
 * @param {*} other The addend.
 * @example
 * 1 2 3 → add 4 → 5 6 7
 * "a" "b" "c" → add "d" → "ad" "bd" "cd"
 */
function* add(other) {
  while (yield* this.pull()) {
    yield* this.push(_.add(this.value, other));
  }
}

/**
 * Computes the ceiling of each element of the input stream rounded up
 * to `precision`.
 *
 * @static
 * @this rq.Context
 * @param {number} [precision=0] The precision to round up to.
 * @example
 * 4.006 → ceil    → 5
 * 6.004 → ceil  2 → 6.01
 * 6040  → ceil -2 → 6100
 */
function* ceil(precision) {
  while (yield* this.pull()) {
    yield* this.push(_.ceil(this.value, precision));
  }
}

/**
 * Divides each element of the input stream by something.
 *
 * @static
 * @this rq.Context
 * @param {*} other The divisor.
 * @example
 * 1 2 3 → divide 2 → 0.5 1 1.5
 */
function* divide(other) {
  while (yield* this.pull()) {
    yield* this.push(_.divide(this.value, other));
  }
}

/**
 * Computes the floor of each element of the input stream rounded down
 * to `precision`.
 *
 * @static
 * @this rq.Context
 * @param {number} [precision=0] The precision to round down to.
 * @example
 * 4.006 → floor    → 4
 * 0.046 → floor  2 → 0.04
 * 4060  → floor -2 → 4000
 */
function* floor(precision) {
  while (yield* this.pull()) {
    yield* this.push(_.floor(this.value, precision));
  }
}

/**
 * Computes the maximum value of the input stream. If the input stream is empty or falsey,
 * `undefined` is returned.
 *
 * @static
 * @this rq.Context
 * @example
 * 4 2 8 6 → max → 8
 * (empty) → max → null
 */
function* max() {
  yield* this.push(_.max((yield* this.collect())));
}

/**
 * This method is like `max` except that it accepts `iteratee` which is
 * invoked for each element in the input stream to generate the criterion by which
 * the value is ranked. The iteratee is invoked with one argument: (value).
 *
 * @static
 * @this rq.Context
 * @param {Function} [iteratee=_.identity] The iteratee invoked per element.
 * @example
 * {"n": 1} {"n": 2} → maxBy (o)=>{o.n} → {"n": 2}
 * // The `property` iteratee shorthand.
 * {"n": 1} {"n": 2} → maxBy "n" → {"n": 2}
 */
function* maxBy(iteratee) {
  yield* this.push(_.maxBy((yield* this.collect()), iteratee));
}

/**
 * Computes the mean of the values in the input stream.
 *
 * @static
 * @this rq.Context
 * @example
 * 4 2 8 6 → mean → 5
 * (empty) → mean → null
 */
function* mean() {
  yield* this.push(_.mean((yield* this.collect())));
}

/**
 * This method is like `mean` except that it accepts `iteratee` which is
 * invoked for each element in the input stream to generate the value to be averaged.
 * The iteratee is invoked with one argument: (value).
 *
 * @static
 * @this rq.Context
 * @param {Function} [iteratee=_.identity] The iteratee invoked per element.
 * @example
 * {"n": 4} {"n": 2} {"n": 8} {"n": 6} → meanBy (o)=>{o.n} → 5
 * // The `property` iteratee shorthand.
 * {"n": 4} {"n": 2} {"n": 8} {"n": 6} → meanBy "n" → 5
 */
function* meanBy(iteratee) {
  yield* this.push(_.meanBy((yield* this.collect()), iteratee));
}

/**
 * Computes the minimum value of the input stream. If the input stream is empty or falsey,
 * `undefined` is returned.
 *
 * @static
 * @this rq.Context
 * @example
 * 4 2 8 6 → min → 2
 * (empty) → min → null
 */
function* min() {
  yield* this.push(_.min((yield* this.collect())));
}

/**
 * This method is like `min` except that it accepts `iteratee` which is
 * invoked for each element in the input stream to generate the criterion by which
 * the value is ranked. The iteratee is invoked with one argument: (value).
 *
 * @static
 * @this rq.Context
 * @param {Function} [iteratee=_.identity] The iteratee invoked per element.
 * @example
 * {"n": 1} {"n": 2} → minBy (o)=>{o.n} → {"n": 1}
 * // The `property` iteratee shorthand.
 * {"n": 1} {"n": 2} → minBy "n" → {"n": 1}
 */
function* minBy(iteratee) {
  yield* this.push(_.minBy((yield* this.collect()), iteratee));
}

/**
 * Multiplies each element of the input stream by something.
 *
 * @static
 * @this rq.Context
 * @param {*} other The factor.
 * @example
 * 1 2 3 → multiply 2 → 2 4 6
 */
function* multiply(other) {
  while (yield* this.pull()) {
    yield* this.push(_.multiply(this.value, other));
  }
}

/**
 * Rounds each element of the input stream to `precision`.
 *
 * @static
 * @this rq.Context
 * @param {number} [precision=0] The precision to round to.
 * @example
 * 4.006 → round    → 4
 * 4.006 → round  2 → 4.01
 * 4060  → round -2 → 4100
 */
function* round(other) {
  while (yield* this.pull()) {
    yield* this.push(_.round(this.value, other));
  }
}

/**
 * Subtracts something from each element of the input stream.
 *
 * @static
 * @this rq.Context
 * @param {*} other The subtrahend.
 * @example
 * 1 2 3 → subtract 1 → 0 1 2
 */
function* subtract(other) {
  while (yield* this.pull()) {
    yield* this.push(_.subtract(this.value, other));
  }
}

/**
 * Computes the sum of the values in the input stream.
 *
 * @static
 * @this rq.Context
 * @example
 * 4 2 8 6 → sum → 20
 * (empty) → sum → 0
 */
function* sum() {
  yield* this.push(_.sum((yield* this.collect())));
}

/**
 * This method is like `sum` except that it accepts `iteratee` which is
 * invoked for each element in the input stream to generate the value to be summed.
 * The iteratee is invoked with one argument: (value).
 *
 * @static
 * @this rq.Context
 * @param {Function} [iteratee=_.identity] The iteratee invoked per element.
 * @example
 * {"n": 4} {"n": 2} {"n": 8} {"n": 6} → sumBy (o)=>{o.n} → 20
 * // The `property` iteratee shorthand.
 * {"n": 4} {"n": 2} {"n": 8} {"n": 6} → sumBy "n" → 20
 */
function* sumBy(iteratee) {
  yield* this.push(_.sumBy((yield* this.collect()), iteratee));
}

////////////////////////////////////////////////////////////////////////////////////////////////////
/// lodash wrappers - Number                                                                     ///
///                                                                                              ///
/// NOTE: These are not streaming!                                                               ///
////////////////////////////////////////////////////////////////////////////////////////////////////

function* clamp(start, end) {
  while (yield* this.pull()) {
    yield* this.push(_.clamp(this.value, start, end));
  }
}

function* inRange(start, end) {
  while (yield* this.pull()) {
    yield* this.push(_.inRange(this.value, start, end));
  }
}

/**
 * Produces a random number between the inclusive `lower` and `upper` bounds.
 * If only one argument is provided a number between `0` and the given number
 * is returned. If `floating` is `true`, or either `lower` or `upper` are
 * floats, a floating-point number is returned instead of an integer.
 *
 * **Note:** JavaScript follows the IEEE-754 standard for resolving
 * floating-point values which can produce unexpected results.
 *
 * @static
 * @this rq.Context
 * @param {number} [lower=0] The lower bound.
 * @param {number} [upper=1] The upper bound.
 * @param {boolean} [floating] Specify returning a floating-point number.
 * @example
 * (empty) → random 0 5 → 2 (not tested)
 * (empty) → random 5 → 3 (not tested)
 * (empty) → random 5 true → 3.2 (not tested)
 * (empty) → random 1.2 1.5 → 1.3 (not tested)
 */
function* random(lower, upper, floating) {
  while (true) {
    yield* this.push(_.random(lower, upper, floating));
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////
/// lodash wrappers - Number                                                                     ///
///                                                                                              ///
/// NOTE: These are not streaming!                                                               ///
////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Assigns own enumerable string keyed properties of source objects to the
 * destination object. Source objects are applied from left to right.
 * Subsequent sources overwrite property assignments of previous sources.
 *
 * **Note:** This method mutates `object` and is loosely based on
 * [`Object.assign`](https://mdn.io/Object/assign).
 *
 * @static
 * @this rq.Context
 * @param {...Object} [sources] The source objects..
 * @example
 * {"a": 0, "b": 2} → assign {"a": 1, "c": 3} → {"a": 1, "b": 2, "c": 3}
 */
function* assign(...sources) {
  while (yield* this.pull()) {
    yield* this.push(_.assign(this.value, ...sources));
  }
}

// assignIn, assignInWith, assignWith don't make sense

/**
 * Creates an array of values corresponding to `paths` of `object`.
 *
 * @static
 * @this rq.Context
 * @param {Object} object The object to iterate over.
 * @param {...(string|string[])} [paths] The property paths of elements to pick.
 * @example
 * { "a": [{ "b": { "c": 3 } }, 4] } → at "a[0].b.c" → 3
 * { "a": [{ "b": { "c": 3 } }, 4] } → at "a[0].b.c" "a[1]" → [3, 4]
 */
function* at(...paths) {
  while (yield* this.pull()) {
    if (paths.length === 1) {
      yield* this.spread(_.at(this.value, ...paths));
    } else {
      yield* this.push(_.at(this.value, ...paths));
    }
  }
}

/**
 * Assigns own and inherited enumerable string keyed properties of
 * source objects to the destination object for all destination
 * properties that resolve to `undefined`. Source objects are applied
 * from left to right.  Once a property is set, additional values of
 * the same property are ignored.
 *
 * **Note:** This method mutates `object`.
 *
 * @static
 * @this rq.Context
 * @param {...Object} [sources] The source objects..
 * @example
 * {"a": 0, "b": 2} → defaults {"a": 1, "c": 3} → {"a": 0, "b": 2, "c": 3}
 */
function* defaults(...sources) {
  while (yield* this.pull()) {
    yield* this.push(_.defaults(this.value, ...sources));
  }
}

/**
 * This method is like `defaults` except that it recursively assigns
 * default properties.
 *
 * **Note:** This method mutates `object`.
 *
 * @static
 * @this rq.Context
 * @param {...Object} [sources] The source objects..
 * @example
 * { "a": { "b": 2 } } → defaultsDeep { "a": { "b": 1, "c": 3 } } → { "a": { "b": 2, "c": 3 } }
 */
function* defaultsDeep(...sources) {
  while (yield* this.pull()) {
    yield* this.push(_.defaultsDeep(this.value, ...sources));
  }
}

/**
 * This method is like `find` except that it returns the key of the
 * first element `predicate` returns truthy for instead of the element
 * itself.
 *
 * @static
 * @this rq.Context
 * @param {Function} [predicate=_.identity] The function invoked per
 * iteration.
 * @example
 * {"a": {"u": "b", "g": 36, "a": true}, "b": {"u": "f", "g": 40, "a": false}, "c": {"u": "p", "g": 1, "a": true}} → findKey (o)=>{o.g < 40} → "a"
 * // The `matches` iteratee shorthand.
 * {"a": {"u": "b", "g": 36, "a": true}, "b": {"u": "f", "g": 40, "a": false}, "c": {"u": "p", "g": 1, "a": true}} → findKey {"g": 1, "a": true} → "c"
 * // The `matchesProperty` iteratee shorthand.
 * {"a": {"u": "b", "g": 36, "a": true}, "b": {"u": "f", "g": 40, "a": false}, "c": {"u": "p", "g": 1, "a": true}} → findKey ["a", false] → "b"
 * // The `property` iteratee shorthand.
 * {"a": {"u": "b", "g": 36, "a": true}, "b": {"u": "f", "g": 40, "a": false}, "c": {"u": "p", "g": 1, "a": true}} → findKey "a" → "a"
 */
function* findKey(predicate) {
  while (yield* this.pull()) {
    yield* this.push(_.findKey(this.value, predicate));
  }
}

/**
 * This method is like `findKey` except that it iterates over elements
 * of a collection in the opposite order.
 *
 * @static
 * @this rq.Context
 * @param {Function} [predicate=_.identity] The function invoked per
 * iteration.
 * @example
 * {"a": {"u": "b", "g": 36, "a": true}, "b": {"u": "f", "g": 40, "a": false}, "c": {"u": "p", "g": 1, "a": true}} → findLastKey (o)=>{o.g < 40} → "c"
 * // The `matches` iteratee shorthand.
 * {"a": {"u": "b", "g": 36, "a": true}, "b": {"u": "f", "g": 40, "a": false}, "c": {"u": "p", "g": 1, "a": true}} → findLastKey {"g": 1, "a": true} → "c"
 * // The `matchesProperty` iteratee shorthand.
 * {"a": {"u": "b", "g": 36, "a": true}, "b": {"u": "f", "g": 40, "a": false}, "c": {"u": "p", "g": 1, "a": true}} → findLastKey ["a", false] → "b"
 * // The `property` iteratee shorthand.
 * {"a": {"u": "b", "g": 36, "a": true}, "b": {"u": "f", "g": 40, "a": false}, "c": {"u": "p", "g": 1, "a": true}} → findLastKey "a" → "c"
 */
function* findLastKey(predicate) {
  while (yield* this.pull()) {
    yield* this.push(_.findLastKey(this.value, predicate));
  }
}

// forIn, forInRight, forOwn don't make sense

/**
 * Gets the value at `path` of `object`. If the resolved value is
 * `undefined`, the `defaultValue` is returned in its place.
 *
 * @static
 * @this rq.Context
 * @param {Array|string} path The path of the property to get.
 * @param {*} [defaultValue] The value returned for `undefined` resolved values.
 * @example
 * { "a": [{ "b": { "c": 3 } }] } → get "a[0].b.c" → 3
 * { "a": [{ "b": { "c": 3 } }] } → get ["a", "0", "b", "c"] → 3
 * { "a": [{ "b": { "c": 3 } }] } → get "a.b.c" "default" → "default"
 */
function* get(path, defaultValue) {
  while (yield* this.pull()) {
    yield* this.push(_.get(this.value, path, defaultValue));
  }
}

/**
 * Checks if `path` is a direct property of `object`.
 *
 * @static
 * @this rq.Context
 * @param {Array|string} path The path to check.
 * @example
 * { "a": { "b": 2 } } → has "a" → true
 * { "a": { "b": 2 } } → has "a.b" → true
 * { "x": 3 }          → has "a" → false
 */
function* has(path) {
  while (yield* this.pull()) {
    yield* this.push(_.has(this.value, path));
  }
}

// hasIn doesn't make sense

/**
 * Creates an object composed of the inverted keys and values of `object`.
 * If `object` contains duplicate values, subsequent values overwrite
 * property assignments of previous values.
 *
 * @static
 * @this rq.Context
 * @example
 * { "a": 1, "b": 2, "c": 1 } → invert → { "1": "c", "2": "b" }
 */
function* invert() {
  while (yield* this.pull()) {
    yield* this.push(_.invert(this.value));
  }
}

/**
 * This method is like `invert` except that the inverted object is generated
 * from the results of running each element of `object` thru `iteratee`. The
 * corresponding inverted value of each inverted key is an array of keys
 * responsible for generating the inverted value. The iteratee is invoked
 * with one argument: (value).
 *
 * @static
 * @this rq.Context
 * @param {Function} [iteratee=_.identity] The iteratee invoked per element.
 * @example
 * { "a": 1, "b": 2, "c": 1 } → invertBy (v => "group" + v) → { "group1": ["a", "c"], "group2": ["b"] }
 */
function* invertBy(iteratee) {
  while (yield* this.pull()) {
    yield* this.push(_.invertBy(this.value, iteratee));
  }
}

/**
 * Invokes the method at `path` of `object`.
 *
 * @static
 * @this rq.Context
 * @param {Array|string} path The path of the method to invoke.
 * @param {...*} [args] The arguments to invoke the method with.
 * @example
 * { "a": [{ "b": { "c": [1, 2, 3, 4] } }] } → invoke "a[0].b.c.slice" 1 3 → [2, 3]
 */
function* invoke(path, ...args) {
  while (yield* this.pull()) {
    yield* this.push(_.invoke(this.value, path, ...args));
  }
}

/**
 * Creates an array of the own enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects. See the
 * [ES spec](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
 * for more details.
 *
 * @static
 * @this rq.Context
 * @example
 * {"a": 2, "b": 3} → keys → ["a", "b"]
 */
function* keys() {
  while (yield* this.pull()) {
    yield* this.push(_.keys(this.value));
  }
}

/**
 * The opposite of `mapValues`; this method creates an object with the
 * same values as `object` and keys generated by running each own enumerable
 * string keyed property of `object` thru `iteratee`. The iteratee is invoked
 * with three arguments: (value, key, object).
 *
 * @static
 * @this rq.Context
 * @param {Function} [iteratee=_.identity] The function invoked per iteration.
 * @example
 * {"a": 1, "b": 2} → mapKeys (v, k) => {k + v} → {"a1": 1, "b2": 2}
 */
function* mapKeys(iteratee) {
  while (yield* this.pull()) {
    yield* this.push(_.mapKeys(this.value, iteratee));
  }
}

/**
 * Creates an object with the same keys as `object` and values generated
 * by running each own enumerable string keyed property of `object` thru
 * `iteratee`. The iteratee is invoked with three arguments:
 * (value, key, object).
 *
 * @static
 * @this rq.Context
 * @param {Function} [iteratee=_.identity] The function invoked per iteration.
 * @example
 * {"a": 1, "b": 2} → mapValues (v, k) => {k + v} → {"a": "a1", "b": "b2"}
 */
function* mapValues(iteratee) {
  while (yield* this.pull()) {
    yield* this.push(_.mapValues(this.value, iteratee));
  }
}

function* merge(...sources) {
  while (yield* this.pull()) {
    yield* this.push(_.merge(this.value, ...sources));
  }
}

function* omit(...props) {
  while (yield* this.pull()) {
    yield* this.push(_.omit(this.value, props));
  }
}

function* pick(...props) {
  while (yield* this.pull()) {
    yield* this.push(_.pick(this.value, props));
  }
}

function* pickBy(predicate) {
  while (yield* this.pull()) {
    yield* this.push(_.pickBy(this.value, predicate));
  }
}

function* result(path, defaultValue) {
  while (yield* this.pull()) {
    yield* this.push(_.result(this.value, path, defaultValue));
  }
}

function* set(path, value) {
  while (yield* this.pull()) {
    yield* this.push(_.set(this.value, path, value));
  }
}

function* toPairs() {
  while (yield* this.pull()) {
    yield* this.push(_.toPairs(this.value));
  }
}

function* transform(iteratee, accumulator) {
  while (yield* this.pull()) {
    yield* this.push(_.transform(this.value, iteratee, accumulator));
  }
}

function* unset(path) {
  while (yield* this.pull()) {
    yield* this.push(_.unset(this.value, path));
  }
}

function* update(path, updater) {
  while (yield* this.pull()) {
    yield* this.push(_.update(this.value, path, updater));
  }
}

function* updateWith(path, updater, customizer) {
  while (yield* this.pull()) {
    yield* this.push(_.updateWith(this.value, path, updater, customizer));
  }
}

function* values() {
  while (yield* this.pull()) {
    yield* this.push(_.values(this.value));
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////
/// lodash wrappers - String                                                                     ///
///                                                                                              ///
/// NOTE: These are not streaming!                                                               ///
////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Converts each input `string` to [camel
 * case](https://en.wikipedia.org/wiki/CamelCase).
 *
 * @static
 * @this rq.Context
 * @example
 * "Foo Bar"     → camelCase → "fooBar"
 * "--foo-bar--" → camelCase → "fooBar"
 * "__FOO_BAR__" → camelCase → "fooBar"
 */
function* camelCase() {
  while (yield* this.pull()) {
    yield* this.push(_.camelCase(this.value));
  }
}

/**
 * Converts each input `string`s first letter to upper case and the
 * remaining to lower case.
 *
 * @static
 * @this rq.Context
 * @example
 * "FRED" → capitalize → "Fred"
 */
function* capitalize() {
  while (yield* this.pull()) {
    yield* this.push(_.capitalize(this.value));
  }
}

/**
 * Deburrs each input `string` by converting [Latin-1
 * Supplement](https://en.wikipedia.org/wiki/Latin-1_Supplement_(Unicode_block)#Character_table)
 * and [Latin
 * Extended-A](https://en.wikipedia.org/wiki/Latin_Extended-A) letters
 * to basic Latin letters and removing [combining diacritical
 * marks](https://en.wikipedia.org/wiki/Combining_Diacritical_Marks).
 *
 * @static
 * @this rq.Context
 * @example
 * "déjà vu" → deburr → "deja vu"
 */
function* deburr() {
  while (yield* this.pull()) {
    yield* this.push(_.deburr(this.value));
  }
}

/**
 * Checks if each input `string` ends with the given target string.
 *
 * @static
 * @this rq.Context
 * @param {string} [target] The string to search for.
 * @param {number} [position=string.length] The position to search up
 * to.
 * @example
 * "abc" → endsWith "c"   → true
 * "abc" → endsWith "b"   → false
 * "abc" → endsWith "b" 2 → true
 */
function* endsWith(target, position) {
  while (yield* this.pull()) {
    yield* this.push(_.endsWith(this.value, target, position));
  }
}

/**
 * Converts the characters "&", "<", ">", '"', and "'" in each input
 * `string` to their corresponding HTML entities.
 *
 * **Note:** No other characters are escaped. To escape additional
 * characters use a third-party library like
 * [_he_](https://mths.be/he).
 *
 * Though the ">" character is escaped for symmetry, characters like
 * ">" and "/" don't need escaping in HTML and have no special meaning
 * unless they're part of a tag or unquoted attribute value. See
 * [Mathias Bynens's
 * article](https://mathiasbynens.be/notes/ambiguous-ampersands)
 * (under "semi-related fun fact") for more details.
 *
 * When working with HTML you should always [quote attribute
 * values](http://wonko.com/post/html-escaping) to reduce XSS vectors.
 *
 * @static
 * @this rq.Context
 * @example
 * "fred, barney, &amp; pebbles" → escape → "fred, barney, &amp;amp; pebbles"
 */
function* escape() {
  while (yield* this.pull()) {
    yield* this.push(_.escape(this.value));
  }
}

/**
 * Escapes the `RegExp` special characters "^", "$", "\", ".", "*",
 * "+", "?", "(", ")", "[", "]", "{", "}", and "|" in each input
 * `string`.
 *
 * @static
 * @this rq.Context
 * @example
 * "[lodash](https://lodash.com/)" → escapeRegExp → "\\[lodash\\]\\(https://lodash\\.com/\\)"
 */
function* escapeRegExp() {
  while (yield* this.pull()) {
    yield* this.push(_.escapeRegExp(this.value));
  }
}

/**
 * Converts each input `string` to
 * [kebab case](https://en.wikipedia.org/wiki/Letter_case#Special_case_styles).
 *
 * @static
 * @this rq.Context
 * @example
 * "Foo Bar"     → kebabCase → "foo-bar"
 * "fooBar"      → kebabCase → "foo-bar"
 * "__FOO_BAR__" → kebabCase → "foo-bar"
 */
function* kebabCase() {
  while (yield* this.pull()) {
    yield* this.push(_.kebabCase(this.value));
  }
}

/**
 * Converts each input `string`, as space separated words, to lower
 * case.
 *
 * @static
 * @this rq.Context
 * @example
 * "--Foo-Bar--" → lowerCase → "foo bar"
 * "fooBar"      → lowerCase → "foo bar"
 * "__FOO_BAR__" → lowerCase → "foo bar"
 */
function* lowerCase() {
  while (yield* this.pull()) {
    yield* this.push(_.lowerCase(this.value));
  }
}

/**
 * Converts each input `string`'s first character to lower case.
 *
 * @static
 * @this rq.Context
 * @example
 * "Fred" → lowerFirst → "fred"
 * "FRED" → lowerFirst → "fRED"
 */
function* lowerFirst() {
  while (yield* this.pull()) {
    yield* this.push(_.lowerFirst(this.value));
  }
}

/**
 * Pads each input `string` on the left and right sides if it's
 * shorter than `length`.  Padding characters are truncated if they
 * can't be evenly divided by `length`.
 *
 * @static
 * @this rq.Context
 * @param {number} [length=0] The padding length.
 * @param {string} [chars=' '] The string used as padding.
 * @example
 * "abc" → pad 8      → "  abc   "
 * "abc" → pad 8 "_-" → "_-abc_-_"
 * "abc" → pad 3      → "abc"
 */
function* pad(length, chars) {
  while (yield* this.pull()) {
    yield* this.push(_.pad(this.value, length, chars));
  }
}

/**
 * Pads each input `string` on the right side if it's shorter than
 * `length`.  Padding characters are truncated if they can't be evenly
 * divided by `length`.
 *
 * @static
 * @this rq.Context
 * @param {number} [length=0] The padding length.
 * @param {string} [chars=' '] The string used as padding.
 * @example
 * "abc" → padEnd 6      → "abc   "
 * "abc" → padEnd 6 "_-" → "abc_-_"
 * "abc" → padEnd 3      → "abc"
 */
function* padEnd(length, chars) {
  while (yield* this.pull()) {
    yield* this.push(_.padEnd(this.value, length, chars));
  }
}

/**
 * Pads each input `string` on the left side if it's shorter than
 * `length`.  Padding characters are truncated if they can't be evenly
 * divided by `length`.
 *
 * @static
 * @this rq.Context
 * @param {number} [length=0] The padding length.
 * @param {string} [chars=' '] The string used as padding.
 * @example
 * "abc" → padStart 6      → "   abc"
 * "abc" → padStart 6 "_-" → "_-_abc"
 * "abc" → padStart 3      → "abc"
 */
function* padStart(length, chars) {
  while (yield* this.pull()) {
    yield* this.push(_.padStart(this.value, length, chars));
  }
}

/**
 * Converts each input `string` to an integer of the specified
 * radix. If `radix` is `undefined` or `0`, a `radix` of `10` is used
 * unless `value` is a hexadecimal, in which case a `radix` of `16` is
 * used.
 *
 * **Note:** This method aligns with the [ES5
 * implementation](https://es5.github.io/#x15.1.2.2) of `parseInt`.
 *
 * @static
 * @this rq.Context
 * @param {number} [radix=10] The radix to interpret `value` by.
 * @example
 * "08"          → parseInt    → 8 (not tested)
 * "6" "08" "10" → parseInt    → 6 8 10 (not tested)
 * "a" "b" "c"   → parseInt 16 → 10 11 12 (not tested)
 */
function* parseInt(radix) {
  while (yield* this.pull()) {
    yield* this.push(_.parseInt(this.value, radix));
  }
}

/**
 * Repeats each input string `n` times.
 *
 * @static
 * @this rq.Context
 * @param {number} [n=1] The number of times to repeat the string.
 * @example
 * "*"   → repeat 3 → "***"
 * "abc" → repeat 2 → "abcabc"
 * "abc" → repeat 0 → ""
 */
function* repeat(n) {
  while (yield* this.pull()) {
    yield* this.push(_.repeat(this.value, n));
  }
}

/**
 * Replaces matches for `pattern` in each input `string` with
 * `replacement`.
 *
 * **Note:** This method is based on
 * [`String#replace`](https://mdn.io/String/replace).  Repeats each
 * input string `n` times.
 *
 * @static
 * @this rq.Context
 * @param {RegExp|string} pattern The pattern to replace.
 * @param {Function|string} replacement The match replacement.
 * @example
 * "Hi Fred" → replace "Fred" "Barney" → "Hi Barney"
 */
function* replace(pattern, replacement) {
  while (yield* this.pull()) {
    yield* this.push(_.replace(this.value, pattern, replacement));
  }
}

/**
 * Converts each input `string` to
 * [snake case](https://en.wikipedia.org/wiki/Snake_case).
 *
 * @static
 * @this rq.Context
 * @example
 * "Foo Bar"     → snakeCase → "foo_bar"
 * "fooBar"      → snakeCase → "foo_bar"
 * "--FOO-BAR--" → snakeCase → "foo_bar"
 */
function* snakeCase() {
  while (yield* this.pull()) {
    yield* this.push(_.snakeCase(this.value));
  }
}

/**
 * Splits each input `string` by `separator`.
 *
 * @static
 * @this rq.Context
 * @param {RegExp|string} separator The separator pattern to split by.
 * @param {number} [limit] The length to truncate results to.
 * @example
 * "a-b-c" → split "-"   → ["a", "b", "c"]
 * "a-b-c" → split "-" 2 → ["a", "b"]
 */
function* split(separator, limit) {
  while (yield* this.pull()) {
    yield* this.push(_.split(this.value, separator, limit));
  }
}

/**
 * Converts each input `string` to
 * [start case](https://en.wikipedia.org/wiki/Letter_case#Stylistic_or_specialised_usage).
 *
 * @static
 * @this rq.Context
 * @example
 * "--foo-bar--" → startCase → "Foo Bar"
 * "fooBar"      → startCase → "Foo Bar"
 * "__FOO_BAR__" → startCase → "FOO BAR"
 */
function* startCase() {
  while (yield* this.pull()) {
    yield* this.push(_.startCase(this.value));
  }
}

/**
 * Checks if each input `string` starts with the given target string.
 *
 * @static
 * @this rq.Context
 * @param {string} [target] The string to search for.
 * @param {number} [position=0] The position to search from.
 * @example
 * "abc" → startsWith "a"   → true
 * "abc" → startsWith "b"   → false
 * "abc" → startsWith "b" 1 → true
 */
function* startsWith(target, position) {
  while (yield* this.pull()) {
    yield* this.push(_.startsWith(this.value, target, position));
  }
}

/**
 * Creates a compiled template function that can interpolate data
 * properties in "interpolate" delimiters, HTML-escape interpolated
 * data properties in "escape" delimiters, and execute JavaScript in
 * "evaluate" delimiters. Data properties may be accessed as free
 * variables in the template. If a setting object is given, it takes
 * precedence over `_.templateSettings` values.
 *
 * **Note:** In the development build `_.template` utilizes
 * [sourceURLs](http://www.html5rocks.com/en/tutorials/developertools/sourcemaps/#toc-sourceurl)
 * for easier debugging.
 *
 * For more information on precompiling templates see
 * [lodash's custom builds documentation](https://lodash.com/custom-builds).
 *
 * For more information on Chrome extension sandboxes see
 * [Chrome's extensions documentation](https://developer.chrome.com/extensions/sandboxingEval).
 *
 * @static
 * @this rq.Context
 * @param {string} [string=''] The template string.
 * @param {Object} [options={}] The options object.
 * @param {RegExp} [options.escape=_.templateSettings.escape]
 *  The HTML "escape" delimiter.
 * @param {RegExp} [options.evaluate=_.templateSettings.evaluate]
 *  The "evaluate" delimiter.
 * @param {Object} [options.imports=_.templateSettings.imports]
 *  An object to import into the template as free variables.
 * @param {RegExp} [options.interpolate=_.templateSettings.interpolate]
 *  The "interpolate" delimiter.
 * @param {string} [options.sourceURL='lodash.templateSources[n]']
 *  The sourceURL of the compiled template.
 * @param {string} [options.variable='obj']
 *  The data object variable name.
 * @example
 * // Use the "interpolate" delimiter to create a compiled template.
 * {"user": "fred"} → template "hello &lt;%= user %&gt;!" → "hello fred!"
 *
 * // Use the HTML "escape" delimiter to escape data property values.
 * {"value": "&lt;script&gt;"} → template "&lt;b&gt;&lt;%- value %&gt;&lt;/b&gt;" → "&lt;b&gt;&amp;lt;script&amp;gt;&lt;/b&gt;"
 *
 * // Use the "evaluate" delimiter to execute JavaScript and generate HTML.
 * {"users": ["fred", "barney"]} → template "&lt;% _.forEach(users, function(user) { %&gt;&lt;li&gt;&lt;%- user %&gt;&lt;/li&gt;&lt;% }); %&gt;" → "&lt;li&gt;fred&lt;/li&gt;&lt;li&gt;barney&lt;/li&gt;"
 *
 * // Use the internal `print` function in "evaluate" delimiters.
 * {"user": "barney"} → template "&lt;% print('hello ' + user); %&gt;!" → "hello barney!"
 *
 * // Use backslashes to treat delimiters as plain text.
 * {"value": "ignored"} → template "&lt;%= '\\&lt;%- value %\\&gt;' %&gt;" → "&lt;%- value %&gt;"
 *
 * // Use the `variable` option to ensure a with-statement isn't used
 * // in the compiled template.
 * {"user": "barney"} → template "hi &lt;%= data.user %&gt;!" {"variable": "data"} → "hi barney!"
 */
function* template(string, options) {
  var template = _.template(string, options);
  while (yield* this.pull()) {
    yield* this.push(template(this.value));
  }
}

/**
 * Converts each input `string`, as a whole, to lower case just
 * like [String#toLowerCase](https://mdn.io/toLowerCase).
 *
 * @static
 * @this rq.Context
 * @example
 * "--Foo-Bar--" → toLower → "--foo-bar--"
 * "fooBar"      → toLower → "foobar"
 * "__FOO_BAR__" → toLower → "__foo_bar__"
 */
function* toLower() {
  while (yield* this.pull()) {
    yield* this.push(_.toLower(this.value));
  }
}

/**
 * Converts each input `string`, as a whole, to upper case just
 * like [String#toUpperCase](https://mdn.io/toUpperCase).
 *
 * @static
 * @this rq.Context
 * @example
 * "--foo-bar--" → toUpper → "--FOO-BAR--"
 * "fooBar"      → toUpper → "FOOBAR"
 * "__foo_bar__" → toUpper → "__FOO_BAR__"
 */
function* toUpper() {
  while (yield* this.pull()) {
    yield* this.push(_.toUpper(this.value));
  }
}

/**
 * Removes leading and trailing whitespace or specified characters
 * from each input `string`.
 *
 * @static
 * @this rq.Context
 * @example
 * "  abc  "   → trim      → "abc"
 * "-_-abc-_-" → trim "_-" → "abc"
 */
function* trim(chars) {
  while (yield* this.pull()) {
    yield* this.push(_.trim(this.value, chars));
  }
}

/**
 * Removes trailing whitespace or specified characters from each input
 * `string`.
 *
 * @static
 * @this rq.Context
 * @param {string} [chars=whitespace] The characters to trim.
 * @example
 * "  abc  "   → trimEnd      → "  abc"
 * "-_-abc-_-" → trimEnd "_-" → "-_-abc"
 */
function* trimEnd(chars) {
  while (yield* this.pull()) {
    yield* this.push(_.trimEnd(this.value, chars));
  }
}

/**
 * Removes leading whitespace or specified characters from each input
 * `string`.
 *
 * @static
 * @this rq.Context
 * @param {string} [chars=whitespace] The characters to trim.
 * @example
 * "  abc  "   → trimStart      → "abc  "
 * "-_-abc-_-" → trimStart "_-" → "abc-_-"
 */
function* trimStart(chars) {
  while (yield* this.pull()) {
    yield* this.push(_.trimStart(this.value, chars));
  }
}

/**
 * Truncates each input `string` if it's longer than the given maximum
 * string length.  The last characters of the truncated string are
 * replaced with the omission string which defaults to"...".
 *
 * @static
 * @this rq.Context
 * @param {Object} [options={}] The options object.
 * @param {number} [options.length=30] The maximum string length.
 * @param {string} [options.omission='...'] The string to indicate text is omitted.
 * @param {RegExp|string} [options.separator] The separator pattern to truncate to.
 * @example
 * "hi-diddly-ho there, neighborino" → truncate → "hi-diddly-ho there, neighbo..."
 * "hi-diddly-ho there, neighborino" → truncate {length: 24, separator: " "} → "hi-diddly-ho there,..."
 * "hi-diddly-ho there, neighborino" → truncate {omission: " [...]"} → "hi-diddly-ho there, neig [...]"
 */
function* truncate(options) {
  while (yield* this.pull()) {
    yield* this.push(_.truncate(this.value, options));
  }
}

/**
 * The inverse of `_.escape`; this method converts the HTML entities
 * `&amp;`, `&lt;`, `&gt;`, `&quot;`, and `&#39;` in `string` to their
 * corresponding characters.
 *
 * **Note:** No other HTML entities are unescaped. To unescape additional
 * HTML entities use a third-party library like [_he_](https://mths.be/he).
 *
 * @static
 * @this rq.Context
 * @example
 * "fred, barney, &amp; pebbles" → unescape → "fred, barney, & pebbles"
 */
function* unescape() {
  while (yield* this.pull()) {
    yield* this.push(_.unescape(this.value));
  }
}

/**
 * Converts each input `string`, as space separated words, to upper
 * case.
 *
 * @static
 * @this rq.Context
 * @example
 * "--foo-bar"   → upperCase → "FOO BAR"
 * "fooBar"      → upperCase → "FOO BAR"
 * "__FOO_BAR__" → upperCase → "FOO BAR"
 */
function* upperCase() {
  while (yield* this.pull()) {
    yield* this.push(_.upperCase(this.value));
  }
}

/**
 * Converts the first character of each input `string` to upper case.
 *
 * @static
 * @this rq.Context
 * @example
 * "fred" → upperFirst → "Fred"
 * "FRED" → upperFirst → "FRED"
 */
function* upperFirst() {
  while (yield* this.pull()) {
    yield* this.push(_.upperFirst(this.value));
  }
}

/**
 * Splits each input `string` into an array of its words.
 *
 * @static
 * @this rq.Context
 * @param {RegExp|string} [pattern] The pattern to match words.
 * @example
 * "fred, barney, & pebbles" → words          → ["fred", "barney", "pebbles"]
 */
function* words() {
  while (yield* this.pull()) {
    yield* this.push(_.words(this.value));
  }
}
