// @bun
// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/Pipeable.js
var pipeArguments = (self, args) => {
  switch (args.length) {
    case 0:
      return self;
    case 1:
      return args[0](self);
    case 2:
      return args[1](args[0](self));
    case 3:
      return args[2](args[1](args[0](self)));
    case 4:
      return args[3](args[2](args[1](args[0](self))));
    case 5:
      return args[4](args[3](args[2](args[1](args[0](self)))));
    case 6:
      return args[5](args[4](args[3](args[2](args[1](args[0](self))))));
    case 7:
      return args[6](args[5](args[4](args[3](args[2](args[1](args[0](self)))))));
    case 8:
      return args[7](args[6](args[5](args[4](args[3](args[2](args[1](args[0](self))))))));
    case 9:
      return args[8](args[7](args[6](args[5](args[4](args[3](args[2](args[1](args[0](self)))))))));
    default: {
      let ret = self;
      for (let i = 0, len = args.length;i < len; i++) {
        ret = args[i](ret);
      }
      return ret;
    }
  }
};
var Prototype = {
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var Class = /* @__PURE__ */ function() {
  function PipeableBase() {}
  PipeableBase.prototype = Prototype;
  return PipeableBase;
}();

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/Function.js
var dual = function(arity, body) {
  if (typeof arity === "function") {
    return function() {
      return arity(arguments) ? body.apply(this, arguments) : (self) => body(self, ...arguments);
    };
  }
  switch (arity) {
    case 0:
    case 1:
      throw new RangeError(`Invalid arity ${arity}`);
    case 2:
      return function(a, b) {
        if (arguments.length >= 2) {
          return body(a, b);
        }
        return function(self) {
          return body(self, a);
        };
      };
    case 3:
      return function(a, b, c) {
        if (arguments.length >= 3) {
          return body(a, b, c);
        }
        return function(self) {
          return body(self, a, b);
        };
      };
    default:
      return function() {
        if (arguments.length >= arity) {
          return body.apply(this, arguments);
        }
        const args = arguments;
        return function(self) {
          return body(self, ...args);
        };
      };
  }
};
var identity = (a) => a;
var constant = (value) => () => value;
var constUndefined = /* @__PURE__ */ constant(undefined);
var constVoid = constUndefined;
function memoize(f) {
  const cache = new WeakMap;
  return (a) => {
    const cached = cache.get(a);
    if (cached !== undefined)
      return cached;
    const result = f(a);
    cache.set(a, result);
    return result;
  };
}
function memoizeIdempotent(f) {
  const cache = new WeakMap;
  return (a) => {
    const cached = cache.get(a);
    if (cached !== undefined)
      return cached;
    const result = f(a);
    cache.set(a, result);
    cache.set(result, result);
    return result;
  };
}

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/internal/equal.js
var getAllObjectKeys = (obj) => {
  const keys = new Set(Reflect.ownKeys(obj));
  if (obj.constructor === Object)
    return keys;
  if (obj instanceof Error) {
    keys.delete("stack");
  }
  const proto = Object.getPrototypeOf(obj);
  let current = proto;
  while (current !== null && current !== Object.prototype) {
    const ownKeys = Reflect.ownKeys(current);
    for (let i = 0;i < ownKeys.length; i++) {
      keys.add(ownKeys[i]);
    }
    current = Object.getPrototypeOf(current);
  }
  if (keys.has("constructor") && typeof obj.constructor === "function" && proto === obj.constructor.prototype) {
    keys.delete("constructor");
  }
  return keys;
};
var byReferenceInstances = /* @__PURE__ */ new WeakSet;

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/Predicate.js
function isString(input) {
  return typeof input === "string";
}
function isNumber(input) {
  return typeof input === "number";
}
function isBoolean(input) {
  return typeof input === "boolean";
}
function isSymbol(input) {
  return typeof input === "symbol";
}
function isPropertyKey(u) {
  return isString(u) || isNumber(u) || isSymbol(u);
}
function isFunction(input) {
  return typeof input === "function";
}
function isNotUndefined(input) {
  return input !== undefined;
}
function isNotNullish(input) {
  return input != null;
}
function isUnknown(_) {
  return true;
}
function isObjectKeyword(input) {
  return typeof input === "object" && input !== null || isFunction(input);
}
var hasProperty = /* @__PURE__ */ dual(2, (self, property) => isObjectKeyword(self) && (property in self));

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/Hash.js
var symbol = "~effect/interfaces/Hash";
var hash = (self) => {
  switch (typeof self) {
    case "number":
      return number(self);
    case "bigint":
      return string(self.toString(10));
    case "boolean":
      return string(String(self));
    case "symbol":
      return string(String(self));
    case "string":
      return string(self);
    case "undefined":
      return string("undefined");
    case "function":
    case "object": {
      if (self === null) {
        return string("null");
      } else if (self instanceof Date) {
        if (Number.isNaN(self.getTime())) {
          return string("Invalid Date");
        }
        return string(self.toISOString());
      } else if (self instanceof RegExp) {
        return string(self.toString());
      } else {
        if (byReferenceInstances.has(self)) {
          return random(self);
        }
        if (hashCache.has(self)) {
          return hashCache.get(self);
        }
        const h = withVisitedTracking(self, () => {
          if (isHash(self)) {
            return self[symbol]();
          } else if (typeof self === "function") {
            return random(self);
          } else if (self instanceof DataView) {
            return array(new Uint8Array(self.buffer, self.byteOffset, self.byteLength));
          } else if (Array.isArray(self) || ArrayBuffer.isView(self)) {
            return array(self);
          } else if (self instanceof Map) {
            return hashMap(self);
          } else if (self instanceof Set) {
            return hashSet(self);
          }
          return structure(self);
        });
        hashCache.set(self, h);
        return h;
      }
    }
    default:
      throw new Error(`BUG: unhandled typeof ${typeof self} - please report an issue at https://github.com/Effect-TS/effect/issues`);
  }
};
var random = (self) => {
  if (!randomHashCache.has(self)) {
    randomHashCache.set(self, number(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)));
  }
  return randomHashCache.get(self);
};
var combine = /* @__PURE__ */ dual(2, (self, b) => self * 53 ^ b);
var optimize = (n) => n & 3221225471 | n >>> 1 & 1073741824;
var isHash = (u) => hasProperty(u, symbol);
var number = (n) => {
  if (n !== n) {
    return string("NaN");
  }
  if (n === Infinity) {
    return string("Infinity");
  }
  if (n === -Infinity) {
    return string("-Infinity");
  }
  let h = n | 0;
  if (h !== n) {
    h ^= n * 4294967295;
  }
  while (n > 4294967295) {
    h ^= n /= 4294967295;
  }
  return optimize(h);
};
var string = (str) => {
  let h = 5381, i = str.length;
  while (i) {
    h = h * 33 ^ str.charCodeAt(--i);
  }
  return optimize(h);
};
var structureKeys = (o, keys) => {
  let h = 12289;
  for (const key of keys) {
    h ^= combine(hash(key), hash(o[key]));
  }
  return optimize(h);
};
var structure = (o) => structureKeys(o, getAllObjectKeys(o));
var iterableWith = (seed, f) => (iter) => {
  let h = seed;
  for (const element of iter) {
    h ^= f(element);
  }
  return optimize(h);
};
var array = /* @__PURE__ */ iterableWith(6151, hash);
var hashMap = /* @__PURE__ */ iterableWith(/* @__PURE__ */ string("Map"), ([k, v]) => combine(hash(k), hash(v)));
var hashSet = /* @__PURE__ */ iterableWith(/* @__PURE__ */ string("Set"), hash);
var randomHashCache = /* @__PURE__ */ new WeakMap;
var hashCache = /* @__PURE__ */ new WeakMap;
var visitedObjects = /* @__PURE__ */ new WeakSet;
function withVisitedTracking(obj, fn) {
  if (visitedObjects.has(obj)) {
    return string("[Circular]");
  }
  visitedObjects.add(obj);
  const result = fn();
  visitedObjects.delete(obj);
  return result;
}

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/Equal.js
var symbol2 = "~effect/interfaces/Equal";
function equals() {
  if (arguments.length === 1) {
    return (self) => compareBoth(self, arguments[0]);
  }
  return compareBoth(arguments[0], arguments[1]);
}
function compareBoth(self, that) {
  if (self === that)
    return true;
  if (self == null || that == null)
    return false;
  const selfType = typeof self;
  if (selfType !== typeof that) {
    return false;
  }
  if (selfType === "number" && self !== self && that !== that) {
    return true;
  }
  if (selfType !== "object" && selfType !== "function") {
    return false;
  }
  if (byReferenceInstances.has(self) || byReferenceInstances.has(that)) {
    return false;
  }
  return withCache(self, that, compareObjects);
}
function withVisitedTracking2(self, that, fn) {
  const hasLeft = visitedLeft.has(self);
  const hasRight = visitedRight.has(that);
  if (hasLeft && hasRight) {
    return true;
  }
  if (hasLeft || hasRight) {
    return false;
  }
  visitedLeft.add(self);
  visitedRight.add(that);
  const result = fn();
  visitedLeft.delete(self);
  visitedRight.delete(that);
  return result;
}
var visitedLeft = /* @__PURE__ */ new WeakSet;
var visitedRight = /* @__PURE__ */ new WeakSet;
function compareObjects(self, that) {
  if (hash(self) !== hash(that)) {
    return false;
  } else if (self instanceof Date) {
    if (!(that instanceof Date))
      return false;
    const selfTime = self.getTime();
    const thatTime = that.getTime();
    return selfTime === thatTime || Number.isNaN(selfTime) && Number.isNaN(thatTime);
  } else if (self instanceof RegExp) {
    if (!(that instanceof RegExp))
      return false;
    return self.toString() === that.toString();
  }
  const selfIsEqual = isEqual(self);
  const thatIsEqual = isEqual(that);
  if (selfIsEqual !== thatIsEqual)
    return false;
  const bothEquals = selfIsEqual && thatIsEqual;
  if (typeof self === "function" && !bothEquals) {
    return false;
  }
  return withVisitedTracking2(self, that, () => {
    if (bothEquals) {
      return self[symbol2](that);
    } else if (Array.isArray(self)) {
      if (!Array.isArray(that) || self.length !== that.length) {
        return false;
      }
      return compareArrays(self, that);
    } else if (ArrayBuffer.isView(self)) {
      const selfIsDataView = self instanceof DataView;
      if (!ArrayBuffer.isView(that) || self.byteLength !== that.byteLength || selfIsDataView !== that instanceof DataView) {
        return false;
      }
      if (selfIsDataView) {
        const thatDataView = that;
        return compareTypedArrays(new Uint8Array(self.buffer, self.byteOffset, self.byteLength), new Uint8Array(thatDataView.buffer, thatDataView.byteOffset, thatDataView.byteLength));
      }
      return compareTypedArrays(self, that);
    } else if (self instanceof Map) {
      if (!(that instanceof Map) || self.size !== that.size) {
        return false;
      }
      return compareMaps(self, that);
    } else if (self instanceof Set) {
      if (!(that instanceof Set) || self.size !== that.size) {
        return false;
      }
      return compareSets(self, that);
    }
    return compareRecords(self, that);
  });
}
function withCache(self, that, f) {
  let selfMap = equalityCache.get(self);
  if (!selfMap) {
    selfMap = new WeakMap;
    equalityCache.set(self, selfMap);
  } else if (selfMap.has(that)) {
    return selfMap.get(that);
  }
  const result = f(self, that);
  selfMap.set(that, result);
  let thatMap = equalityCache.get(that);
  if (!thatMap) {
    thatMap = new WeakMap;
    equalityCache.set(that, thatMap);
  }
  thatMap.set(self, result);
  return result;
}
var equalityCache = /* @__PURE__ */ new WeakMap;
function compareArrays(self, that) {
  for (let i = 0;i < self.length; i++) {
    if (!compareBoth(self[i], that[i])) {
      return false;
    }
  }
  return true;
}
function compareTypedArrays(self, that) {
  if (self.length !== that.length) {
    return false;
  }
  for (let i = 0;i < self.length; i++) {
    if (self[i] !== that[i]) {
      return false;
    }
  }
  return true;
}
function compareRecords(self, that) {
  const selfKeys = getAllObjectKeys(self);
  const thatKeys = getAllObjectKeys(that);
  if (selfKeys.size !== thatKeys.size) {
    return false;
  }
  for (const key of selfKeys) {
    if (!thatKeys.has(key) || !compareBoth(self[key], that[key])) {
      return false;
    }
  }
  return true;
}
function makeCompareMap(keyEquivalence, valueEquivalence) {
  return function compareMaps(self, that) {
    const thatEntries = Array.from(that);
    for (const [selfKey, selfValue] of self) {
      let found = false;
      for (let i = 0;i < thatEntries.length; i++) {
        const [thatKey, thatValue] = thatEntries[i];
        if (keyEquivalence(selfKey, thatKey) && valueEquivalence(selfValue, thatValue)) {
          thatEntries[i] = thatEntries[thatEntries.length - 1];
          thatEntries.pop();
          found = true;
          break;
        }
      }
      if (!found) {
        return false;
      }
    }
    return true;
  };
}
var compareMaps = /* @__PURE__ */ makeCompareMap(compareBoth, compareBoth);
function makeCompareSet(equivalence) {
  return function compareSets(self, that) {
    const thatValues = Array.from(that);
    for (const selfValue of self) {
      let found = false;
      for (let i = 0;i < thatValues.length; i++) {
        const thatValue = thatValues[i];
        if (equivalence(selfValue, thatValue)) {
          thatValues[i] = thatValues[thatValues.length - 1];
          thatValues.pop();
          found = true;
          break;
        }
      }
      if (!found) {
        return false;
      }
    }
    return true;
  };
}
var compareSets = /* @__PURE__ */ makeCompareSet(compareBoth);
var isEqual = (u) => hasProperty(u, symbol2);

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/Redactable.js
var symbolRedactable = /* @__PURE__ */ Symbol.for("~effect/Redactable");
var isRedactable = (u) => hasProperty(u, symbolRedactable);
function redact(u) {
  if (isRedactable(u))
    return getRedacted(u);
  return u;
}
function getRedacted(redactable) {
  return redactable[symbolRedactable](globalThis[currentFiberTypeId]?.context ?? emptyContext);
}
var currentFiberTypeId = "~effect/Fiber/currentFiber";
var emptyMap = /* @__PURE__ */ new Map;
var emptyContext = {
  "~effect/Context": {},
  base: emptyMap,
  depth: 0,
  mapUnsafe: emptyMap,
  pipe() {
    return pipeArguments(this, arguments);
  }
};

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/Formatter.js
function format(input, options) {
  const space = options?.space ?? 0;
  const ancestors = new WeakSet;
  const gap = !space ? "" : typeof space === "number" ? " ".repeat(space) : space;
  const ind = (d) => gap.repeat(d);
  const wrap = (v, body) => {
    const ctor = v?.constructor;
    return ctor && ctor !== Object.prototype.constructor && ctor.name ? `${ctor.name}(${body})` : body;
  };
  const ownKeys = (o) => {
    try {
      return Reflect.ownKeys(o);
    } catch {
      return ["[ownKeys threw]"];
    }
  };
  function recur(v, d = 0) {
    if (typeof v === "string")
      return JSON.stringify(v);
    if (typeof v === "number" || v == null || typeof v === "boolean" || typeof v === "symbol")
      return String(v);
    if (typeof v === "bigint")
      return String(v) + "n";
    if (typeof v === "object" || typeof v === "function") {
      if (ancestors.has(v))
        return CIRCULAR;
      ancestors.add(v);
      let output;
      if (symbolRedactable in v) {
        output = recur(getRedacted(v), d);
      } else if (Array.isArray(v)) {
        output = !gap || v.length <= 1 ? `[${v.map((x) => recur(x, d)).join(",")}]` : `[
${ind(d + 1)}${v.map((x) => recur(x, d + 1)).join(`,
` + ind(d + 1))}
${ind(d)}]`;
      } else if (v instanceof Date) {
        output = formatDate(v);
      } else if (!options?.ignoreToString && hasProperty(v, "toString") && typeof v["toString"] === "function" && v["toString"] !== Object.prototype.toString && v["toString"] !== Array.prototype.toString) {
        const s = safeToString(v);
        output = v instanceof Error && v.cause ? `${s} (cause: ${recur(v.cause, d)})` : s;
      } else if (Symbol.iterator in v) {
        output = `${v.constructor.name}(${recur(Array.from(v), d)})`;
      } else {
        const keys = ownKeys(v);
        if (!gap || keys.length <= 1) {
          const body = `{${keys.map((k) => `${formatPropertyKey(k)}:${recur(v[k], d)}`).join(",")}}`;
          output = wrap(v, body);
        } else {
          const body = `{
${keys.map((k) => `${ind(d + 1)}${formatPropertyKey(k)}: ${recur(v[k], d + 1)}`).join(`,
`)}
${ind(d)}}`;
          output = wrap(v, body);
        }
      }
      ancestors.delete(v);
      return output;
    }
    return String(v);
  }
  return recur(input, 0);
}
var CIRCULAR = "[Circular]";
function formatPropertyKey(name) {
  return typeof name === "string" ? JSON.stringify(name) : String(name);
}
function formatPath(path) {
  return path.map((key) => `[${formatPropertyKey(key)}]`).join("");
}
function formatDate(date) {
  try {
    return date.toISOString();
  } catch {
    return "Invalid Date";
  }
}
function safeToString(input) {
  try {
    const s = input.toString();
    return typeof s === "string" ? s : String(s);
  } catch {
    return "[toString threw]";
  }
}

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/Inspectable.js
var NodeInspectSymbol = /* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom");
var toJson = (input) => {
  try {
    input = redact(input);
    if (hasProperty(input, "toJSON") && isFunction(input["toJSON"]) && input["toJSON"].length === 0) {
      return input.toJSON();
    } else if (Array.isArray(input)) {
      return input.map(toJson);
    }
    return input;
  } catch {
    return "[toJSON threw]";
  }
};
var BaseProto = {
  toJSON() {
    return toJson(this);
  },
  [NodeInspectSymbol]() {
    return this.toJSON();
  },
  toString() {
    return format(this.toJSON());
  }
};

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/Utils.js
class SingleShotGen {
  called = false;
  self;
  constructor(self) {
    this.self = self;
  }
  next(a) {
    return this.called ? {
      value: a,
      done: true
    } : (this.called = true, {
      value: this.self,
      done: false
    });
  }
  [Symbol.iterator]() {
    return new SingleShotGen(this.self);
  }
}
var pickInternalCall = () => {
  const InternalTypeId = "~effect/Utils/internal";
  const standard = {
    [InternalTypeId]: (body) => {
      return body();
    }
  };
  const forced = {
    [InternalTypeId]: (body) => {
      try {
        return body();
      } finally {}
    }
  };
  const isNotOptimizedAway = standard[InternalTypeId](() => new Error().stack)?.includes(InternalTypeId) === true;
  return isNotOptimizedAway ? standard[InternalTypeId] : forced[InternalTypeId];
};
var internalCall = /* @__PURE__ */ pickInternalCall();

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/internal/record.js
function assignProperty(self, key, value) {
  if (key === "__proto__") {
    Object.defineProperty(self, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true
    });
  } else {
    self[key] = value;
  }
}
function assignProperties(self, source) {
  for (const key of Reflect.ownKeys(source)) {
    if (Object.prototype.propertyIsEnumerable.call(source, key)) {
      assignProperty(self, key, source[key]);
    }
  }
}

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/internal/core.js
var EffectTypeId = `~effect/Effect`;
var ExitTypeId = `~effect/Exit`;
var effectVariance = {
  _A: identity,
  _E: identity,
  _R: identity
};
var identifier = `${EffectTypeId}/identifier`;
var args = `${EffectTypeId}/args`;
var evaluate = `${EffectTypeId}/evaluate`;
var contA = `${EffectTypeId}/successCont`;
var contE = `${EffectTypeId}/failureCont`;
var contAll = `${EffectTypeId}/ensureCont`;
var Yield = /* @__PURE__ */ Symbol.for("effect/Effect/Yield");
var PipeInspectableProto = {
  pipe() {
    return pipeArguments(this, arguments);
  },
  toJSON() {
    return {
      ...this
    };
  },
  toString() {
    return format(this.toJSON(), {
      ignoreToString: true,
      space: 2
    });
  },
  [NodeInspectSymbol]() {
    return this.toJSON();
  }
};
var StructuralProto = {
  [symbol]() {
    return structureKeys(this, Object.keys(this));
  },
  [symbol2](that) {
    const selfKeys = Object.keys(this);
    const thatKeys = Object.keys(that);
    if (selfKeys.length !== thatKeys.length)
      return false;
    for (let i = 0;i < selfKeys.length; i++) {
      if (selfKeys[i] !== thatKeys[i] || !equals(this[selfKeys[i]], that[selfKeys[i]])) {
        return false;
      }
    }
    return true;
  }
};
var EffectProto = {
  [EffectTypeId]: effectVariance,
  ...PipeInspectableProto,
  [Symbol.iterator]() {
    return new SingleShotGen(this);
  },
  toJSON() {
    return {
      _id: "Effect",
      op: this[identifier],
      ...args in this ? {
        args: this[args]
      } : undefined
    };
  }
};
var isExit = (u) => hasProperty(u, ExitTypeId);
var CauseTypeId = "~effect/Cause";
var CauseReasonTypeId = "~effect/Cause/Reason";
var isCause = (self) => hasProperty(self, CauseTypeId);
class CauseImpl {
  [CauseTypeId];
  reasons;
  constructor(failures) {
    this[CauseTypeId] = CauseTypeId;
    this.reasons = failures;
  }
  pipe() {
    return pipeArguments(this, arguments);
  }
  toJSON() {
    return {
      _id: "Cause",
      failures: this.reasons.map((f) => f.toJSON())
    };
  }
  toString() {
    return `Cause(${format(this.reasons)})`;
  }
  [NodeInspectSymbol]() {
    return this.toJSON();
  }
  [symbol2](that) {
    return isCause(that) && this.reasons.length === that.reasons.length && this.reasons.every((e, i) => equals(e, that.reasons[i]));
  }
  [symbol]() {
    return array(this.reasons);
  }
}
var annotationsMap = /* @__PURE__ */ new WeakMap;

class ReasonBase {
  [CauseReasonTypeId];
  annotations;
  _tag;
  constructor(_tag, annotations, originalError) {
    this[CauseReasonTypeId] = CauseReasonTypeId;
    this._tag = _tag;
    if (annotations !== constEmptyAnnotations && typeof originalError === "object" && originalError !== null && annotations.size > 0) {
      const prevAnnotations = annotationsMap.get(originalError);
      if (prevAnnotations) {
        annotations = new Map([...prevAnnotations, ...annotations]);
      }
      annotationsMap.set(originalError, annotations);
    }
    this.annotations = annotations;
  }
  annotate(annotations, options) {
    if (annotations.mapUnsafe.size === 0)
      return this;
    const newAnnotations = new Map(this.annotations);
    annotations.mapUnsafe.forEach((value, key) => {
      if (options?.overwrite !== true && newAnnotations.has(key))
        return;
      newAnnotations.set(key, value);
    });
    const self = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    self.annotations = newAnnotations;
    return self;
  }
  pipe() {
    return pipeArguments(this, arguments);
  }
  toString() {
    return format(this);
  }
  [NodeInspectSymbol]() {
    return this.toString();
  }
}
var constEmptyAnnotations = /* @__PURE__ */ new Map;

class Fail extends ReasonBase {
  error;
  constructor(error, annotations = constEmptyAnnotations) {
    super("Fail", annotations, error);
    this.error = error;
  }
  toString() {
    return `Fail(${format(this.error)})`;
  }
  toJSON() {
    return {
      _tag: "Fail",
      error: this.error
    };
  }
  [symbol2](that) {
    return isFailReason(that) && equals(this.error, that.error) && equals(this.annotations, that.annotations);
  }
  [symbol]() {
    return combine(string(this._tag))(combine(hash(this.error))(hash(this.annotations)));
  }
}
var causeFromReasons = (reasons) => new CauseImpl(reasons);
var causeFail = (error) => new CauseImpl([new Fail(error)]);

class Die extends ReasonBase {
  defect;
  constructor(defect, annotations = constEmptyAnnotations) {
    super("Die", annotations, defect);
    this.defect = defect;
  }
  toString() {
    return `Die(${format(this.defect)})`;
  }
  toJSON() {
    return {
      _tag: "Die",
      defect: this.defect
    };
  }
  [symbol2](that) {
    return isDieReason(that) && equals(this.defect, that.defect) && equals(this.annotations, that.annotations);
  }
  [symbol]() {
    return combine(string(this._tag))(combine(hash(this.defect))(hash(this.annotations)));
  }
}
var causeDie = (defect) => new CauseImpl([new Die(defect)]);
var causeAnnotate = /* @__PURE__ */ dual((args) => isCause(args[0]), (self, annotations, options) => {
  if (annotations.mapUnsafe.size === 0)
    return self;
  return new CauseImpl(self.reasons.map((f) => f.annotate(annotations, options)));
});
var isFailReason = (self) => self._tag === "Fail";
var isDieReason = (self) => self._tag === "Die";
var isInterruptReason = (self) => self._tag === "Interrupt";
function defaultEvaluate(_fiber) {
  return exitDie(`Effect.evaluate: Not implemented`);
}
var makePrimitiveProto = (options) => ({
  ...EffectProto,
  [identifier]: options.op,
  [evaluate]: options[evaluate] ?? defaultEvaluate,
  [contA]: options[contA],
  [contE]: options[contE],
  [contAll]: options[contAll]
});
var makePrimitive = (options) => {
  const Proto = makePrimitiveProto(options);
  return function() {
    const self = Object.create(Proto);
    self[args] = options.single === false ? arguments : arguments[0];
    return self;
  };
};
var makeExit = (options) => {
  const Proto = {
    [ExitTypeId]: ExitTypeId,
    _tag: options.op,
    get [options.prop]() {
      return this[args];
    },
    ...makePrimitiveProto(options),
    toString() {
      return `${options.op}(${format(this[args])})`;
    },
    toJSON() {
      return {
        _id: "Exit",
        _tag: options.op,
        [options.prop]: this[args]
      };
    },
    [symbol2](that) {
      return isExit(that) && that._tag === this._tag && equals(this[args], that[args]);
    },
    [symbol]() {
      return combine(string(options.op), hash(this[args]));
    }
  };
  return function(value) {
    const self = Object.create(Proto);
    self[args] = value;
    return self;
  };
};
var exitSucceed = /* @__PURE__ */ makeExit({
  op: "Success",
  prop: "value",
  [evaluate](fiber) {
    const cont = fiber.getCont(contA);
    return cont ? cont[contA](this[args], fiber, this) : fiber.yieldWith(this);
  }
});
var StackTraceKey = {
  key: "effect/Cause/StackTrace"
};
var InterruptorStackTrace = {
  key: "effect/Cause/InterruptorStackTrace"
};
var exitFailCause = /* @__PURE__ */ makeExit({
  op: "Failure",
  prop: "cause",
  [evaluate](fiber) {
    let cause = this[args];
    let annotated = false;
    if (fiber.currentStackFrame) {
      cause = causeAnnotate(cause, {
        mapUnsafe: new Map([[StackTraceKey.key, fiber.currentStackFrame]])
      });
      annotated = true;
    }
    let cont = fiber.getCont(contE);
    while (fiber.interruptible && fiber._interruptedCause && cont) {
      cont = fiber.getCont(contE);
    }
    return cont ? cont[contE](cause, fiber, annotated ? undefined : this) : fiber.yieldWith(annotated ? exitFailCause(cause) : this);
  }
});
var exitFail = (e) => exitFailCause(causeFail(e));
var exitDie = (defect) => exitFailCause(causeDie(defect));
var withFiber = /* @__PURE__ */ makePrimitive({
  op: "WithFiber",
  [evaluate](fiber) {
    return this[args](fiber);
  }
});
var YieldableError = /* @__PURE__ */ function() {

  class YieldableError extends globalThis.Error {
  }
  const proto = /* @__PURE__ */ makePrimitiveProto({
    op: "YieldableError",
    [evaluate]() {
      return exitFail(this);
    }
  });
  delete proto.toString;
  Object.assign(YieldableError.prototype, proto);
  return YieldableError;
}();
var Error2 = /* @__PURE__ */ function() {
  const plainArgsSymbol = /* @__PURE__ */ Symbol.for("effect/Data/Error/plainArgs");
  return class Base extends YieldableError {
    constructor(args) {
      super(args?.message, args?.cause ? {
        cause: args.cause
      } : undefined);
      if (args) {
        assignProperties(this, args);
        Object.defineProperty(this, plainArgsSymbol, {
          value: args,
          enumerable: false
        });
      }
    }
    toJSON() {
      return {
        ...this[plainArgsSymbol],
        ...this
      };
    }
  };
}();
var TaggedError = (tag) => {

  class Base extends Error2 {
    _tag = tag;
  }
  Base.prototype.name = tag;
  return Base;
};
var DoneTypeId = "~effect/Cause/Done";
var DoneVoid = {
  [DoneTypeId]: DoneTypeId,
  _tag: "Done",
  value: undefined
};

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/Data.js
var Class2 = class extends Class {
  constructor(props) {
    super();
    if (props) {
      assignProperties(this, props);
    }
  }
};
var TaggedError2 = TaggedError;
// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/Effectable.js
var Prototype2 = (options) => makePrimitiveProto({
  op: options.label,
  [evaluate]: options.evaluate
});

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/internal/option.js
var TypeId = "~effect/data/Option";
var CommonProto = {
  [TypeId]: {
    _A: (_) => _
  },
  ...PipeInspectableProto,
  [Symbol.iterator]() {
    return new SingleShotGen(this);
  }
};
var SomeProto = /* @__PURE__ */ Object.defineProperty(/* @__PURE__ */ Object.assign(/* @__PURE__ */ Object.create(CommonProto), {
  _tag: "Some",
  _op: "Some",
  [symbol2](that) {
    return isOption(that) && isSome(that) && equals(this.value, that.value);
  },
  [symbol]() {
    return combine(hash(this._tag))(hash(this.value));
  },
  toString() {
    return `some(${format(this.value)})`;
  },
  toJSON() {
    return {
      _id: "Option",
      _tag: this._tag,
      value: toJson(this.value)
    };
  }
}), "valueOrUndefined", {
  get() {
    return this.value;
  }
});
var NoneHash = /* @__PURE__ */ hash("None");
var NoneProto = /* @__PURE__ */ Object.assign(/* @__PURE__ */ Object.create(CommonProto), {
  _tag: "None",
  _op: "None",
  valueOrUndefined: undefined,
  [symbol2](that) {
    return isOption(that) && isNone(that);
  },
  [symbol]() {
    return NoneHash;
  },
  toString() {
    return `none()`;
  },
  toJSON() {
    return {
      _id: "Option",
      _tag: this._tag
    };
  }
});
var isOption = (input) => hasProperty(input, TypeId);
var isNone = (fa) => fa._tag === "None";
var isSome = (fa) => fa._tag === "Some";
var none = /* @__PURE__ */ Object.create(NoneProto);
var some = (value) => {
  const a = Object.create(SomeProto);
  a.value = value;
  return a;
};

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/internal/result.js
var TypeId2 = "~effect/data/Result";
var CommonProto2 = {
  [TypeId2]: {
    _A: (_) => _,
    _E: (_) => _
  },
  ...PipeInspectableProto,
  [Symbol.iterator]() {
    return new SingleShotGen(this);
  }
};
var SuccessProto = /* @__PURE__ */ Object.assign(/* @__PURE__ */ Object.create(CommonProto2), {
  _tag: "Success",
  _op: "Success",
  [symbol2](that) {
    return isResult(that) && isSuccess(that) && equals(this.success, that.success);
  },
  [symbol]() {
    return combine(hash(this._tag))(hash(this.success));
  },
  toString() {
    return `success(${format(this.success)})`;
  },
  toJSON() {
    return {
      _id: "Result",
      _tag: this._tag,
      value: toJson(this.success)
    };
  }
});
var FailureProto = /* @__PURE__ */ Object.assign(/* @__PURE__ */ Object.create(CommonProto2), {
  _tag: "Failure",
  _op: "Failure",
  [symbol2](that) {
    return isResult(that) && isFailure(that) && equals(this.failure, that.failure);
  },
  [symbol]() {
    return combine(hash(this._tag))(hash(this.failure));
  },
  toString() {
    return `failure(${format(this.failure)})`;
  },
  toJSON() {
    return {
      _id: "Result",
      _tag: this._tag,
      failure: toJson(this.failure)
    };
  }
});
var isResult = (input) => hasProperty(input, TypeId2);
var isFailure = (result) => result._tag === "Failure";
var isSuccess = (result) => result._tag === "Success";
var fail = (failure) => {
  const a = Object.create(FailureProto);
  a.failure = failure;
  return a;
};
var succeed = (success) => {
  const a = Object.create(SuccessProto);
  a.success = success;
  return a;
};

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/Order.js
function make(compare) {
  return (self, that) => self === that ? 0 : compare(self, that);
}
var Number2 = /* @__PURE__ */ make((self, that) => {
  if (globalThis.Number.isNaN(self) && globalThis.Number.isNaN(that))
    return 0;
  if (globalThis.Number.isNaN(self))
    return -1;
  if (globalThis.Number.isNaN(that))
    return 1;
  return self < that ? -1 : 1;
});
var isLessThan = (O) => dual(2, (self, that) => O(self, that) === -1);
var isGreaterThan = (O) => dual(2, (self, that) => O(self, that) === 1);
var isLessThanOrEqualTo = (O) => dual(2, (self, that) => O(self, that) !== 1);
var isGreaterThanOrEqualTo = (O) => dual(2, (self, that) => O(self, that) !== -1);

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/Option.js
var none2 = () => none;
var some2 = some;
var isNone2 = isNone;
var isSome2 = isSome;
var map = /* @__PURE__ */ dual(2, (self, f) => isNone2(self) ? none2() : some2(f(self.value)));
var filter = /* @__PURE__ */ dual(2, (self, predicate) => isNone2(self) ? none2() : predicate(self.value) ? some2(self.value) : none2());

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/Context.js
var ServiceTypeId = "~effect/Context/Service";
var Service = function() {
  function KeyClass() {}
  const self = KeyClass;
  Object.setPrototypeOf(self, ServiceProto);
  const init = (key, options) => {
    self.key = key;
    if (options?.defaultValue) {
      self[ReferenceTypeId] = ReferenceTypeId;
      self.defaultValue = options.defaultValue;
    }
    if (options?.make) {
      self.make = options.make;
    }
    if (options?.fiberCached) {
      cacheKeys.add(key);
    }
    return self;
  };
  return arguments.length > 0 ? init(arguments[0], arguments[1]) : init;
};
var ServiceProto = {
  [ServiceTypeId]: ServiceTypeId,
  .../* @__PURE__ */ Prototype2({
    label: "Service",
    evaluate(fiber) {
      return exitSucceed(get(fiber.context, this));
    }
  }),
  toJSON() {
    return {
      _id: "Service",
      key: this.key
    };
  },
  of(self) {
    return self;
  },
  context(self) {
    return make2(this, self);
  },
  use(f) {
    return withFiber((fiber) => f(get(fiber.context, this)));
  },
  useSync(f) {
    return withFiber((fiber) => exitSucceed(f(get(fiber.context, this))));
  }
};
var cacheKeys = /* @__PURE__ */ new Set;
var ReferenceTypeId = "~effect/Context/Reference";
var TypeId3 = "~effect/Context";
var MaxDepth = 8;
var FlattenAfterBaseHits = 8;
var makeImpl = (cacheRoot, base, overlay, depth) => {
  const self = Object.create(Proto);
  self.cacheRoot = cacheRoot ?? self;
  self.base = base;
  self.overlay = overlay;
  self.depth = depth;
  self._flat = undefined;
  self.baseHits = 0;
  return self;
};
var applyOverlays = (map, overlay) => {
  if (!overlay)
    return;
  applyOverlays(map, overlay.parent);
  map.set(overlay.key, overlay.value);
};
var flatten = (self) => {
  if (self._flat)
    return self._flat;
  if (!self.overlay)
    return self._flat = self.base;
  const map = new Map(self.base);
  applyOverlays(map, self.overlay);
  return self._flat = map;
};
var notFound = /* @__PURE__ */ Symbol();
var lookup = (self, key) => {
  const impl = self;
  for (let overlay = impl.overlay;overlay; overlay = overlay.parent) {
    if (overlay.key === key)
      return overlay.value;
  }
  const value = impl.base.get(key);
  if (value === undefined && !impl.base.has(key))
    return notFound;
  if (impl.overlay && ++impl.baseHits >= FlattenAfterBaseHits) {
    impl.base = flatten(impl);
    impl.overlay = undefined;
    impl.depth = 0;
  }
  return value;
};
var makeUnsafe = (mapUnsafe) => makeImpl(undefined, mapUnsafe, undefined, 0);
var Proto = {
  get mapUnsafe() {
    return flatten(this);
  },
  ...PipeInspectableProto,
  [TypeId3]: {
    _Services: (_) => _
  },
  toJSON() {
    return {
      _id: "Context",
      services: Array.from(this.mapUnsafe).map(([key, value]) => ({
        key,
        value
      }))
    };
  },
  [symbol2](that) {
    if (!isContext(that))
      return false;
    const self = this.mapUnsafe;
    const other = that.mapUnsafe;
    if (self.size !== other.size)
      return false;
    for (const [key, value] of self) {
      if (!other.has(key) || !equals(value, other.get(key)))
        return false;
    }
    return true;
  },
  [symbol]() {
    return number(this.mapUnsafe.size);
  }
};
var hasSameCache = (self, that) => self.cacheRoot === that.cacheRoot;
var isContext = (u) => hasProperty(u, TypeId3);
var isReference = (u) => !!u[ReferenceTypeId];
var empty = () => emptyContext2;
var emptyContext2 = /* @__PURE__ */ makeUnsafe(/* @__PURE__ */ new Map);
var make2 = (key, service) => makeUnsafe(new Map([[key.key, service]]));
var add = /* @__PURE__ */ dual(3, (self, key, service) => addUnsafe(self, key.key, service));
var addUnsafe = (self, key, service) => {
  const impl = self;
  const cacheRoot = cacheKeys.has(key) ? undefined : impl.cacheRoot;
  if (impl.depth >= MaxDepth) {
    const map = new Map(impl.mapUnsafe);
    map.set(key, service);
    return makeImpl(cacheRoot, map, undefined, 0);
  }
  return makeImpl(cacheRoot, impl.base, {
    key,
    value: service,
    parent: impl.overlay
  }, impl.depth + 1);
};
var getOrUndefinedUnsafe = (self, key) => {
  const value = lookup(self, key);
  return value === notFound ? undefined : value;
};
var getUnsafe = /* @__PURE__ */ dual(2, (self, service) => {
  const value = lookup(self, service.key);
  if (value === notFound) {
    if (isReference(service))
      return getDefaultValue(service);
    throw serviceNotFoundError(service);
  }
  return value;
});
var get = getUnsafe;
var defaultValueCacheKey = "~effect/Context/defaultValue";
var getDefaultValue = (ref) => {
  if (defaultValueCacheKey in ref) {
    return ref[defaultValueCacheKey];
  }
  return ref[defaultValueCacheKey] = ref.defaultValue();
};
var serviceNotFoundError = (service) => {
  const error = new Error(`Service not found${service.key ? `: ${String(service.key)}` : ""}`);
  if (error.stack) {
    const lines = error.stack.split(`
`);
    lines.splice(1, 3);
    error.stack = lines.join(`
`);
  }
  return error;
};
var Reference = Service;

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/internal/array.js
var isArrayNonEmpty = (self) => self.length > 0;

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/Result.js
var succeed2 = succeed;
var fail2 = fail;
var isFailure2 = isFailure;
var match = /* @__PURE__ */ dual(2, (self, {
  onFailure,
  onSuccess
}) => isFailure2(self) ? onFailure(self.failure) : onSuccess(self.success));

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/Array.js
var Array2 = globalThis.Array;
var fromIterable = (collection) => Array2.isArray(collection) ? collection : Array2.from(collection);
var append = /* @__PURE__ */ dual(2, (self, last) => [...self, last]);
var appendAll = /* @__PURE__ */ dual(2, (self, that) => fromIterable(self).concat(fromIterable(that)));
var isArray = Array2.isArray;
var isArrayNonEmpty2 = isArrayNonEmpty;
var isReadonlyArrayNonEmpty = isArrayNonEmpty;
var hashBucketsAdd = (buckets, value) => {
  const hash2 = hash(value);
  const bucket = buckets.get(hash2);
  if (bucket === undefined) {
    buckets.set(hash2, [value]);
    return true;
  }
  for (const previous of bucket) {
    if (equals(previous, value)) {
      return false;
    }
  }
  bucket.push(value);
  return true;
};
var union = /* @__PURE__ */ dual(2, (self, that) => {
  const a = fromIterable(self);
  const b = fromIterable(that);
  if (isReadonlyArrayNonEmpty(a)) {
    return isReadonlyArrayNonEmpty(b) ? dedupe(appendAll(a, b)) : a;
  }
  return b;
});
var empty2 = () => [];
var map2 = /* @__PURE__ */ dual(2, (self, f) => self.map(f));
var dedupe = (self) => {
  const input = fromIterable(self);
  if (input.length < 2) {
    return [...input];
  }
  const buckets = new Map;
  const out = [];
  for (const value of input) {
    if (hashBucketsAdd(buckets, value)) {
      out.push(value);
    }
  }
  return out;
};

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/Scheduler.js
var Scheduler = /* @__PURE__ */ Reference("effect/Scheduler", {
  fiberCached: true,
  defaultValue: () => new MixedScheduler
});
var setImmediate = "setImmediate" in globalThis ? (f) => {
  const timer = globalThis.setImmediate(f);
  return () => globalThis.clearImmediate(timer);
} : (f) => {
  const timer = setTimeout(f, 0);
  return () => clearTimeout(timer);
};
var setMicrotask = (f) => {
  let cancelled = false;
  Promise.resolve().then(() => {
    if (!cancelled)
      f();
  });
  return () => {
    cancelled = true;
  };
};

class PriorityBuckets {
  buckets = [];
  scheduleTask(task, priority) {
    const buckets = this.buckets;
    const len = buckets.length;
    let bucket;
    let index = 0;
    for (;index < len; index++) {
      if (buckets[index][0] > priority)
        break;
      bucket = buckets[index];
    }
    if (bucket && bucket[0] === priority) {
      bucket[1].push(task);
    } else if (index === len) {
      buckets.push([priority, [task]]);
    } else {
      buckets.splice(index, 0, [priority, [task]]);
    }
  }
  drain() {
    const buckets = this.buckets;
    this.buckets = [];
    return buckets;
  }
}

class MixedScheduler {
  executionMode;
  setImmediate;
  constructor(executionMode = "async", setImmediateFn) {
    this.executionMode = executionMode;
    this.setImmediate = setImmediateFn ?? (executionMode === "sync" ? setMicrotask : setImmediate);
  }
  shouldYield(fiber) {
    return fiber.currentOpCount >= fiber.maxOpsBeforeYield;
  }
  makeDispatcher() {
    return new MixedSchedulerDispatcher(this.setImmediate);
  }
}

class MixedSchedulerDispatcher {
  tasks = /* @__PURE__ */ new PriorityBuckets;
  running = undefined;
  setImmediate;
  constructor(setImmediateFn = setImmediate) {
    this.setImmediate = setImmediateFn;
  }
  scheduleTask(task, priority) {
    this.tasks.scheduleTask(task, priority);
    if (this.running === undefined) {
      this.running = this.setImmediate(this.afterScheduled);
    }
  }
  afterScheduled = () => {
    this.running = undefined;
    this.runTasks();
  };
  runTasks() {
    const buckets = this.tasks.drain();
    for (let i = 0;i < buckets.length; i++) {
      const toRun = buckets[i][1];
      for (let j = 0;j < toRun.length; j++) {
        toRun[j]();
      }
    }
  }
  flush() {
    while (this.tasks.buckets.length > 0) {
      if (this.running !== undefined) {
        this.running();
        this.running = undefined;
      }
      this.runTasks();
    }
  }
}
var MaxOpsBeforeYield = /* @__PURE__ */ Reference("effect/Scheduler/MaxOpsBeforeYield", {
  fiberCached: true,
  defaultValue: () => 2048
});
var PreventSchedulerYield = /* @__PURE__ */ Reference("effect/Scheduler/PreventSchedulerYield", {
  fiberCached: true,
  defaultValue: () => false
});

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/Encoding.js
var EncodingErrorTypeId = "~effect/encoding/EncodingError";

class EncodingError extends (/* @__PURE__ */ TaggedError2("EncodingError")) {
  [EncodingErrorTypeId] = EncodingErrorTypeId;
}
var encodeBase64 = (input) => typeof input === "string" ? base64EncodeUint8Array(encoder.encode(input)) : base64EncodeUint8Array(input);
var decodeBase64 = (str) => {
  const stripped = stripCrlf(str);
  const length = stripped.length;
  if (length % 4 !== 0) {
    return fail2(new EncodingError({
      kind: "Decode",
      module: "Base64",
      input: stripped,
      message: `Length must be a multiple of 4, but is ${length}`
    }));
  }
  const index = stripped.indexOf("=");
  if (index !== -1 && (index < length - 2 || index === length - 2 && stripped[length - 1] !== "=")) {
    return fail2(new EncodingError({
      kind: "Decode",
      module: "Base64",
      input: stripped,
      message: `Found a '=' character, but it is not at the end`
    }));
  }
  try {
    const missingOctets = stripped.endsWith("==") ? 2 : stripped.endsWith("=") ? 1 : 0;
    const result = new Uint8Array(3 * (length / 4) - missingOctets);
    for (let i = 0, j = 0;i < length; i += 4, j += 3) {
      const buffer = getBase64Code(stripped.charCodeAt(i)) << 18 | getBase64Code(stripped.charCodeAt(i + 1)) << 12 | getBase64Code(stripped.charCodeAt(i + 2)) << 6 | getBase64Code(stripped.charCodeAt(i + 3));
      result[j] = buffer >> 16;
      result[j + 1] = buffer >> 8 & 255;
      result[j + 2] = buffer & 255;
    }
    return succeed2(result);
  } catch (e) {
    return fail2(new EncodingError({
      kind: "Decode",
      module: "Base64",
      input: stripped,
      message: e instanceof Error ? e.message : "Invalid input"
    }));
  }
};
var encoder = /* @__PURE__ */ new TextEncoder;
var stripCrlf = (str) => str.replace(/[\n\r]/g, "");
var base64EncodeUint8Array = (bytes) => {
  const length = bytes.length;
  let result = "";
  let i;
  for (i = 2;i < length; i += 3) {
    result += base64abc[bytes[i - 2] >> 2];
    result += base64abc[(bytes[i - 2] & 3) << 4 | bytes[i - 1] >> 4];
    result += base64abc[(bytes[i - 1] & 15) << 2 | bytes[i] >> 6];
    result += base64abc[bytes[i] & 63];
  }
  if (i === length + 1) {
    result += base64abc[bytes[i - 2] >> 2];
    result += base64abc[(bytes[i - 2] & 3) << 4];
    result += "==";
  }
  if (i === length) {
    result += base64abc[bytes[i - 2] >> 2];
    result += base64abc[(bytes[i - 2] & 3) << 4 | bytes[i - 1] >> 4];
    result += base64abc[(bytes[i - 1] & 15) << 2];
    result += "=";
  }
  return result;
};
function getBase64Code(charCode) {
  if (charCode >= base64codes.length) {
    throw new TypeError(`Invalid character ${String.fromCharCode(charCode)}`);
  }
  const code = base64codes[charCode];
  if (code === 255) {
    throw new TypeError(`Invalid character ${String.fromCharCode(charCode)}`);
  }
  return code;
}
var base64abc = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "/"];
var base64codes = [255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 62, 255, 255, 255, 63, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 255, 255, 255, 0, 255, 255, 255, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 255, 255, 255, 255, 255, 255, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51];
var byteToHex = [];
for (let i = 0;i < 256; i++) {
  byteToHex.push(i.toString(16).padStart(2, "0"));
}

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/Tracer.js
var ParentSpanKey = "effect/Tracer/ParentSpan";
var TracerKey = "effect/Tracer";

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/internal/metric.js
var FiberRuntimeMetricsKey = "effect/observability/Metric/FiberRuntimeMetricsKey";

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/internal/references.js
var CurrentStackFrame = /* @__PURE__ */ Reference("effect/References/CurrentStackFrame", {
  fiberCached: true,
  defaultValue: constUndefined
});
var CurrentLogLevel = /* @__PURE__ */ Reference("effect/References/CurrentLogLevel", {
  fiberCached: true,
  defaultValue: () => "Info"
});
var MinimumLogLevel = /* @__PURE__ */ Reference("effect/References/MinimumLogLevel", {
  fiberCached: true,
  defaultValue: () => "Info"
});

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/internal/stackTraceLimit.js
var isStackTraceLimitWritable = () => {
  const desc = Object.getOwnPropertyDescriptor(Error, "stackTraceLimit");
  if (desc === undefined) {
    return Object.isExtensible(Error);
  }
  return Object.hasOwn(desc, "writable") ? desc.writable === true : desc.set !== undefined;
};
var canWriteStackTraceLimit = /* @__PURE__ */ isStackTraceLimitWritable();
var getStackTraceLimit = () => Error.stackTraceLimit;
var setStackTraceLimit = (value) => {
  if (canWriteStackTraceLimit) {
    Error.stackTraceLimit = value;
  }
};

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/internal/effect.js
class Interrupt extends ReasonBase {
  fiberId;
  constructor(fiberId, annotations = constEmptyAnnotations) {
    super("Interrupt", annotations, "Interrupted");
    this.fiberId = fiberId;
  }
  toString() {
    return `Interrupt(${this.fiberId})`;
  }
  toJSON() {
    return {
      _tag: "Interrupt",
      fiberId: this.fiberId
    };
  }
  [symbol2](that) {
    return isInterruptReason(that) && this.fiberId === that.fiberId && this.annotations === that.annotations;
  }
  [symbol]() {
    return combine(string(`${this._tag}:${this.fiberId}`))(random(this.annotations));
  }
}
var causeInterrupt = (fiberId) => new CauseImpl([new Interrupt(fiberId)]);
var findError = (self) => {
  for (let i = 0;i < self.reasons.length; i++) {
    const reason = self.reasons[i];
    if (reason._tag === "Fail") {
      return succeed2(reason.error);
    }
  }
  return fail2(self);
};
var hasInterrupts = (self) => self.reasons.some(isInterruptReason);
var causeCombine = /* @__PURE__ */ dual(2, (self, that) => {
  if (self.reasons.length === 0) {
    return that;
  } else if (that.reasons.length === 0) {
    return self;
  }
  const newCause = new CauseImpl(union(self.reasons, that.reasons));
  return equals(self, newCause) ? self : newCause;
});
var causeMap = /* @__PURE__ */ dual(2, (self, f) => {
  let hasFail = false;
  const failures = self.reasons.map((failure) => {
    if (isFailReason(failure)) {
      hasFail = true;
      return new Fail(f(failure.error), failure.annotations);
    }
    return failure;
  });
  return hasFail ? causeFromReasons(failures) : self;
});
var FiberTypeId = "~effect/Fiber";
var fiberVariance = {
  _A: identity,
  _E: identity
};
var fiberIdStore = {
  id: 0
};
var getCurrentFiber = () => globalThis[currentFiberTypeId];

class FiberImpl {
  constructor(context, interruptible = true) {
    this[FiberTypeId] = fiberVariance;
    this.setContext(context);
    this.id = ++fiberIdStore.id;
    this.currentOpCount = 0;
    this.interruptible = interruptible;
    this._stack = [];
    this._observers = [];
    this._exit = undefined;
    this._children = undefined;
    this._interruptedCause = undefined;
    this._yielded = undefined;
    this._running = false;
    this._deferredInterrupt = false;
    this.runtimeMetrics?.recordFiberStart(this.context);
  }
  [FiberTypeId];
  id;
  interruptible;
  currentOpCount;
  _stack;
  _observers;
  _exit;
  _children;
  _interruptedCause;
  _yielded;
  _running;
  _deferredInterrupt;
  context;
  currentScheduler;
  currentTracerContext;
  currentSpan;
  currentLogLevel;
  minimumLogLevel;
  currentStackFrame;
  runtimeMetrics;
  maxOpsBeforeYield;
  currentPreventYield;
  _dispatcher = undefined;
  get currentDispatcher() {
    return this._dispatcher ??= this.currentScheduler.makeDispatcher();
  }
  getRef(ref) {
    return get(this.context, ref);
  }
  addObserver(cb) {
    if (this._exit) {
      cb(this._exit);
      return constVoid;
    }
    this._observers.push(cb);
    return () => {
      if (this._exit)
        return;
      const index = this._observers.indexOf(cb);
      if (index >= 0) {
        this._observers.splice(index, 1);
      }
    };
  }
  interruptUnsafe(fiberId, annotations) {
    if (this._exit) {
      return;
    }
    let cause = causeInterrupt(fiberId);
    if (this.currentStackFrame) {
      cause = causeAnnotate(cause, make2(StackTraceKey, this.currentStackFrame));
    }
    if (annotations) {
      cause = causeAnnotate(cause, annotations);
    }
    this._interruptedCause = this._interruptedCause ? causeCombine(this._interruptedCause, cause) : cause;
    if (this.interruptible) {
      if (this._running) {
        this._deferredInterrupt = true;
      } else {
        this.evaluate(failCause(this._interruptedCause));
      }
    }
  }
  pollUnsafe() {
    return this._exit;
  }
  evaluate(effect) {
    if (this._exit) {
      return;
    } else if (this._yielded !== undefined) {
      const yielded = this._yielded;
      this._yielded = undefined;
      yielded();
    }
    const exit = this.runLoop(effect);
    if (exit === Yield) {
      return;
    }
    const interruptChildren = fiberMiddleware.interruptChildren && fiberMiddleware.interruptChildren(this);
    if (interruptChildren !== undefined) {
      return this.evaluate(flatMap(interruptChildren, () => exit));
    }
    this._exit = exit;
    this.runtimeMetrics?.recordFiberEnd(this.context, this._exit);
    for (let i = 0;i < this._observers.length; i++) {
      this._observers[i](exit);
    }
    this._observers.length = 0;
    this._stack.length = 0;
    this._children = undefined;
    this.context = empty();
  }
  runLoop(effect) {
    const prevFiber = globalThis[currentFiberTypeId];
    globalThis[currentFiberTypeId] = this;
    const prevRunning = this._running;
    this._running = true;
    let yielding = false;
    let current = effect;
    this.currentOpCount = 0;
    try {
      while (true) {
        if (this._deferredInterrupt) {
          this._deferredInterrupt = false;
          current = failCause(this._interruptedCause);
        }
        this.currentOpCount++;
        if (!yielding && !this.currentPreventYield && this.currentScheduler.shouldYield(this)) {
          yielding = true;
          const prev = current;
          current = flatMap(yieldNow, () => prev);
        }
        current = this.currentTracerContext ? this.currentTracerContext(current, this) : current[evaluate](this);
        if (current === Yield) {
          const yielded = this._yielded;
          if (ExitTypeId in yielded) {
            this._deferredInterrupt = false;
            this._yielded = undefined;
            return yielded;
          } else if (this._deferredInterrupt) {
            this._yielded = undefined;
            yielded();
            continue;
          }
          return Yield;
        }
      }
    } catch (error) {
      if (!hasProperty(current, evaluate)) {
        return exitDie(`Fiber.runLoop: Not a valid effect: ${String(current)}`);
      }
      return this.runLoop(exitDie(error));
    } finally {
      this._running = prevRunning;
      globalThis[currentFiberTypeId] = prevFiber;
    }
  }
  getCont(symbol) {
    if (this._deferredInterrupt) {
      this._deferredInterrupt = false;
      return deferredInterruptCont;
    }
    while (true) {
      const op = this._stack.pop();
      if (!op)
        return;
      const cont = op[contAll] && op[contAll](this);
      if (cont) {
        cont[symbol] = cont;
        return cont;
      }
      if (op[symbol])
        return op;
    }
  }
  yieldWith(value) {
    this._yielded = value;
    return Yield;
  }
  children() {
    return this._children ??= new Set;
  }
  pipe() {
    return pipeArguments(this, arguments);
  }
  setContext(context) {
    const previous = this.context;
    this.context = context;
    if (previous !== undefined && hasSameCache(previous, context))
      return;
    const scheduler = this.getRef(Scheduler);
    if (scheduler !== this.currentScheduler) {
      this.currentScheduler = scheduler;
      this._dispatcher = undefined;
    }
    this.currentSpan = getOrUndefinedUnsafe(context, ParentSpanKey);
    this.currentLogLevel = this.getRef(CurrentLogLevel);
    this.minimumLogLevel = this.getRef(MinimumLogLevel);
    this.currentStackFrame = this.getRef(CurrentStackFrame);
    this.maxOpsBeforeYield = this.getRef(MaxOpsBeforeYield);
    this.currentPreventYield = this.getRef(PreventSchedulerYield);
    this.runtimeMetrics = getOrUndefinedUnsafe(context, FiberRuntimeMetricsKey);
    const currentTracer = getOrUndefinedUnsafe(context, TracerKey);
    this.currentTracerContext = currentTracer ? currentTracer["context"] : undefined;
  }
  get currentSpanLocal() {
    return this.currentSpan?._tag === "Span" ? this.currentSpan : undefined;
  }
}
var deferredInterruptCont = {
  [contA](_value, fiber) {
    return failCause(fiber._interruptedCause);
  },
  [contE](_cause, fiber) {
    return failCause(fiber._interruptedCause);
  }
};
var fiberMiddleware = {
  interruptChildren: undefined
};
var fiberStackAnnotations = (fiber) => {
  if (!fiber.currentStackFrame)
    return;
  const annotations = new Map;
  annotations.set(InterruptorStackTrace.key, fiber.currentStackFrame);
  return makeUnsafe(annotations);
};
var fiberAwaitAll = (self) => callback((resume) => {
  const iter = self[Symbol.iterator]();
  const exits = [];
  let cancel = undefined;
  function loop() {
    let result = iter.next();
    while (!result.done) {
      if (result.value._exit) {
        exits.push(result.value._exit);
        result = iter.next();
        continue;
      }
      cancel = result.value.addObserver((exit) => {
        exits.push(exit);
        loop();
      });
      return;
    }
    resume(succeed3(exits));
  }
  loop();
  return sync(() => cancel?.());
});
var fiberInterruptAll = (fibers) => withFiber((parent) => {
  const annotations = fiberStackAnnotations(parent);
  let fiberArr = empty2();
  for (const fiber of fibers) {
    fiber.interruptUnsafe(parent.id, annotations);
    fiberArr.push(fiber);
  }
  return asVoid(fiberAwaitAll(fiberArr));
});
var succeed3 = exitSucceed;
var failCause = exitFailCause;
var fail3 = exitFail;
var sync = /* @__PURE__ */ makePrimitive({
  op: "Sync",
  [evaluate](fiber) {
    const value = this[args]();
    const cont = fiber.getCont(contA);
    return cont ? cont[contA](value, fiber) : fiber.yieldWith(exitSucceed(value));
  }
});
var suspend = /* @__PURE__ */ makePrimitive({
  op: "Suspend",
  [evaluate](_fiber) {
    return this[args]();
  }
});
var fromResult = /* @__PURE__ */ match({
  onFailure: fail3,
  onSuccess: succeed3
});
var yieldNowWith = /* @__PURE__ */ makePrimitive({
  op: "Yield",
  [evaluate](fiber) {
    let resumed = false;
    fiber.currentDispatcher.scheduleTask(() => {
      if (resumed)
        return;
      fiber.evaluate(exitVoid);
    }, this[args] ?? 0);
    return fiber.yieldWith(() => {
      resumed = true;
    });
  }
});
var yieldNow = /* @__PURE__ */ yieldNowWith(0);
var succeedNone = /* @__PURE__ */ succeed3(/* @__PURE__ */ none2());
var failCauseSync = (evaluate) => suspend(() => failCause(internalCall(evaluate)));
var die = (defect) => exitDie(defect);
var failSync = (error) => suspend(() => fail3(internalCall(error)));
var void_ = /* @__PURE__ */ succeed3(undefined);
var try_ = (options) => {
  const evaluate = typeof options === "function" ? options : options.try;
  const catcher = typeof options === "function" ? (cause) => new UnknownError(cause, "An error occurred in Effect.try") : options.catch;
  return suspend(() => {
    try {
      return succeed3(internalCall(evaluate));
    } catch (err) {
      return fail3(internalCall(() => catcher(err)));
    }
  });
};
var tryPromise = (options) => {
  const f = typeof options === "function" ? options : options.try;
  const catcher = typeof options === "function" ? (cause) => new UnknownError(cause, "An error occurred in Effect.tryPromise") : options.catch;
  return callbackOptions(function(resume, signal) {
    const failWithCatch = (cause) => {
      try {
        resume(fail3(internalCall(() => catcher(cause))));
      } catch (err) {
        resume(die(err));
      }
    };
    try {
      internalCall(() => f(signal)).then((a) => resume(succeed3(a)), failWithCatch);
    } catch (err) {
      failWithCatch(err);
    }
  }, f.length !== 0);
};
var callbackOptions = /* @__PURE__ */ makePrimitive({
  op: "Async",
  single: false,
  [evaluate](fiber) {
    const register = internalCall(() => this[args][0].bind(fiber.currentScheduler));
    let resumed = false;
    let yielded = false;
    const controller = this[args][1] ? new AbortController : undefined;
    const onCancel = register((effect) => {
      if (resumed)
        return;
      resumed = true;
      if (yielded) {
        fiber.evaluate(effect);
      } else {
        yielded = effect;
      }
    }, controller?.signal);
    if (yielded !== false)
      return yielded;
    yielded = true;
    fiber._yielded = () => {
      resumed = true;
    };
    if (controller === undefined && onCancel === undefined) {
      return Yield;
    }
    fiber._stack.push(asyncFinalizer(() => {
      resumed = true;
      controller?.abort();
      return onCancel ?? exitVoid;
    }));
    return Yield;
  }
});
var asyncFinalizer = /* @__PURE__ */ makePrimitive({
  op: "AsyncFinalizer",
  [contAll](fiber) {
    if (fiber.interruptible) {
      fiber.interruptible = false;
      fiber._stack.push(setInterruptibleTrue);
    }
  },
  [contE](cause, _fiber) {
    return hasInterrupts(cause) ? flatMap(this[args](), () => failCause(cause)) : failCause(cause);
  }
});
var callback = (register) => callbackOptions(register, register.length >= 2);
var defineFunctionLength = (length, fn) => Object.defineProperty(fn, "length", {
  value: length,
  configurable: true
});
var fnUntracedEager = (body, ...pipeables) => defineFunctionLength(body.length, pipeables.length === 0 ? function() {
  return fromIteratorEagerUnsafe(() => body.apply(this, arguments));
} : function() {
  let effect = fromIteratorEagerUnsafe(() => body.apply(this, arguments));
  for (const pipeable of pipeables) {
    effect = pipeable(effect);
  }
  return effect;
});
var fromIteratorEagerUnsafe = (evaluate) => {
  try {
    const iterator = evaluate();
    let value = undefined;
    while (true) {
      const state = iterator.next(value);
      if (state.done) {
        return succeed3(state.value);
      }
      const primitive = state.value;
      if (primitive && primitive._tag === "Success") {
        value = primitive.value;
        continue;
      } else if (primitive && primitive._tag === "Failure") {
        return state.value;
      } else {
        let isFirstExecution = true;
        return suspend(() => {
          if (isFirstExecution) {
            isFirstExecution = false;
            return flatMap(state.value, (value) => fromIteratorUnsafe(iterator, value));
          } else {
            return suspend(() => fromIteratorUnsafe(evaluate()));
          }
        });
      }
    }
  } catch (error) {
    return die(error);
  }
};
var fromIteratorUnsafe = /* @__PURE__ */ makePrimitive({
  op: "Iterator",
  single: false,
  [contA](value, fiber) {
    const iter = this[args][0];
    while (true) {
      const state = iter.next(value);
      if (state.done)
        return succeed3(state.value);
      if (!effectIsExit(state.value)) {
        fiber._stack.push(this);
        return state.value;
      } else if (state.value._tag === "Failure") {
        return state.value;
      }
      value = state.value.value;
    }
  },
  [evaluate](fiber) {
    return this[contA](this[args][1], fiber);
  }
});
var asVoid = (self) => flatMap(self, (_) => exitVoid);
var flatMap = /* @__PURE__ */ dual(2, (self, f) => {
  const onSuccess = Object.create(OnSuccessProto);
  onSuccess[args] = self;
  onSuccess[contA] = f.length !== 1 ? (a) => f(a) : f;
  return onSuccess;
});
var OnSuccessProto = /* @__PURE__ */ makePrimitiveProto({
  op: "OnSuccess",
  [evaluate](fiber) {
    fiber._stack.push(this);
    return this[args];
  }
});
var effectIsExit = (effect) => (ExitTypeId in effect);
var flatMapEager = /* @__PURE__ */ dual(2, (self, f) => {
  if (effectIsExit(self)) {
    return self._tag === "Success" ? f(self.value) : self;
  }
  return flatMap(self, f);
});
var map4 = /* @__PURE__ */ dual(2, (self, f) => flatMap(self, (a) => succeed3(internalCall(() => f(a)))));
var mapEager = /* @__PURE__ */ dual(2, (self, f) => effectIsExit(self) ? exitMap(self, f) : map4(self, f));
var mapErrorEager = /* @__PURE__ */ dual(2, (self, f) => effectIsExit(self) ? exitMapError(self, f) : mapError(self, f));
var exitIsSuccess = (self) => self._tag === "Success";
var exitVoid = /* @__PURE__ */ exitSucceed(undefined);
var exitMap = /* @__PURE__ */ dual(2, (self, f) => self._tag === "Success" ? exitSucceed(f(self.value)) : self);
var exitMapError = /* @__PURE__ */ dual(2, (self, f) => {
  if (self._tag === "Success")
    return self;
  const error = findError(self.cause);
  if (isFailure2(error))
    return self;
  return exitFail(f(error.success));
});
var catchCause = /* @__PURE__ */ dual(2, (self, f) => {
  const onFailure = Object.create(OnFailureProto);
  onFailure[args] = self;
  onFailure[contE] = f.length !== 1 ? (cause) => f(cause) : f;
  return onFailure;
});
var OnFailureProto = /* @__PURE__ */ makePrimitiveProto({
  op: "OnFailure",
  [evaluate](fiber) {
    fiber._stack.push(this);
    return this[args];
  }
});
var catchCauseFilter = /* @__PURE__ */ dual(3, (self, filter, f) => catchCause(self, (cause) => {
  const eb = filter(cause);
  return isFailure2(eb) ? failCause(eb.failure) : internalCall(() => f(eb.success, cause));
}));
var catch_ = /* @__PURE__ */ dual(2, (self, f) => catchCauseFilter(self, findError, (e) => f(e)));
var mapError = /* @__PURE__ */ dual(2, (self, f) => catch_(self, (error) => failSync(() => f(error))));
var OnSuccessAndFailureProto = /* @__PURE__ */ makePrimitiveProto({
  op: "OnSuccessAndFailure",
  [evaluate](fiber) {
    fiber._stack.push(this);
    return this[args];
  }
});
var exit = (self) => effectIsExit(self) ? exitSucceed(self) : exitPrimitive(self);
var exitPrimitive = /* @__PURE__ */ makePrimitive({
  op: "Exit",
  [evaluate](fiber) {
    fiber._stack.push(this);
    return this[args];
  },
  [contA](value, _, exit) {
    return succeed3(exit ?? exitSucceed(value));
  },
  [contE](cause, _, exit) {
    return succeed3(exit ?? exitFailCause(cause));
  }
});
var combineFinalizerCause = (exit_, finalizer) => exitIsSuccess(exit_) ? finalizer : catchCause(finalizer, (cause) => failCause(causeCombine(exit_.cause, cause)));
var onExitPrimitive = /* @__PURE__ */ makePrimitive({
  op: "OnExit",
  single: false,
  [evaluate](fiber) {
    fiber._stack.push(this);
    return this[args][0];
  },
  [contAll](fiber) {
    if (fiber.interruptible && this[args][2] !== true) {
      fiber._stack.push(setInterruptibleTrue);
      fiber.interruptible = false;
    }
  },
  [contA](value, _, exit) {
    exit ??= exitSucceed(value);
    const eff = this[args][1](exit);
    return eff ? flatMap(eff, (_) => exit) : exit;
  },
  [contE](cause, _, exit) {
    exit ??= exitFailCause(cause);
    const eff = this[args][1](exit);
    return eff ? flatMap(combineFinalizerCause(exit, eff), (_) => exit) : exit;
  }
});
var uninterruptible = (self) => withFiber((fiber) => {
  if (!fiber.interruptible)
    return self;
  fiber.interruptible = false;
  fiber._stack.push(setInterruptibleTrue);
  return self;
});
var setInterruptible = /* @__PURE__ */ makePrimitive({
  op: "SetInterruptible",
  [contAll](fiber) {
    fiber.interruptible = this[args];
    if (fiber._interruptedCause && fiber.interruptible) {
      return () => failCause(fiber._interruptedCause);
    }
  }
});
var setInterruptibleTrue = /* @__PURE__ */ setInterruptible(true);
var whileLoop = /* @__PURE__ */ makePrimitive({
  op: "While",
  [contA](value, fiber) {
    this[args].step(value);
    if (this[args].while()) {
      fiber._stack.push(this);
      return this[args].body();
    }
    return exitVoid;
  },
  [evaluate](fiber) {
    if (this[args].while()) {
      fiber._stack.push(this);
      return this[args].body();
    }
    return exitVoid;
  }
});
var iterateEagerImpl = (options) => {
  const onItem = options.onItem;
  const step = options.step;
  const runSequential = (state, items, index, end) => {
    for (;index < end; index++) {
      const item = items[index];
      const effect = onItem(state, item, index);
      if (!effectIsExit(effect)) {
        return flatMap(exit(effect), (itemExit) => step(state, item, itemExit, index) ?? runSequential(state, items, index + 1, end) ?? void_);
      }
      const terminal = step(state, item, effect, index);
      if (terminal)
        return terminal._tag === "Failure" ? terminal : undefined;
    }
  };
  return (state, items, opts) => {
    let index = 0;
    const end = opts?.end ?? items.length;
    const concurrency = opts?.concurrency ?? 1;
    if (concurrency === 1) {
      return runSequential(state, items, 0, end);
    }
    const orderedStep = opts?.orderedStep === true;
    let done = false;
    let parentFiber;
    let fibers;
    let resume;
    let interrupted = false;
    let terminal;
    let effect;
    let nextIndex = index;
    const exits = orderedStep ? new Array(end) : undefined;
    const failDefect = (error) => {
      const defect = exitDie(error);
      terminal = defect;
      done = true;
      interrupted = true;
      return fibers && fibers.size > 0 ? flatMap(uninterruptible(fiberInterruptAll(Array.from(fibers))), () => defect) : defect;
    };
    const runStep = (item, exit, currentIndex) => {
      if (!orderedStep)
        return step(state, item, exit, currentIndex);
      if (terminal)
        return terminal;
      exits[currentIndex] = exit;
      while (nextIndex < end) {
        const nextExit = exits[nextIndex];
        if (nextExit === undefined)
          return;
        exits[nextIndex] = undefined;
        const index = nextIndex++;
        const result = step(state, items[index], nextExit, index);
        if (result)
          return result;
      }
    };
    const go = () => {
      let paused = false;
      for (;!terminal && index < end; index++) {
        const item = items[index];
        const eff = effect ?? onItem(state, item, index);
        if (effectIsExit(eff)) {
          terminal = runStep(item, eff, index);
          if (terminal)
            break;
        } else if (!parentFiber) {
          return callback((cb) => {
            parentFiber = getCurrentFiber();
            fibers = new Set;
            effect = eff;
            resume = cb;
            let result;
            try {
              result = go();
            } catch (error) {
              return cb(failDefect(error));
            }
            if (result)
              return cb(result);
            return suspend(() => {
              terminal = exitVoid;
              interrupted = true;
              return fibers ? fiberInterruptAll(fibers) : void_;
            });
          });
        } else {
          effect = undefined;
          const fiber = forkUnsafe(parentFiber, eff, true, true, "inherit");
          if (fiber._exit) {
            terminal = runStep(item, fiber._exit, index);
            if (terminal)
              break;
            continue;
          }
          fibers.add(fiber);
          const currentIndex = index;
          fiber.addObserver((exit) => {
            fibers.delete(fiber);
            try {
              if (terminal) {
                if (!interrupted && exit._tag === "Failure") {
                  for (const reason of exit.cause.reasons) {
                    if (reason._tag === "Interrupt")
                      continue;
                    else if (terminal._tag === "Failure") {
                      terminal.cause.reasons.push(reason);
                    } else {
                      terminal = exitFailCause(causeFromReasons([reason]));
                    }
                  }
                }
              } else {
                const result = runStep(item, exit, currentIndex);
                if (result) {
                  terminal = result._tag === "Failure" ? exitFailCause(causeFromReasons(result.cause.reasons.slice())) : result;
                  go();
                }
              }
              if (paused) {
                const eff = go();
                if (eff)
                  resume(eff);
              } else if (done && fibers.size === 0) {
                resume(terminal ?? void_);
              }
            } catch (error) {
              resume(failDefect(error));
            }
          });
          if (fibers.size < concurrency)
            continue;
          paused = true;
          index++;
          return;
        }
      }
      done = true;
      if (terminal) {
        if (fibers && fibers.size > 0) {
          const annotations = fiberStackAnnotations(parentFiber);
          fibers.forEach((f) => f.interruptUnsafe(parentFiber.id, annotations));
          return;
        }
        if (resume || terminal._tag === "Failure") {
          return terminal;
        }
      } else if (resume) {
        if (!fibers) {
          return exitVoid;
        } else if (fibers.size === 0) {
          resume(void_);
        }
      }
    };
    return go();
  };
};
var iterateEager = () => iterateEagerImpl;
var forkUnsafe = (parent, effect, immediate = false, daemon = false, uninterruptible = false) => {
  const parentRuntime = parent;
  const interruptible = uninterruptible === "inherit" ? parentRuntime.interruptible : !uninterruptible;
  const child = new FiberImpl(parentRuntime.context, interruptible);
  if (immediate) {
    child.evaluate(effect);
  } else {
    parentRuntime.currentDispatcher.scheduleTask(() => child.evaluate(effect), 0);
  }
  if (!daemon && !child._exit) {
    parentRuntime.children().add(child);
    child.addObserver(() => parentRuntime._children.delete(child));
  }
  return child;
};
var runForkWith = (context) => (effect, options) => {
  const fiber = new FiberImpl(options?.scheduler ? add(context, Scheduler, options.scheduler) : context, options?.uninterruptible !== true);
  fiber.evaluate(effect);
  if (fiber._exit)
    return fiber;
  if (options?.signal) {
    if (options.signal.aborted) {
      fiber.interruptUnsafe();
    } else {
      const abort = () => fiber.interruptUnsafe();
      options.signal.addEventListener("abort", abort, {
        once: true
      });
      fiber.addObserver(() => options.signal.removeEventListener("abort", abort));
    }
  }
  if (options?.onFiberStart) {
    options.onFiberStart(fiber);
  }
  return fiber;
};
var runSyncExitWith = (context) => {
  const runFork = runForkWith(context);
  return (effect) => {
    if (effectIsExit(effect))
      return effect;
    const scheduler = new MixedScheduler("sync");
    const fiber = runFork(effect, {
      scheduler
    });
    fiber._dispatcher?.flush();
    return fiber._exit ?? exitDie(new AsyncFiberError(fiber));
  };
};
var runSyncExit = /* @__PURE__ */ runSyncExitWith(/* @__PURE__ */ empty());
var MAX_TIMER_MILLIS = 2 ** 31 - 1;
var AsyncFiberErrorTypeId = "~effect/Cause/AsyncFiberError";
class AsyncFiberError extends (/* @__PURE__ */ TaggedError("AsyncFiberError")) {
  [AsyncFiberErrorTypeId] = AsyncFiberErrorTypeId;
  constructor(fiber) {
    super({
      message: "An asynchronous Effect was executed with Effect.runSync",
      fiber
    });
  }
}
var UnknownErrorTypeId = "~effect/Cause/UnknownError";
class UnknownError extends (/* @__PURE__ */ TaggedError("UnknownError")) {
  [UnknownErrorTypeId] = UnknownErrorTypeId;
  constructor(cause, message) {
    super({
      message,
      cause
    });
  }
}
var LoggerTypeId = "~effect/Logger";
var LoggerProto = {
  [LoggerTypeId]: {
    _Message: identity,
    _Output: identity
  },
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var colors = {
  bold: "1",
  red: "31",
  green: "32",
  yellow: "33",
  blue: "34",
  cyan: "36",
  white: "37",
  gray: "90",
  black: "30",
  bgBrightRed: "101"
};
var logLevelColors = {
  None: [],
  All: [],
  Trace: [colors.gray],
  Debug: [colors.blue],
  Info: [colors.green],
  Warn: [colors.yellow],
  Error: [colors.red],
  Fatal: [colors.bgBrightRed, colors.black]
};

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/Exit.js
var succeed4 = exitSucceed;
var failCause2 = exitFailCause;
var fail4 = exitFail;
var void_2 = exitVoid;
var isSuccess3 = exitIsSuccess;

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/Cause.js
var isFailReason2 = isFailReason;
var map5 = causeMap;

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/Effect.js
var tryPromise2 = tryPromise;
var succeed5 = succeed3;
var succeedNone2 = succeedNone;
var fail5 = fail3;
var failCauseSync2 = failCauseSync;
var die2 = die;
var try_2 = try_;
var fromResult2 = fromResult;
var flatMap2 = flatMap;
var exit2 = exit;
var catchCause2 = catchCause;
var runSyncExit2 = runSyncExit;
var mapEager2 = mapEager;
var mapErrorEager2 = mapErrorEager;
var flatMapEager2 = flatMapEager;
var fnUntracedEager2 = fnUntracedEager;
// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/internal/schema/annotations.js
function resolve(ast) {
  return ast.checks ? ast.checks[ast.checks.length - 1].annotations : ast.annotations;
}
var STRUCTURAL_ANNOTATION_KEY = "~structural";
var SENTINELS_ANNOTATION_KEY = "~sentinels";
var CONSTRUCTOR_ANNOTATION_KEY = "~constructor";
var getExpected = /* @__PURE__ */ memoize((ast) => {
  const identifier = resolve(ast)?.identifier;
  if (typeof identifier === "string")
    return identifier;
  return ast.getExpected(getExpected);
});

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/internal/schema/parser.js
var missing = /* @__PURE__ */ Symbol();
var succeed6 = succeed4;
var missingExit = /* @__PURE__ */ succeed6(missing);
var sameExit = /* @__PURE__ */ succeed6(missing);
var toOption = (value) => value === missing ? none2() : some2(value);
var fromOptionExit = (option) => option._tag === "None" ? missingExit : succeed6(option.value);

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/SchemaIssue.js
var TypeId4 = "~effect/SchemaIssue/Issue";
function isIssue(u) {
  return hasProperty(u, TypeId4) && u[TypeId4] === TypeId4;
}
function hasInput(issue) {
  return Object.hasOwn(issue, "input");
}

class Base {
  [TypeId4] = TypeId4;
  constructor(input, options) {
    if (options?.reportInput === true && input !== missing) {
      this.input = input;
    }
  }
}

class Filter extends Base {
  _tag = "Filter";
  filter;
  issue;
  constructor(filter, issue, input, options) {
    super(input, options);
    this.filter = filter;
    this.issue = issue;
  }
}

class Encoding extends Base {
  _tag = "Encoding";
  ast;
  issue;
  constructor(ast, issue, input, options) {
    super(input, options);
    this.ast = ast;
    this.issue = issue;
  }
}

class Pointer extends Base {
  _tag = "Pointer";
  path;
  issue;
  constructor(path, issue) {
    super();
    this.path = path;
    this.issue = issue;
  }
}

class MissingKey extends Base {
  _tag = "MissingKey";
  annotations;
  constructor(annotations) {
    super();
    this.annotations = annotations;
  }
}

class UnexpectedKey extends Base {
  _tag = "UnexpectedKey";
  ast;
  constructor(ast, input, options) {
    super(input, options);
    this.ast = ast;
  }
}

class Composite extends Base {
  _tag = "Composite";
  ast;
  issues;
  constructor(ast, issues, input, options) {
    super(input, options);
    this.ast = ast;
    this.issues = issues;
  }
}

class InvalidType extends Base {
  _tag = "InvalidType";
  ast;
  constructor(ast, input, options) {
    super(input, options);
    this.ast = ast;
  }
}

class InvalidValue extends Base {
  _tag = "InvalidValue";
  annotations;
  constructor(annotations, input, options) {
    super(input, options);
    this.annotations = annotations;
  }
}
class AnyOf extends Base {
  _tag = "AnyOf";
  ast;
  issues;
  constructor(ast, issues, input, options) {
    super(input, options);
    this.ast = ast;
    this.issues = issues;
  }
}

class OneOf extends Base {
  _tag = "OneOf";
  ast;
  successes;
  constructor(ast, successes, input, options) {
    super(input, options);
    this.ast = ast;
    this.successes = successes;
  }
}
function makeFilterIssue(entry, input, options) {
  if (isIssue(entry)) {
    return entry;
  }
  if (typeof entry === "string") {
    return new InvalidValue({
      message: entry
    }, input, options);
  }
  const inner = typeof entry.issue === "string" ? new InvalidValue({
    message: entry.issue
  }, input, options) : entry.issue;
  return new Pointer(entry.path, inner);
}
function makeSingle(out, input, options) {
  if (out === undefined) {
    return;
  }
  if (typeof out === "boolean") {
    return out ? undefined : new InvalidValue(undefined, input, options);
  }
  return makeFilterIssue(out, input, options);
}
function normalizeFilterOutput(ast, out, input, options) {
  if (Array.isArray(out)) {
    if (!isReadonlyArrayNonEmpty(out)) {
      return;
    }
    return out.length === 1 ? makeFilterIssue(out[0], input, options) : new Composite(ast, map2(out, (entry) => makeFilterIssue(entry, input, options)), input, options);
  }
  return makeSingle(out, input, options);
}
var defaultLeafHook = (issue) => {
  const message = findMessage(issue);
  if (message !== undefined)
    return message;
  switch (issue._tag) {
    case "InvalidType":
      return getExpectedMessage(getExpected(issue.ast), issue);
    case "InvalidValue": {
      const expected = findExpected(issue);
      if (expected !== undefined)
        return getExpectedMessage(expected, issue);
      const input = formatInput(issue);
      return input === undefined ? "Expected a valid value" : `Invalid data ${input}`;
    }
    case "MissingKey":
      return "Missing key";
    case "UnexpectedKey": {
      const input = formatInput(issue);
      return input === undefined ? "Expected no excess property" : `Unexpected key with value ${input}`;
    }
    case "Forbidden":
      return "Forbidden operation";
    case "OneOf": {
      const input = formatInput(issue);
      return input === undefined ? "Expected exactly one member to match" : `Expected exactly one member to match the input ${input}`;
    }
  }
};
var defaultCheckHook = (issue) => findMessage(issue.issue) ?? findMessage(issue);
function formatInput(issue) {
  return hasInput(issue) ? format(issue.input) : undefined;
}
function findExpected(issue) {
  const expected = issue.annotations?.expected;
  return typeof expected === "string" ? expected : undefined;
}
function getExpectedMessage(expected, issue) {
  const input = formatInput(issue);
  return input === undefined ? `Expected ${expected}` : `Expected ${expected}, got ${input}`;
}
function formatCheck(check) {
  const expected = check.annotations?.expected;
  if (typeof expected === "string")
    return expected;
  switch (check._tag) {
    case "Filter":
      return "<filter>";
    case "FilterGroup":
      return check.checks.map((check) => formatCheck(check)).join(" & ");
  }
}
function makeFormatterDefault() {
  return (issue) => formatIssue(issue, "");
}
var defaultFormatter = /* @__PURE__ */ makeFormatterDefault();
function formatIssue(issue, path) {
  let message;
  switch (issue._tag) {
    case "Filter": {
      const annotated = defaultCheckHook(issue);
      if (annotated !== undefined) {
        message = annotated;
      } else {
        if (issue.issue._tag !== "InvalidValue") {
          return formatIssue(issue.issue, path);
        }
        const expected = findExpected(issue.issue);
        message = expected === undefined ? getExpectedMessage(formatCheck(issue.filter), issue) : getExpectedMessage(expected, issue.issue);
      }
      break;
    }
    case "Encoding":
      return formatIssue(issue.issue, path);
    case "Pointer":
      return formatIssue(issue.issue, path + formatPath(issue.path));
    case "Composite":
    case "AnyOf": {
      if (issue._tag === "Composite" || issue.issues.length > 0) {
        return issue.issues.map((issue) => formatIssue(issue, path)).join(`
`);
      }
      message = findMessage(issue) ?? getExpectedMessage(getExpected(issue.ast), issue);
      break;
    }
    default:
      message = defaultLeafHook(issue);
      break;
  }
  return path ? `${message}
  at ${path}` : message;
}
function findMessage(issue) {
  if (issue._tag === "Pointer")
    return;
  if (issue._tag === "Encoding")
    return findMessage(issue.issue);
  const annotations = issue._tag === "Filter" ? issue.filter.annotations : ("annotations" in issue) ? issue.annotations : issue.ast.annotations;
  const message = annotations?.[issue._tag === "MissingKey" ? "messageMissingKey" : issue._tag === "UnexpectedKey" ? "messageUnexpectedKey" : "message"];
  if (typeof message === "string")
    return message;
}

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/internal/schema/cause.js
function getSchemaIssue(cause) {
  let issue;
  for (const reason of cause.reasons) {
    if (!isFailReason2(reason) || !isIssue(reason.error)) {
      return;
    }
    issue ??= reason.error;
  }
  return issue;
}
function getSchemaIssueOrThrow(cause, message) {
  const issue = getSchemaIssue(cause);
  if (issue === undefined) {
    throw new Error(message, {
      cause
    });
  }
  return issue;
}

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/SchemaGetter.js
class Getter extends Class {
  run;
  constructor(run) {
    super();
    this.run = run;
  }
  map(f) {
    return new Getter((oe, options) => this.run(oe, options).pipe(mapEager2(map(f))));
  }
  compose(other) {
    if (isPassthrough(this)) {
      return other;
    }
    if (isPassthrough(other)) {
      return this;
    }
    return new Getter((oe, options) => this.run(oe, options).pipe(flatMapEager2((ot) => other.run(ot, options))));
  }
}
var passthrough_ = /* @__PURE__ */ new Getter(succeed5);
function isPassthrough(getter) {
  return getter.run === passthrough_.run;
}
function passthrough() {
  return passthrough_;
}
function onSome(f) {
  return new Getter((oe, options) => isNone2(oe) ? succeedNone2 : f(oe.value, options));
}
function transform(f) {
  return transformOptional(map(f));
}
function transformOrFail(f) {
  return onSome((e, options) => f(e, options).pipe(mapEager2(some2)));
}
function transformOptional(f) {
  return new Getter((oe) => succeed5(f(oe)));
}
function omit() {
  return new Getter(() => succeedNone2);
}
function withDefault(defaultValue) {
  return new Getter((o) => {
    const filtered = filter(o, isNotUndefined);
    return isSome2(filtered) ? succeed5(filtered) : mapEager2(defaultValue, some2);
  });
}
function String2() {
  return transform(globalThis.String);
}
function Number3() {
  return transform(globalThis.Number);
}
function encodeBase642() {
  return transform(encodeBase64);
}
function decodeBase642() {
  return transformOrFail((input, options) => mapErrorEager2(fromResult2(decodeBase64(input)), () => new InvalidValue({
    expected: "a valid Base64 string"
  }, input, options)));
}

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/SchemaTransformation.js
var TypeId5 = "~effect/SchemaTransformation/Transformation";

class Transformation {
  [TypeId5] = TypeId5;
  _tag = "Transformation";
  decode;
  encode;
  constructor(decode, encode) {
    this.decode = decode;
    this.encode = encode;
  }
  flip() {
    return new Transformation(this.encode, this.decode);
  }
  compose(other) {
    return new Transformation(this.decode.compose(other.decode), other.encode.compose(this.encode));
  }
}
function isTransformation(u) {
  return hasProperty(u, TypeId5) && u[TypeId5] === TypeId5;
}
var make3 = (options) => {
  if (isTransformation(options)) {
    return options;
  }
  return new Transformation(options.decode, options.encode);
};
function transformOrFail2(options) {
  return new Transformation(transformOrFail(options.decode), transformOrFail(options.encode));
}
function transform2(options) {
  return new Transformation(transform(options.decode), transform(options.encode));
}
var passthrough_2 = /* @__PURE__ */ new Transformation(/* @__PURE__ */ passthrough(), /* @__PURE__ */ passthrough());
function passthrough2() {
  return passthrough_2;
}
var numberFromString = /* @__PURE__ */ new Transformation(/* @__PURE__ */ Number3(), /* @__PURE__ */ String2());
var urlFromString = /* @__PURE__ */ transformOrFail2({
  decode: (s, options) => URL.canParse(s) ? succeed5(new URL(s)) : fail5(new InvalidValue({
    expected: "a valid URL string"
  }, s, options)),
  encode: (url) => succeed5(url.href)
});
var uint8ArrayFromBase64String = /* @__PURE__ */ new Transformation(/* @__PURE__ */ decodeBase642(), /* @__PURE__ */ encodeBase642());

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/SchemaAST.js
function makeGuard(tag) {
  return (ast) => ast._tag === tag;
}
var isDeclaration = /* @__PURE__ */ makeGuard("Declaration");
var isNever2 = /* @__PURE__ */ makeGuard("Never");
var isLiteral = /* @__PURE__ */ makeGuard("Literal");
var isUniqueSymbol = /* @__PURE__ */ makeGuard("UniqueSymbol");
var isArrays = /* @__PURE__ */ makeGuard("Arrays");
var isObjects = /* @__PURE__ */ makeGuard("Objects");
var isSuspend = /* @__PURE__ */ makeGuard("Suspend");

class Link {
  to;
  transformation;
  constructor(to, transformation) {
    this.to = to;
    this.transformation = transformation;
  }
}
var defaultParseOptions = {};

class Context {
  isOptional;
  isMutable;
  constructorDefault;
  annotations;
  constructor(isOptional, isMutable, constructorDefault = undefined, annotations = undefined) {
    this.isOptional = isOptional;
    this.isMutable = isMutable;
    this.constructorDefault = constructorDefault;
    this.annotations = annotations;
  }
}
var TypeId6 = "~effect/Schema";

class Base2 {
  [TypeId6] = TypeId6;
  annotations;
  checks;
  encoding;
  context;
  constructor(annotations = undefined, checks = undefined, encoding = undefined, context = undefined) {
    this.annotations = annotations;
    this.checks = checks;
    this.encoding = encoding;
    this.context = context;
  }
  toString() {
    return `<${this._tag}>`;
  }
}

class Declaration extends Base2 {
  _tag = "Declaration";
  typeParameters;
  run;
  encodingChecks;
  encodingRun;
  constructor(typeParameters, run, annotations, checks, encoding, context, encodingChecks, encodingRun) {
    super(annotations, checks, encoding, context);
    this.typeParameters = typeParameters;
    this.run = run;
    this.encodingChecks = encodingChecks;
    this.encodingRun = encodingRun;
  }
  getParser() {
    let run;
    return (input, options) => {
      if (input === missing)
        return missingExit;
      return (run ??= this.run(this.typeParameters))(input, this, options);
    };
  }
  _rebuild(recur, checks, encodingChecks, run, encodingRun) {
    const tps = mapOrSame(this.typeParameters, recur);
    return tps === this.typeParameters && checks === this.checks && encodingChecks === this.encodingChecks && run === this.run && encodingRun === this.encodingRun ? this : new Declaration(tps, run, this.annotations, checks, undefined, this.context, encodingChecks, encodingRun);
  }
  recur(recur) {
    return this._rebuild(recur, this.checks, this.encodingChecks, this.run, this.encodingRun);
  }
  flip(recur) {
    return this._rebuild(recur, this.encodingChecks, this.checks, this.encodingRun ?? this.run, this.run);
  }
  getExpected() {
    const expected = this.annotations?.expected;
    if (typeof expected === "string")
      return expected;
    return "<Declaration>";
  }
}

class Null extends Base2 {
  _tag = "Null";
  getParser() {
    return fromConst(this, null);
  }
  getExpected() {
    return "null";
  }
}
var null_ = /* @__PURE__ */ new Null;
class Undefined extends Base2 {
  _tag = "Undefined";
  getParser() {
    return fromConst(this, undefined);
  }
  toCodecJson() {
    return replaceEncoding(this, [undefinedToNull]);
  }
  getExpected() {
    return "undefined";
  }
}
var undefinedToNull = /* @__PURE__ */ new Link(null_, /* @__PURE__ */ new Transformation(/* @__PURE__ */ transform(() => {
  return;
}), /* @__PURE__ */ transform(() => null)));
var undefined_2 = /* @__PURE__ */ new Undefined;
class Unknown extends Base2 {
  _tag = "Unknown";
  getParser() {
    return fromRefinement(this, isUnknown);
  }
  getExpected() {
    return "unknown";
  }
}
var unknown = /* @__PURE__ */ new Unknown;
class Literal extends Base2 {
  _tag = "Literal";
  literal;
  constructor(literal, annotations, checks, encoding, context) {
    super(annotations, checks, encoding, context);
    if (typeof literal === "number" && !globalThis.Number.isFinite(literal)) {
      throw new Error(`A numeric literal must be finite, got ${format(literal)}`);
    }
    this.literal = literal;
  }
  getParser() {
    return fromConst(this, this.literal);
  }
  matchPart(s, _options) {
    return s === globalThis.String(this.literal) ? this.literal : undefined;
  }
  toCodecJson() {
    return typeof this.literal === "bigint" ? literalToString(this) : this;
  }
  toCodecStringTree() {
    return typeof this.literal === "string" ? this : literalToString(this);
  }
  getExpected() {
    return typeof this.literal === "string" ? JSON.stringify(this.literal) : globalThis.String(this.literal);
  }
}
function literalToString(ast) {
  const literalAsString = globalThis.String(ast.literal);
  return replaceEncoding(ast, [new Link(new Literal(literalAsString), new Transformation(transform(() => ast.literal), transform(() => literalAsString)))]);
}

class String3 extends Base2 {
  _tag = "String";
  getParser() {
    return fromRefinement(this, isString);
  }
  matchPart(s, options) {
    const checks = this.checks;
    return checks && !options.disableChecks && collectIssues(checks, s, undefined, this, options) ? undefined : s;
  }
  getExpected() {
    return "string";
  }
}
var string2 = /* @__PURE__ */ new String3;

class Number4 extends Base2 {
  _tag = "Number";
  getParser() {
    return fromRefinement(this, isNumber);
  }
  matchKey(s, options) {
    return this._match(isStringNumberRegExp, s, options);
  }
  matchPart(s, options) {
    return this._match(isStringFiniteRegExp, s, options);
  }
  _match(regexp, s, options) {
    if (!regexp.test(s))
      return;
    const value = globalThis.Number(s);
    if (options.disableChecks || !this.checks)
      return value;
    return collectIssues(this.checks, value, undefined, this, options) ? undefined : value;
  }
  toCodecJson() {
    if (this.checks && (hasCheck(this.checks, "effect/schema/isFinite") || hasCheck(this.checks, "effect/schema/isInt"))) {
      return this;
    }
    return replaceEncoding(this, [numberToJson]);
  }
  toCodecStringTree() {
    if (this.toCodecJson() === this) {
      return replaceEncoding(this, [finiteToString]);
    }
    return replaceEncoding(this, [numberToString]);
  }
  getExpected() {
    return "number";
  }
}
function hasCheck(checks, id) {
  return checks.some((check) => check.annotations?.representation?.id === id || check._tag === "FilterGroup" && hasCheck(check.checks, id));
}
var number2 = /* @__PURE__ */ new Number4;

class Boolean2 extends Base2 {
  _tag = "Boolean";
  getParser() {
    return fromRefinement(this, isBoolean);
  }
  getExpected() {
    return "boolean";
  }
}
var boolean = /* @__PURE__ */ new Boolean2;
class Arrays extends Base2 {
  _tag = "Arrays";
  isMutable;
  elements;
  rest;
  encodingChecks;
  constructor(isMutable, elements, rest, annotations, checks, encoding, context, encodingChecks) {
    super(annotations, checks, encoding, context);
    this.isMutable = isMutable;
    this.elements = elements;
    this.rest = rest;
    this.encodingChecks = encodingChecks;
    let hasOptional = false;
    for (let i = 0;i < elements.length; i++) {
      if (isOptional(elements[i])) {
        hasOptional = true;
      } else if (hasOptional) {
        throw new Error("A required element cannot follow an optional element. ts(1257)");
      }
    }
    if (hasOptional && rest.length > 1) {
      throw new Error("A required element cannot follow an optional element. ts(1257)");
    }
    for (let i = 1;i < rest.length; i++) {
      if (isOptional(rest[i])) {
        throw new Error("An optional element cannot follow a rest element. ts(1266)");
      }
    }
  }
  getParser(compile, compileConstructorDefault = compile) {
    const ast = this;
    let elements;
    let rest;
    const elementLen = ast.elements.length;
    const tailLen = Math.max(0, ast.rest.length - 1);
    function getParser(tailThreshold, index) {
      if (index < elementLen) {
        return elements[index];
      } else if (index >= tailThreshold) {
        return rest[index - tailThreshold + 1];
      }
      return rest[0];
    }
    return fnUntracedEager2(function* (input, options) {
      if (input === missing) {
        return missing;
      }
      if (!Array.isArray(input)) {
        return yield* fail5(new InvalidType(ast, input, options));
      }
      if (!elements) {
        elements = ast.elements.map((ast) => ({
          ast,
          parser: compileConstructorDefault(ast)
        }));
        rest = ast.rest.map((ast) => ({
          ast,
          parser: compileConstructorDefault(ast)
        }));
      }
      const len = input.length;
      const state = {
        ast,
        getParser,
        input,
        len,
        tailThreshold: Math.max(elementLen, len - tailLen),
        output: new globalThis.Array(len),
        issues: undefined,
        options
      };
      const concurrency = resolveConcurrency(options?.concurrency);
      const eff = parseArray(state, input, {
        concurrency: concurrency?.concurrency,
        end: ast.rest.length === 0 ? elementLen : Math.max(len, elementLen + tailLen)
      });
      if (eff)
        yield* eff;
      if (ast.rest.length === 0 && len > elementLen) {
        for (let i = elementLen;i <= len - 1; i++) {
          const unexpected = new UnexpectedKey(ast, input[i], options);
          const issue = new Pointer([i], unexpected);
          if (options.errors === "all") {
            if (state.issues)
              state.issues.push(issue);
            else
              state.issues = [issue];
          } else {
            return yield* fail5(new Composite(ast, [issue], input, options));
          }
        }
      }
      if (state.issues) {
        return yield* fail5(new Composite(ast, state.issues, input, options));
      }
      return state.output;
    });
  }
  _rebuild(recur, checks, encodingChecks) {
    const elements = mapOrSame(this.elements, recur);
    const rest = mapOrSame(this.rest, recur);
    return elements === this.elements && rest === this.rest && checks === this.checks && encodingChecks === this.encodingChecks ? this : new Arrays(this.isMutable, elements, rest, this.annotations, checks, undefined, this.context, encodingChecks);
  }
  recur(recur) {
    return this._rebuild(recur, this.checks, this.encodingChecks);
  }
  flip(recur) {
    return this._rebuild(recur, this.encodingChecks, this.checks);
  }
  getExpected() {
    return "array";
  }
}
var parseArray = /* @__PURE__ */ iterateEager()({
  onItem(s, item, i) {
    const value = i < s.len ? item : missing;
    return s.getParser(s.tailThreshold, i).parser(value, s.options);
  },
  step(s, item, exit, i) {
    if (exit._tag === "Failure") {
      return wrapPropertyKeyIssue(s, s.ast, i, exit);
    }
    const value = exit === sameExit ? item : exit[args];
    if (value !== missing) {
      s.output[i] = value;
    } else {
      const p = s.getParser(s.tailThreshold, i);
      if (isOptional(p.ast))
        return;
      const issue = new Pointer([i], new MissingKey(p.ast.context?.annotations));
      if (s.options.errors === "all") {
        if (s.issues)
          s.issues.push(issue);
        else
          s.issues = [issue];
      } else {
        return fail4(new Composite(s.ast, [issue], s.input, s.options));
      }
    }
  }
});
var resolveConcurrency = (value) => {
  value = value === "unbounded" ? Infinity : value ?? 1;
  return value > 1 ? {
    concurrency: value
  } : undefined;
};
var wrapPropertyKeyIssue = (s, ast, key, exit) => {
  if (exit.cause.reasons.length === 0) {
    return exit;
  }
  const issue = getSchemaIssue(exit.cause);
  if (issue === undefined) {
    return failCause2(map5(exit.cause, (issue) => new Composite(ast, [new Pointer([key], issue)], s.input, s.options)));
  }
  const pointer = new Pointer([key], issue);
  if (s.options.errors === "all") {
    if (s.issues)
      s.issues.push(pointer);
    else
      s.issues = [pointer];
  } else {
    return fail4(new Composite(ast, [pointer], s.input, s.options));
  }
};
var FINITE_PATTERN = "[+-]?\\d*\\.?\\d+(?:[Ee][+-]?\\d+)?";
function getIndexSignatureKeys(input, parameter, options = defaultParseOptions) {
  let stringKeys;
  let symbolKeys;
  function go(parameter) {
    switch (parameter._tag) {
      case "String":
      case "TemplateLiteral":
        return (stringKeys ??= Object.keys(input)).filter((k) => parameter.matchPart(k, options) !== undefined);
      case "Number":
        return (stringKeys ??= Object.keys(input)).filter((k) => parameter.matchKey(k, options) !== undefined);
      case "Symbol":
        return (symbolKeys ??= Object.getOwnPropertySymbols(input)).filter((k) => parameter.matchKey(k, options) !== undefined);
      case "Union":
        return [...new Set(parameter.types.flatMap(go))];
      default:
        return [];
    }
  }
  return go(parameterFromPropertyKey(toEncoded(parameter)));
}

class PropertySignature {
  name;
  type;
  constructor(name, type) {
    this.name = name;
    this.type = type;
  }
}
function isIndexSignatureParameterSide(ast) {
  switch (ast._tag) {
    case "String":
    case "Number":
    case "Symbol":
    case "TemplateLiteral":
      return true;
    case "Union":
      return ast.types.every(isIndexSignatureParameterSide);
    default:
      return false;
  }
}
function isIndexSignatureParameter(ast) {
  return isIndexSignatureParameterSide(ast) && isIndexSignatureParameterSide(toEncoded(ast));
}

class IndexSignature {
  parameter;
  type;
  constructor(parameter, type) {
    if (!isIndexSignatureParameter(parameter)) {
      throw new Error(`Invalid index signature parameter ${parameter._tag}`);
    }
    this.parameter = parameter;
    this.type = type;
    if (isOptional(type) && !containsUndefined(type)) {
      throw new Error("Cannot use `Schema.optionalKey` with index signatures, use `Schema.optional` instead.");
    }
  }
}

class Objects extends Base2 {
  _tag = "Objects";
  propertySignatures;
  indexSignatures;
  encodingChecks;
  constructor(propertySignatures, indexSignatures, annotations, checks, encoding, context, encodingChecks) {
    super(annotations, checks, encoding, context);
    this.propertySignatures = propertySignatures;
    this.indexSignatures = indexSignatures;
    this.encodingChecks = encodingChecks;
    const duplicates = propertySignatures.map((ps) => ps.name).filter((name, i, arr) => arr.indexOf(name) !== i);
    if (duplicates.length > 0) {
      throw new Error(`Duplicate identifiers: ${JSON.stringify(duplicates)}. ts(2300)`);
    }
  }
  getParser(compile, compileConstructorDefault = compile) {
    const ast = this;
    const expectedKeys = [];
    for (const ps of ast.propertySignatures) {
      expectedKeys.push(ps.name);
    }
    const hasProperties = expectedKeys.length;
    const indexCount = ast.indexSignatures.length;
    let expectedKeysSet = hasProperties && indexCount ? new Set(expectedKeys) : undefined;
    if (!hasProperties && !indexCount) {
      return fromRefinement(ast, isNotNullish);
    }
    let properties;
    let indexes;
    const finishIndex = (s, key, k2, inputValue, exitValue) => {
      if (exitValue._tag === "Failure") {
        return wrapPropertyKeyIssue(s, ast, key, exitValue) ?? void_2;
      }
      const value = exitValue === sameExit ? inputValue : exitValue[args];
      if (k2 !== missing && value !== missing) {
        if (hasProperties && (expectedKeysSet.has(key) || expectedKeysSet.has(k2)))
          return void_2;
        assignProperty(s.out, k2, value);
      }
      return void_2;
    };
    const parseIndex = (s, key, index, exitKey) => {
      if (!exitKey) {
        const eff = index.parserKey(key, s.options);
        if (!effectIsExit(eff)) {
          return flatMap2(exit2(eff), (exit) => parseIndex(s, key, index, exit));
        }
        exitKey = eff;
      }
      if (exitKey._tag === "Failure") {
        return wrapPropertyKeyIssue(s, ast, key, exitKey) ?? void_2;
      }
      const k2 = exitKey === sameExit ? key : exitKey[args];
      const inputValue = s.input[key];
      const result = index.parserValue(inputValue, s.options);
      return effectIsExit(result) ? finishIndex(s, key, k2, inputValue, result) : flatMap2(exit2(result), (exit) => finishIndex(s, key, k2, inputValue, exit));
    };
    const parseStringIndex = (s, key, index) => {
      const inputValue = s.input[key];
      const result = index.parserValue(inputValue, s.options);
      return effectIsExit(result) ? finishIndex(s, key, key, inputValue, result) : flatMap2(exit2(result), (exit) => finishIndex(s, key, key, inputValue, exit));
    };
    const parseIndexes = indexCount ? iterateEager()({
      onItem: (s, [key, index]) => parseIndex(s, key, index),
      step: (_s, _, exit) => exit._tag === "Failure" ? exit : undefined
    }) : undefined;
    const compileMembers = () => {
      if (!properties) {
        properties = ast.propertySignatures.map((ps) => ({
          parser: compileConstructorDefault(ps.type),
          name: ps.name,
          type: ps.type
        }));
        indexes = indexCount ? ast.indexSignatures.map((is) => ({
          is,
          parserKey: compile(parameterFromPropertyKey(is.parameter)),
          parserValue: compileConstructorDefault(is.type)
        })) : undefined;
      }
      return properties;
    };
    const fallback = fnUntracedEager2(function* (input, options) {
      if (input === missing) {
        return missing;
      }
      if (!(typeof input === "object" && input !== null && !Array.isArray(input))) {
        return yield* fail5(new InvalidType(ast, input, options));
      }
      compileMembers();
      const record = input;
      const out = {};
      const state = {
        ast,
        input: record,
        out,
        issues: undefined,
        options
      };
      const errorsAllOption = options.errors === "all";
      const onExcessPropertyError = options.onExcessProperty === "error";
      const onExcessPropertyPreserve = options.onExcessProperty === "preserve";
      let inputKeys;
      if (!indexCount && (onExcessPropertyError || onExcessPropertyPreserve)) {
        expectedKeysSet ??= new Set(expectedKeys);
        inputKeys = Reflect.ownKeys(record);
        for (let i = 0;i < inputKeys.length; i++) {
          const key = inputKeys[i];
          if (!expectedKeysSet.has(key)) {
            if (onExcessPropertyError) {
              const unexpected = new UnexpectedKey(ast, record[key], options);
              const issue = new Pointer([key], unexpected);
              if (errorsAllOption) {
                if (state.issues) {
                  state.issues.push(issue);
                } else {
                  state.issues = [issue];
                }
                continue;
              } else {
                return yield* fail5(new Composite(ast, [issue], input, options));
              }
            } else {
              assignProperty(out, key, record[key]);
            }
          }
        }
      }
      const concurrency = resolveConcurrency(options?.concurrency);
      if (hasProperties) {
        const eff = parseProperties(state, properties, concurrency);
        if (eff)
          yield* eff;
      }
      if (indexCount && !concurrency) {
        for (let i = 0;i < indexCount; i++) {
          const index = indexes[i];
          const parse = index.is.parameter === string2 ? parseStringIndex : parseIndex;
          const keys = index.is.parameter === string2 ? Object.keys(record) : getIndexSignatureKeys(record, index.is.parameter, options);
          for (let j = 0;j < keys.length; j++) {
            const eff = parse(state, keys[j], index);
            if (!effectIsExit(eff))
              yield* eff;
            else if (eff._tag === "Failure")
              return yield* eff;
          }
        }
      } else if (parseIndexes) {
        const keyPairs = empty2();
        for (let i = 0;i < indexCount; i++) {
          const index = indexes[i];
          const keys = getIndexSignatureKeys(record, index.is.parameter, options);
          for (let j = 0;j < keys.length; j++) {
            keyPairs.push([keys[j], index]);
          }
        }
        const eff = parseIndexes(state, keyPairs, concurrency);
        if (eff)
          yield* eff;
      }
      if (state.issues) {
        return yield* fail5(new Composite(ast, state.issues, input, options));
      }
      if (options.propertyOrder === "original") {
        const keys = (inputKeys ?? Reflect.ownKeys(record)).concat(expectedKeys);
        const preserved = {};
        for (const key of keys) {
          if (Object.hasOwn(out, key)) {
            assignProperty(preserved, key, out[key]);
          }
        }
        return preserved;
      }
      return out;
    });
    if (indexCount)
      return fallback;
    const resume = (state, index, pending) => {
      const property = properties[index];
      return flatMap2(exit2(pending), (exit) => {
        const terminal = stepProperty(state, property, exit);
        if (terminal)
          return terminal;
        const done = () => succeed6(state.out);
        const eff = parseProperties(state, properties.slice(index + 1));
        return eff ? flatMapEager2(eff, done) : done();
      });
    };
    return (input, options) => {
      if (input === missing)
        return missingExit;
      if (options.errors === "all" || options.onExcessProperty !== undefined || options.propertyOrder === "original" || options.concurrency !== undefined) {
        return fallback(input, options);
      }
      if (!(typeof input === "object" && input !== null && !Array.isArray(input))) {
        return fail5(new InvalidType(ast, input, options));
      }
      const props = compileMembers();
      const record = input;
      const out = {};
      const state = {
        ast,
        input: record,
        out,
        issues: undefined,
        options
      };
      try {
        for (let index = 0;index < props.length; index++) {
          const property = props[index];
          const name = property.name;
          const hasKey = Object.hasOwn(record, name);
          const value = hasKey ? record[name] : missing;
          const exit = property.parser(value, options);
          if (!effectIsExit(exit)) {
            return resume(state, index, exit);
          }
          if (exit === sameExit) {
            if (hasKey)
              assignProperty(out, name, value);
            continue;
          }
          const terminal = stepProperty(state, property, exit);
          if (terminal)
            return terminal;
        }
      } catch (error) {
        return die2(error);
      }
      return succeed6(out);
    };
  }
  _rebuild(recur, recurParameter, checks, encodingChecks) {
    const props = mapOrSame(this.propertySignatures, (ps) => {
      const t = recur(ps.type);
      return t === ps.type ? ps : new PropertySignature(ps.name, t);
    });
    const indexes = mapOrSame(this.indexSignatures, (is) => {
      const p = recurParameter(is.parameter);
      const t = recur(is.type);
      return p === is.parameter && t === is.type ? is : new IndexSignature(p, t);
    });
    return props === this.propertySignatures && indexes === this.indexSignatures && checks === this.checks && encodingChecks === this.encodingChecks ? this : new Objects(props, indexes, this.annotations, checks, undefined, this.context, encodingChecks);
  }
  flip(recur) {
    return this._rebuild(recur, recur, this.encodingChecks, this.checks);
  }
  recur(recur, recurParameter = recur) {
    return this._rebuild(recur, recurParameter, this.checks, this.encodingChecks);
  }
  getExpected() {
    if (this.propertySignatures.length === 0 && this.indexSignatures.length === 0)
      return "object | array";
    return "object";
  }
}
function stepProperty(s, p, exit) {
  if (exit._tag === "Failure") {
    return wrapPropertyKeyIssue(s, s.ast, p.name, exit);
  }
  if (exit === sameExit)
    return;
  const value = exit[args];
  if (value !== missing) {
    assignProperty(s.out, p.name, value);
    return;
  }
  delete s.out[p.name];
  if (!isOptional(p.type)) {
    const issue = new Pointer([p.name], new MissingKey(p.type.context?.annotations));
    if (s.options.errors === "all") {
      if (s.issues)
        s.issues.push(issue);
      else
        s.issues = [issue];
      return;
    } else {
      return fail4(new Composite(s.ast, [issue], s.input, s.options));
    }
  }
}
var parseProperties = /* @__PURE__ */ iterateEager()({
  onItem(s, p) {
    if (!Object.hasOwn(s.input, p.name)) {
      return p.parser(missing, s.options);
    }
    const value = s.input[p.name];
    assignProperty(s.out, p.name, value);
    return p.parser(value, s.options);
  },
  step: stepProperty
});
function combineChecks(a, b) {
  if (!a)
    return b;
  if (!b)
    return a;
  return [...a, ...b];
}
function struct(fields, checks, annotations) {
  return new Objects(Reflect.ownKeys(fields).map((key) => {
    return new PropertySignature(key, fields[key].ast);
  }), [], annotations, checks);
}
function getAST(self) {
  return self.ast;
}
function tuple(elements, checks = undefined) {
  return new Arrays(false, elements.map((e) => e.ast), [], undefined, checks);
}
function union2(members, mode, checks) {
  return new Union(members.map(getAST), mode, undefined, checks);
}
var toCandidate = /* @__PURE__ */ memoizeIdempotent((ast) => {
  while (true) {
    if (isSuspend(ast))
      return unknown;
    const encoding = ast.encoding;
    if (!encoding) {
      return ast.recur?.(toCandidate, identity) ?? ast;
    }
    if (encoding.some((link) => link.transformation._tag === "Middleware" && link.transformation.decode !== identity))
      return unknown;
    ast = encoding[encoding.length - 1].to;
  }
});
function getCandidateTypes(ast) {
  switch (ast._tag) {
    case "Null":
      return ["null"];
    case "Undefined":
      return ["undefined"];
    case "String":
    case "TemplateLiteral":
      return ["string"];
    case "Number":
      return ["number"];
    case "Boolean":
      return ["boolean"];
    case "Symbol":
    case "UniqueSymbol":
      return ["symbol"];
    case "BigInt":
      return ["bigint"];
    case "Arrays":
      return ["array"];
    case "ObjectKeyword":
      return ["object", "array", "function"];
    case "Objects":
      return ast.propertySignatures.length || ast.indexSignatures.length ? ["object"] : ["string", "number", "boolean", "symbol", "bigint", "object", "array", "function"];
    case "Enum":
      return Array.from(new Set(ast.enums.map(([, v]) => typeof v)));
    case "Literal":
      return [typeof ast.literal];
    case "Union":
      return Array.from(new Set(ast.types.flatMap(getCandidateTypes)));
    default:
      return ["null", "undefined", "string", "number", "boolean", "symbol", "bigint", "object", "array", "function"];
  }
}
function collectSentinels(ast) {
  switch (ast._tag) {
    default:
      return [];
    case "Declaration": {
      const s = ast.annotations?.[SENTINELS_ANNOTATION_KEY];
      return Array.isArray(s) ? s : [];
    }
    case "Objects":
      return ast.propertySignatures.flatMap((ps) => {
        const type = ps.type;
        if (!isOptional(type)) {
          if (isLiteral(type)) {
            return [{
              key: ps.name,
              literal: type.literal
            }];
          }
          if (isUniqueSymbol(type)) {
            return [{
              key: ps.name,
              literal: type.symbol
            }];
          }
        }
        return [];
      });
    case "Arrays":
      return ast.elements.flatMap((e, i) => {
        if (!isOptional(e)) {
          if (isLiteral(e)) {
            return [{
              key: i,
              literal: e.literal
            }];
          }
          if (isUniqueSymbol(e)) {
            return [{
              key: i,
              literal: e.symbol
            }];
          }
        }
        return [];
      });
    case "Union": {
      if (ast.types.length === 0)
        return [];
      const members = ast.types.map((type) => collectSentinels(toCandidate(type)));
      return members[0].filter((s) => members.every((sentinels) => sentinels.some((o) => o.key === s.key && o.literal === s.literal)));
    }
    case "Suspend":
      return collectSentinels(ast.thunk());
  }
}
var candidateIndexCache = /* @__PURE__ */ new WeakMap;
var emptyCandidates = /* @__PURE__ */ Object.freeze([]);
function getIndex(types) {
  let index = candidateIndexCache.get(types);
  if (index)
    return index;
  let bySentinel;
  let sentinelCandidateCount = 0;
  let otherwise;
  let literalCandidates;
  let onlyLiterals = true;
  for (let i = 0;i < types.length; i++) {
    const a = types[i];
    const encoded = toCandidate(a);
    if (isNever2(encoded))
      continue;
    if (onlyLiterals) {
      if (isLiteral(encoded) || isUniqueSymbol(encoded)) {
        literalCandidates ??= new Map;
        const literal = isLiteral(encoded) ? encoded.literal : encoded.symbol;
        let arr = literalCandidates.get(literal);
        if (!arr)
          literalCandidates.set(literal, arr = []);
        arr.push(a);
      } else {
        onlyLiterals = false;
      }
    }
    const sentinels = collectSentinels(encoded);
    if (sentinels.length) {
      bySentinel ??= new Map;
      sentinelCandidateCount++;
      for (const {
        key,
        literal
      } of sentinels) {
        let entry = bySentinel.get(key);
        if (!entry)
          bySentinel.set(key, entry = [new Map, new Set]);
        entry[1].add(i);
        let indexes = entry[0].get(literal);
        if (!indexes)
          entry[0].set(literal, indexes = new Set);
        indexes.add(i);
      }
    } else {
      otherwise ??= {};
      const candidateTypes = getCandidateTypes(encoded);
      for (const t of candidateTypes)
        (otherwise[t] ??= []).push(i);
    }
  }
  if (onlyLiterals && literalCandidates) {
    literalCandidates.forEach(Object.freeze);
    index = (input) => literalCandidates.get(input) ?? emptyCandidates;
  } else if (bySentinel?.size === 1 && !otherwise) {
    const [key, [byValue]] = bySentinel.entries().next().value;
    const candidates = byValue;
    for (const [literal, indexes] of byValue) {
      candidates.set(literal, Object.freeze(Array.from(indexes, (index) => types[index])));
    }
    index = (input, isConstructor) => {
      if (isObjectKeyword(input)) {
        const value = Object.hasOwn(input, key) ? input[key] : undefined;
        if (value !== undefined)
          return candidates.get(value) ?? emptyCandidates;
        if (isConstructor)
          return types;
      }
      return emptyCandidates;
    };
  } else if (bySentinel) {
    let commonSentinel;
    for (const entry of bySentinel) {
      if ((!commonSentinel || entry[1][0].size > commonSentinel[1][0].size) && entry[1][1].size === sentinelCandidateCount) {
        commonSentinel = entry;
      }
    }
    index = (input, isConstructor) => {
      const runtimeType = input === null ? "null" : Array.isArray(input) ? "array" : typeof input;
      const base = otherwise?.[runtimeType] ?? emptyCandidates;
      if (!isObjectKeyword(input))
        return base.map((i) => types[i]);
      const selected = new Set(base);
      let directKey;
      if (commonSentinel) {
        const [key, [byValue]] = commonSentinel;
        const hasKey = Object.hasOwn(input, key);
        const value = hasKey ? input[key] : undefined;
        if (hasKey && (!isConstructor || value !== undefined)) {
          const match = byValue.get(value);
          if (!match)
            return base.map((i) => types[i]);
          for (const i of match)
            selected.add(i);
          directKey = key;
        }
      }
      if (directKey === undefined) {
        for (const [key, [byValue, all]] of bySentinel) {
          const hasKey = Object.hasOwn(input, key);
          const value = hasKey ? input[key] : undefined;
          if (hasKey && (!isConstructor || value !== undefined)) {
            const match = byValue.get(value);
            if (match) {
              for (const i of match)
                selected.add(i);
            }
          } else if (isConstructor) {
            for (const i of all)
              selected.add(i);
          }
        }
      }
      for (const [key, [byValue, all]] of bySentinel) {
        if (key === directKey)
          continue;
        const hasKey = Object.hasOwn(input, key);
        const value = hasKey ? input[key] : undefined;
        if (hasKey && (!isConstructor || value !== undefined)) {
          const match = byValue.get(value);
          for (const i of selected) {
            if (all.has(i) && !match?.has(i))
              selected.delete(i);
          }
        }
      }
      return Array.from(selected).sort((a, b) => a - b).map((i) => types[i]);
    };
  } else {
    index = (input) => {
      const runtimeType = input === null ? "null" : Array.isArray(input) ? "array" : typeof input;
      return (otherwise?.[runtimeType] ?? emptyCandidates).map((i) => types[i]).filter(filterLiterals(input));
    };
  }
  candidateIndexCache.set(types, index);
  return index;
}
function filterLiterals(input) {
  return (ast) => {
    const encoded = toCandidate(ast);
    return encoded._tag === "Literal" ? encoded.literal === input : encoded._tag === "UniqueSymbol" ? encoded.symbol === input : true;
  };
}
function getCandidates(input, types, isConstructor = false) {
  return getIndex(types)(input, isConstructor);
}

class Union extends Base2 {
  _tag = "Union";
  types;
  mode;
  encodingChecks;
  constructor(types, mode, annotations, checks, encoding, context, encodingChecks) {
    super(annotations, checks, encoding, context);
    this.types = types;
    this.mode = mode;
    this.encodingChecks = encodingChecks;
  }
  getParser(compile, compileConstructorDefault) {
    const ast = this;
    return (input, options) => {
      if (input === missing) {
        return missingExit;
      }
      const candidates = getCandidates(input, ast.types, compileConstructorDefault !== undefined);
      if (candidates.length === 1) {
        const result = compile(candidates[0])(input, options);
        if (result._tag === "Success")
          return result;
        return effectIsExit(result) ? failSingleUnionCandidate(ast, result.cause, input, options) : catchCause2(result, (cause) => failSingleUnionCandidate(ast, cause, input, options));
      }
      const state = {
        ast,
        compile,
        input,
        out: undefined,
        successes: ast.mode === "oneOf" ? [] : undefined,
        issues: undefined,
        options
      };
      const concurrency = resolveConcurrency(options?.concurrency);
      const eff = parseUnion(state, candidates, concurrency ? {
        ...concurrency,
        orderedStep: true
      } : undefined);
      if (!eff) {
        if (state.out)
          return state.out;
        return fail5(new AnyOf(ast, state.issues ?? [], input, options));
      }
      return flatMapEager2(eff, (_) => {
        if (state.out === sameExit)
          return succeed5(input);
        if (state.out)
          return state.out;
        return fail5(new AnyOf(ast, state.issues ?? [], input, options));
      });
    };
  }
  _rebuild(recur, checks, encodingChecks) {
    const types = mapOrSame(this.types, recur);
    return types === this.types && checks === this.checks && encodingChecks === this.encodingChecks ? this : new Union(types, this.mode, this.annotations, checks, undefined, this.context, encodingChecks);
  }
  recur(recur) {
    return this._rebuild(recur, this.checks, this.encodingChecks);
  }
  flip(recur) {
    return this._rebuild(recur, this.encodingChecks, this.checks);
  }
  matchPart(s, options) {
    for (const type of this.types) {
      const out = type.matchPart(s, options);
      if (out !== undefined)
        return out;
    }
    return;
  }
  getExpected(getExpected) {
    const expected = this.annotations?.expected;
    if (typeof expected === "string")
      return expected;
    if (this.types.length === 0)
      return "never";
    const types = this.types.map((type) => {
      const encoded = toEncoded(type);
      switch (encoded._tag) {
        case "Arrays": {
          const literals = encoded.elements.filter(isLiteral);
          if (literals.length > 0) {
            return `${formatIsMutable(encoded.isMutable)}[ ${literals.map((e) => getExpected(e) + formatIsOptional(e.context?.isOptional)).join(", ")}, ... ]`;
          }
          break;
        }
        case "Objects": {
          const literals = encoded.propertySignatures.filter((ps) => isLiteral(ps.type));
          if (literals.length > 0) {
            return `{ ${literals.map((ps) => `${formatIsMutable(ps.type.context?.isMutable)}${formatPropertyKey(ps.name)}${formatIsOptional(ps.type.context?.isOptional)}: ${getExpected(ps.type)}`).join(", ")}, ... }`;
          }
          break;
        }
      }
      return getExpected(encoded);
    });
    return Array.from(new Set(types)).join(" | ");
  }
}
function failSingleUnionCandidate(ast, cause, input, options) {
  const issue = getSchemaIssue(cause);
  if (!issue)
    return failCause2(cause);
  return fail4(new AnyOf(ast, [issue], input, options));
}
var parseUnion = /* @__PURE__ */ iterateEager()({
  onItem(s, ast) {
    const parser = s.compile(ast);
    return parser(s.input, s.options);
  },
  step(s, candidate, exit) {
    if (exit._tag === "Failure") {
      const issue = getSchemaIssue(exit.cause);
      if (issue === undefined) {
        return exit;
      }
      if (s.issues)
        s.issues.push(issue);
      else
        s.issues = [issue];
    } else {
      if (s.out && s.successes) {
        s.successes.push(candidate);
        return fail4(new OneOf(s.ast, s.successes, s.input, s.options));
      }
      s.out = exit;
      if (s.successes) {
        s.successes.push(candidate);
      } else {
        return void_2;
      }
    }
  }
});
var nonFiniteLiterals = /* @__PURE__ */ new Union([/* @__PURE__ */ new Literal("Infinity"), /* @__PURE__ */ new Literal("-Infinity"), /* @__PURE__ */ new Literal("NaN")], "anyOf");
function formatIsMutable(isMutable) {
  return isMutable ? "" : "readonly ";
}
function formatIsOptional(isOptional) {
  return isOptional ? "?" : "";
}
function memoizeThunk(f) {
  let done = false;
  let a;
  return () => {
    if (done) {
      return a;
    }
    a = f();
    done = true;
    return a;
  };
}

class Suspend extends Base2 {
  _tag = "Suspend";
  thunk;
  constructor(thunk, annotations, checks, encoding, context) {
    if (checks) {
      throw new Error("Cannot add checks to Suspend");
    }
    super(annotations, undefined, encoding, context);
    this.thunk = memoizeThunk(thunk);
  }
  getParser(compile) {
    let parser;
    return (input, options) => (parser ??= compile(this.thunk()))(input, options);
  }
  recur(recur) {
    return new Suspend(() => recur(this.thunk()), this.annotations, undefined, undefined, this.context);
  }
  getExpected(getExpected) {
    return getExpected(this.thunk());
  }
}

class Filter2 extends Class {
  _tag = "Filter";
  run;
  annotations;
  aborted;
  constructor(run, annotations = undefined, aborted = false) {
    super();
    this.run = run;
    this.annotations = annotations;
    this.aborted = aborted;
  }
  annotate(annotations) {
    return new Filter2(this.run, {
      ...this.annotations,
      ...annotations
    }, this.aborted);
  }
  abort() {
    return new Filter2(this.run, this.annotations, true);
  }
  and(other, annotations) {
    return new FilterGroup([this, other], annotations);
  }
}

class FilterGroup extends Class {
  _tag = "FilterGroup";
  checks;
  annotations;
  constructor(checks, annotations = undefined) {
    super();
    this.checks = checks;
    this.annotations = annotations;
  }
  annotate(annotations) {
    return new FilterGroup(this.checks, {
      ...this.annotations,
      ...annotations
    });
  }
  and(other, annotations) {
    return new FilterGroup([this, other], annotations);
  }
}
function makeFilter(filter, annotations, aborted = false) {
  return new Filter2((input, ast, options) => normalizeFilterOutput(ast, filter(input, ast, options), input, options), annotations, aborted);
}
function isFinite(annotations) {
  return makeFilter((n) => globalThis.Number.isFinite(n), {
    expected: "a finite number",
    representation: {
      id: "effect/schema/isFinite",
      payload: null
    },
    toJsonSchema: () => ({
      type: "number"
    }),
    toCode: () => ({
      runtime: "Schema.isFinite()"
    }),
    arbitrary: {
      constraint: {
        noInfinity: true,
        noNaN: true
      }
    },
    ...annotations
  });
}
var finite = /* @__PURE__ */ appendChecks(number2, [/* @__PURE__ */ isFinite()]);
var numberToJson = /* @__PURE__ */ new Link(/* @__PURE__ */ new Union([finite, nonFiniteLiterals], "anyOf"), /* @__PURE__ */ new Transformation(/* @__PURE__ */ Number3(), /* @__PURE__ */ transform((n) => globalThis.Number.isFinite(n) ? n : globalThis.String(n))));
function isPattern(regExp, annotations) {
  const source = regExp.source;
  const pattern = new globalThis.RegExp(source, regExp.flags);
  return makeFilter((s) => {
    pattern.lastIndex = 0;
    return pattern.test(s);
  }, {
    expected: `a string matching the RegExp ${source}`,
    representation: {
      id: "effect/schema/isPattern",
      payload: {
        source,
        flags: regExp.flags
      }
    },
    toJsonSchema: () => ({
      pattern: source
    }),
    arbitrary: {
      constraint: {
        patterns: [regExp.source]
      }
    },
    ...annotations
  });
}
function modifyOwnPropertyDescriptors(ast, f) {
  const d = Object.getOwnPropertyDescriptors(ast);
  f(d);
  return Object.create(Object.getPrototypeOf(ast), d);
}
var contextOwners = /* @__PURE__ */ new WeakMap;
function getContextOwner(ast) {
  return contextOwners.get(ast) ?? ast;
}
function replaceEncoding(ast, encoding) {
  if (ast.encoding === encoding) {
    return ast;
  }
  return modifyOwnPropertyDescriptors(ast, (d) => {
    d.encoding.value = encoding;
  });
}
function replaceContext(ast, context) {
  if (ast.context === context) {
    return ast;
  }
  const owner = getContextOwner(ast);
  if (owner.context === context) {
    return owner;
  }
  const out = modifyOwnPropertyDescriptors(ast, (d) => {
    d.context.value = context;
  });
  contextOwners.set(out, owner);
  return out;
}
function annotate(ast, annotations) {
  if (ast.checks) {
    const last = ast.checks[ast.checks.length - 1];
    return replaceChecks(ast, append(ast.checks.slice(0, -1), last.annotate(annotations)));
  }
  return modifyOwnPropertyDescriptors(ast, (d) => {
    d.annotations.value = {
      ...d.annotations.value,
      ...annotations
    };
  });
}
function replaceChecks(ast, checks) {
  if (ast._tag === "Suspend" && checks) {
    throw new Error("Cannot add checks to Suspend");
  }
  if (ast.checks === checks) {
    return ast;
  }
  return modifyOwnPropertyDescriptors(ast, (d) => {
    d.checks.value = checks;
  });
}
function appendChecks(ast, checks) {
  return replaceChecks(ast, combineChecks(ast.checks, checks));
}
function mapLink(link, f) {
  const to = f(link.to);
  return to === link.to ? link : new Link(to, link.transformation);
}
function updateLastLink(encoding, f) {
  const links = encoding;
  const last = links[links.length - 1];
  const out = mapLink(last, f);
  return out === last ? encoding : append(encoding.slice(0, encoding.length - 1), out);
}
function applyToLastLink(f) {
  return (ast) => ast.encoding ? replaceEncoding(ast, updateLastLink(ast.encoding, f)) : ast;
}
function applyToSelfOrLastLinkEncodingIdempotent(f, options) {
  function out(ast) {
    if (ast.encoding) {
      const last = ast.encoding[ast.encoding.length - 1];
      return options?.stopAt?.(last) ? ast : replaceEncoding(ast, updateLastLink(ast.encoding, out));
    }
    return f(ast);
  }
  return memoizeIdempotent(out);
}
function appendTransformation(from, transformation, to) {
  const link = new Link(from, transformation);
  return replaceEncoding(to, to.encoding ? [...to.encoding, link] : [link]);
}
function mapOrSame(as, f) {
  let changed = false;
  const out = new Array(as.length);
  for (let i = 0;i < as.length; i++) {
    const a = as[i];
    const fa = f(a);
    if (fa !== a) {
      changed = true;
    }
    out[i] = fa;
  }
  return changed ? out : as;
}
function annotateKey(ast, annotations) {
  const context = ast.context ? new Context(ast.context.isOptional, ast.context.isMutable, ast.context.constructorDefault, {
    ...ast.context.annotations,
    ...annotations
  }) : new Context(false, false, undefined, annotations);
  return replaceContext(ast, context);
}
var optionalKey = /* @__PURE__ */ memoizeIdempotent((ast) => {
  const context = ast.context ? ast.context.isOptional === false ? new Context(true, ast.context.isMutable, ast.context.constructorDefault, ast.context.annotations) : ast.context : new Context(true, false);
  return optionalKeyLastLink(replaceContext(ast, context));
});
var optionalKeyLastLink = /* @__PURE__ */ applyToLastLink(optionalKey);
var optional = /* @__PURE__ */ memoize((ast) => optionalKey(new Union([ast, undefined_2], "anyOf")));
function withConstructorDefault(ast, defaultValue) {
  const transformation = new Transformation(withDefault(defaultValue), passthrough());
  const constructorDefault = new Link(unknown, transformation);
  const context = ast.context ? new Context(ast.context.isOptional, ast.context.isMutable, constructorDefault, ast.context.annotations) : new Context(false, false, constructorDefault);
  return replaceContext(ast, context);
}
function decodeTo(from, to, transformation) {
  return appendTransformation(from, transformation, to);
}
function parseParameter(ast) {
  const literals = [];
  const parameters = [];
  function go(ast) {
    switch (ast._tag) {
      case "Literal":
        if (isPropertyKey(ast.literal)) {
          literals.push(ast.literal);
        }
        return;
      case "UniqueSymbol":
        literals.push(ast.symbol);
        return;
      case "Never":
        return;
      case "Union":
        for (let i = 0;i < ast.types.length; i++) {
          go(ast.types[i]);
        }
        return;
      default:
        parameters.push(ast);
    }
  }
  go(ast);
  return {
    literals,
    parameters
  };
}
function record(key, value) {
  const {
    literals,
    parameters: indexSignatures
  } = parseParameter(key);
  return new Objects(literals.map((literal) => new PropertySignature(literal, value)), indexSignatures.map((parameter) => new IndexSignature(parameter, value)));
}
function isOptional(ast) {
  return ast.context?.isOptional ?? false;
}
function isStructuralCheck(check) {
  return check.annotations?.[STRUCTURAL_ANNOTATION_KEY] === true || check._tag === "FilterGroup" && check.checks.every(isStructuralCheck);
}
function extractStructuralChecks(checks) {
  function extract(check) {
    if (isStructuralCheck(check))
      return [check];
    return check._tag === "FilterGroup" ? check.checks.flatMap(extract) : [];
  }
  const out = checks.flatMap(extract);
  return isArrayNonEmpty2(out) ? out : undefined;
}
var toType = /* @__PURE__ */ memoizeIdempotent((ast) => {
  if (ast.encoding) {
    return toType(replaceEncoding(ast, undefined));
  }
  const out = ast;
  const type = out.recur?.(toType) ?? out;
  const encodingChecks = type.encodingChecks;
  if (encodingChecks) {
    const checks = type === ast ? encodingChecks : isArrays(type) || isObjects(type) || isDeclaration(type) && type.typeParameters.length > 0 ? extractStructuralChecks(encodingChecks) : undefined;
    return modifyOwnPropertyDescriptors(type, (d) => {
      d.encodingChecks.value = undefined;
      d.checks.value = combineChecks(type.checks, checks);
    });
  }
  return type;
});
var toEncoded = /* @__PURE__ */ memoizeIdempotent((ast) => {
  return toType(flip2(ast));
});
function flipEncoding(ast, encoding) {
  const links = encoding;
  const len = links.length;
  const last = links[len - 1];
  const ls = [new Link(flip2(replaceEncoding(ast, undefined)), links[0].transformation.flip())];
  for (let i = 1;i < len; i++) {
    ls.unshift(new Link(flip2(links[i - 1].to), links[i].transformation.flip()));
  }
  const to = flip2(last.to);
  if (to.encoding) {
    return replaceEncoding(to, [...to.encoding, ...ls]);
  } else {
    return replaceEncoding(to, ls);
  }
}
var flip2 = /* @__PURE__ */ memoize((ast) => {
  if (ast.encoding) {
    return flipEncoding(ast, ast.encoding);
  }
  const out = ast;
  return out.flip?.(flip2) ?? out.recur?.(flip2) ?? out;
});
function containsUndefined(ast) {
  switch (ast._tag) {
    case "Undefined":
      return true;
    case "Union":
      return ast.types.some(containsUndefined);
    default:
      return false;
  }
}
function fromConst(ast, value) {
  const succeed = succeed6(value);
  return (input, options) => {
    if (input === missing)
      return missingExit;
    if (input === value)
      return succeed;
    return fail5(new InvalidType(ast, input, options));
  };
}
function fromRefinement(ast, refinement) {
  return (input, options) => {
    if (input === missing)
      return missingExit;
    if (refinement(input))
      return sameExit;
    return fail5(new InvalidType(ast, input, options));
  };
}
var parameterFromPropertyKey = /* @__PURE__ */ applyToSelfOrLastLinkEncodingIdempotent((ast) => {
  switch (ast._tag) {
    default:
      return ast;
    case "Number":
      return ast.toCodecStringTree();
    case "Union":
      return ast.recur(parameterFromPropertyKey);
  }
});
var isStringFiniteRegExp = /* @__PURE__ */ new globalThis.RegExp(`^${FINITE_PATTERN}$`);
var isStringNumberRegExp = /* @__PURE__ */ new globalThis.RegExp(`^(?:${FINITE_PATTERN}|Infinity|-Infinity|NaN)$`);
function isStringFinite(annotations) {
  return isPattern(isStringFiniteRegExp, {
    expected: "a string representing a finite number",
    representation: {
      id: "effect/schema/isStringFinite",
      payload: null
    },
    toJsonSchema: () => ({
      pattern: isStringFiniteRegExp.source
    }),
    ...annotations
  });
}
var finiteString = /* @__PURE__ */ appendChecks(string2, [/* @__PURE__ */ isStringFinite()]);
var finiteToString = /* @__PURE__ */ new Link(finiteString, numberFromString);
var numberToString = /* @__PURE__ */ new Link(/* @__PURE__ */ new Union([finiteString, nonFiniteLiterals], "anyOf"), numberFromString);
var BIGINT_PATTERN = "-?\\d+";
var isStringBigIntRegExp = /* @__PURE__ */ new globalThis.RegExp(`^${BIGINT_PATTERN}$`);
var REGEXP_PATTERN = "Symbol\\((.*)\\)";
var isStringSymbolRegExp = /* @__PURE__ */ new globalThis.RegExp(`^${REGEXP_PATTERN}$`);
function collectIssues(checks, value, issues, ast, options) {
  for (let i = 0;i < checks.length; i++) {
    const check = checks[i];
    if (check._tag === "FilterGroup") {
      issues = collectIssues(check.checks, value, issues, ast, options);
      if (issues && (options.errors !== "all" || issues[issues.length - 1].filter.aborted)) {
        return issues;
      }
    } else {
      const issue = check.run(value, ast, options);
      if (issue) {
        const filter = new Filter(check, issue, value, options);
        if (issues)
          issues.push(filter);
        else
          issues = [filter];
        if (options.errors !== "all" || check.aborted) {
          return issues;
        }
      }
    }
  }
  return issues;
}
function getConstructorDescriptor(ast) {
  if (!isDeclaration(ast))
    return;
  const getDescriptor = ast.annotations?.[CONSTRUCTOR_ANNOTATION_KEY];
  return isFunction(getDescriptor) ? getDescriptor(ast.typeParameters) : undefined;
}

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/SchemaParser.js
function makeEffect(schema) {
  const parser = runWithCompiler(constructorCompiler, toType(schema.ast));
  return (input, options) => {
    return parser(input, options?.disableChecks ? options?.parseOptions ? {
      ...options.parseOptions,
      disableChecks: true
    } : {
      disableChecks: true
    } : options?.parseOptions);
  };
}
function makeOption(schema) {
  const parser = makeEffect(schema);
  return (input, options) => {
    const exit = runSyncExit2(parser(input, options));
    if (isSuccess3(exit)) {
      return some2(exit.value);
    }
    getSchemaIssueOrThrow(exit.cause, "Option adapter can only return none for schema issues");
    return none2();
  };
}
function make4(schema) {
  const parser = makeEffect(schema);
  return (input, options) => {
    const exit = runSyncExit2(parser(input, options));
    if (isSuccess3(exit)) {
      return exit.value;
    }
    const issue = getSchemaIssueOrThrow(exit.cause, "Constructor adapter can only throw schema issues");
    throw new Error("Schema validation failed", {
      cause: issue
    });
  };
}
function is(schema) {
  return _is(schema.ast);
}
function _is(ast) {
  const parser = asExit(run(toType(ast)));
  return (input) => {
    const exit = parser(input, defaultParseOptions);
    if (isSuccess3(exit)) {
      return true;
    }
    getSchemaIssueOrThrow(exit.cause, "Type guard adapter can only return false for schema issues");
    return false;
  };
}
function decodeUnknownEffect(schema, options) {
  const parser = run(schema.ast);
  return options === undefined ? parser : (input, overrideOptions) => parser(input, mergeParseOptions(options, overrideOptions));
}
function encodeUnknownEffect(schema, options) {
  const parser = run(flip2(schema.ast));
  return options === undefined ? parser : (input, overrideOptions) => parser(input, mergeParseOptions(options, overrideOptions));
}
var mergeParseOptions = (options, overrideOptions) => overrideOptions ? {
  ...options,
  ...overrideOptions
} : options;
var getValue = (value) => {
  if (value === missing) {
    return fail5(new InvalidValue);
  }
  return succeed5(value);
};
function run(ast) {
  return runWithCompiler(normalCompiler, ast);
}
function runWithCompiler(compiler, ast) {
  let parser;
  return (input, options) => {
    const result = (parser ??= compiler(ast))(input, options ?? defaultParseOptions);
    if (result === sameExit) {
      return succeed5(input);
    }
    if (!effectIsExit(result)) {
      return flatMapEager2(result, getValue);
    }
    return result[args] === missing ? getValue(missing) : result;
  };
}
function asExit(parser) {
  return (input, options) => runSyncExit2(parser(input, options));
}
var normalCompiler = /* @__PURE__ */ memoize((ast) => makeParser(ast, normalCompiler));
var constructorCompiler = /* @__PURE__ */ memoize((ast) => makeParser(ast, constructorCompiler, compileConstructorDefault));
var compileDefaulted = /* @__PURE__ */ memoize((ast) => makeParser(ast, constructorCompiler, compileConstructorDefault, ast.context?.constructorDefault));
function compileConstructorDefault(ast) {
  return ast.context?.constructorDefault ? compileDefaulted(ast) : constructorCompiler(ast);
}
function applyTransformation(result, current, transformation, options) {
  let transformed;
  if (effectIsExit(result) && result._tag === "Success") {
    const optional = toOption(result === sameExit ? current : result[args]);
    transformed = transformation._tag === "Transformation" ? transformation.decode.run(optional, options) : transformation.decode(succeed6(optional), options);
  } else if (transformation._tag === "Transformation") {
    transformed = flatMapEager2(result, (value) => transformation.decode.run(toOption(value), options));
  } else {
    transformed = transformation.decode(mapEager2(result, toOption), options);
  }
  return effectIsExit(transformed) && transformed._tag === "Success" ? fromOptionExit(transformed[args]) : flatMapEager2(transformed, fromOptionExit);
}
function makeConstructorParser(descriptor, compile) {
  let sourceParser;
  return (input, options) => {
    if (input === missing)
      return missingExit;
    if (descriptor.isConstructed(input))
      return sameExit;
    const result = (sourceParser ??= compile(descriptor.link.to))(input, options);
    return applyTransformation(result, input, descriptor.link.transformation, options);
  };
}
function makeParser(ast, compile, compileConstructorDefault, constructorDefault) {
  const descriptor = compileConstructorDefault ? getConstructorDescriptor(ast) : undefined;
  const parser = descriptor ? makeConstructorParser(descriptor, compile) : ast.getParser(compile, compileConstructorDefault);
  const checks = ast.checks;
  const links = constructorDefault ? ast.encoding ? [...ast.encoding, constructorDefault] : [constructorDefault] : ast.encoding;
  const encodingChecks = ast.encodingChecks;
  const astOptions = (checks ? checks[checks.length - 1].annotations : ast.annotations)?.["parseOptions"];
  if (!links && !checks && !encodingChecks) {
    if (!astOptions) {
      return parser;
    }
    return (input, options) => parser(input, mergeParseOptions(options, astOptions));
  }
  let encodingParsers;
  const parseLocal = (input, options) => {
    let result = parser(input, options);
    if (encodingChecks && !options.disableChecks) {
      if (effectIsExit(result)) {
        if (result._tag === "Success") {
          const output = result === sameExit ? input : result[args];
          if (input !== missing && output !== missing) {
            const issues = collectIssues(encodingChecks, input, undefined, ast, options);
            if (issues) {
              result = fail5(new Composite(ast, issues, input, options));
            }
          }
        }
      } else {
        result = flatMap2(result, (value) => {
          if (input !== missing && value !== missing) {
            const issues = collectIssues(encodingChecks, input, undefined, ast, options);
            if (issues) {
              return fail5(new Composite(ast, issues, input, options));
            }
          }
          return succeed5(value);
        });
      }
    }
    if (checks && !options.disableChecks) {
      if (effectIsExit(result)) {
        if (result._tag === "Success") {
          const value = result === sameExit ? input : result[args];
          if (value === missing)
            return result;
          const issues = collectIssues(checks, value, undefined, ast, options);
          if (issues) {
            result = fail5(new Composite(ast, issues, value, options));
          }
        }
      } else {
        result = flatMap2(result, (value) => {
          if (value !== missing) {
            const issues = collectIssues(checks, value, undefined, ast, options);
            if (issues) {
              return fail5(new Composite(ast, issues, value, options));
            }
          }
          return succeed5(value);
        });
      }
    }
    return result;
  };
  if (!links) {
    return astOptions ? (input, options) => parseLocal(input, mergeParseOptions(options, astOptions)) : parseLocal;
  }
  return (input, options) => {
    if (astOptions) {
      options = mergeParseOptions(options, astOptions);
    }
    const parsers = encodingParsers ??= links.map((link) => compile(link.to));
    let current = input;
    let result = parsers[parsers.length - 1](input, options);
    for (let i = links.length - 1;i >= 0; i--) {
      result = applyTransformation(result, current, links[i].transformation, options);
      if (i !== 0) {
        const next = parsers[i - 1];
        if (result._tag === "Success") {
          current = result[args];
          result = next(current, options);
        } else {
          result = flatMapEager2(result, (value) => {
            const nextResult = next(value, options);
            return nextResult === sameExit ? succeed6(value) : nextResult;
          });
        }
      }
    }
    if (result._tag === "Success") {
      const value = result[args];
      const local = parseLocal(value, options);
      return local === sameExit ? result : local;
    }
    result = catchCause2(result, (cause) => failCauseSync2(() => map5(cause, (issue) => new Encoding(ast, issue, input, options))));
    return flatMapEager2(result, (value) => {
      const local = parseLocal(value, options);
      return local === sameExit ? succeed6(value) : local;
    });
  };
}

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/internal/schema/schema.js
var TypeId7 = "~effect/Schema/Schema";
var SchemaProto = {
  [TypeId7]: TypeId7,
  pipe() {
    return pipeArguments(this, arguments);
  },
  annotate(annotations) {
    return this.rebuild(annotate(this.ast, annotations));
  },
  annotateKey(annotations) {
    return this.rebuild(annotateKey(this.ast, annotations));
  },
  check(...checks) {
    return this.rebuild(appendChecks(this.ast, checks));
  }
};
function make5(ast, options) {
  function Schema() {}
  const self = Object.defineProperties(Object.setPrototypeOf(Schema, SchemaProto), Object.getOwnPropertyDescriptors({
    ...options
  }));
  self.ast = ast;
  self.rebuild = (ast) => make5(ast, options);
  self.makeEffect = makeEffect(self);
  self.make = make4(self);
  self.makeOption = makeOption(self);
  return self;
}

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/Struct.js
var lambda = (f) => f;

// node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/dist/Schema.js
var TypeId8 = TypeId7;
function declareConstructor() {
  return (typeParameters, run, annotations) => {
    return make6(new Declaration(typeParameters.map(getAST), (typeParameters) => run(typeParameters.map((ast) => make6(ast))), annotations));
  };
}
function declare(is, annotations) {
  return declareConstructor()([], () => (input, ast, options) => is(input) ? succeed5(input) : fail5(new InvalidType(ast, input, options)), annotations);
}
var SchemaErrorTypeId = "~effect/SchemaError/SchemaError";

class SchemaError extends (/* @__PURE__ */ TaggedError2("SchemaError")) {
  [SchemaErrorTypeId] = SchemaErrorTypeId;
  constructor(issue) {
    const stackTraceLimit = getStackTraceLimit();
    setStackTraceLimit(0);
    try {
      super({
        issue
      });
    } finally {
      setStackTraceLimit(stackTraceLimit);
    }
  }
  get message() {
    return defaultFormatter(this.issue);
  }
  toString() {
    return `SchemaError(${this.message})`;
  }
}
function isSchemaError(u) {
  return hasProperty(u, SchemaErrorTypeId) && u[SchemaErrorTypeId] === SchemaErrorTypeId;
}
var is2 = is;
function decodeUnknownEffect2(schema, options) {
  const parser = decodeUnknownEffect(schema, options);
  return (input, options) => {
    return fromIssueEffect(parser(input, options));
  };
}
function fromIssueEffect(self) {
  if (effectIsExit(self)) {
    return fromIssueExit(self);
  }
  return catchCause2(self, (cause) => failCauseSync2(() => map5(cause, (issue) => new SchemaError(issue))));
}
function getSchemaErrorOrThrow(cause, message) {
  let schemaError;
  for (const reason of cause.reasons) {
    if (!isFailReason2(reason) || !isSchemaError(reason.error)) {
      throw new globalThis.Error(message, {
        cause
      });
    }
    schemaError ??= reason.error;
  }
  if (schemaError === undefined) {
    throw new globalThis.Error(message, {
      cause
    });
  }
  return schemaError;
}
function runSchemaErrorSync(self) {
  const exit = runSyncExit2(self);
  if (isSuccess3(exit)) {
    return exit.value;
  }
  throw getSchemaErrorOrThrow(exit.cause, "Sync adapter can only throw schema errors");
}
function fromIssueExit(exit) {
  return isSuccess3(exit) ? exit : failCause2(map5(exit.cause, (issue) => new SchemaError(issue)));
}
function decodeUnknownSync(schema, options) {
  const parser = decodeUnknownEffect2(schema, options);
  return (input, options) => {
    return runSchemaErrorSync(parser(input, options));
  };
}
function encodeUnknownEffect2(schema, options) {
  const parser = encodeUnknownEffect(schema, options);
  return (input, options) => {
    return fromIssueEffect(parser(input, options));
  };
}
var encodeEffect = encodeUnknownEffect2;
var make6 = make5;
function isSchema(u) {
  return hasProperty(u, TypeId8) && u[TypeId8] === TypeId8;
}
var optionalKey2 = /* @__PURE__ */ lambda((schema) => make6(optionalKey(schema.ast), {
  schema
}));
var optional2 = /* @__PURE__ */ lambda((self) => {
  const schema = UndefinedOr(self);
  return make6(optional(self.ast), {
    schema
  });
});
var toType2 = /* @__PURE__ */ lambda((schema) => make6(toType(schema.ast), {
  schema
}));
var toEncoded2 = /* @__PURE__ */ lambda((schema) => make6(toEncoded(schema.ast), {
  schema
}));
function Literal2(literal) {
  const out = make6(new Literal(literal), {
    literal,
    transform(to) {
      return out.pipe(decodeTo2(Literal2(to), {
        decode: transform(() => to),
        encode: transform(() => literal)
      }));
    }
  });
  return out;
}
var Unknown2 = /* @__PURE__ */ make6(unknown);
var Undefined2 = /* @__PURE__ */ make6(undefined_2);
var String4 = /* @__PURE__ */ make6(string2);
var Number5 = /* @__PURE__ */ make6(number2);
var Boolean3 = /* @__PURE__ */ make6(boolean);
function makeStruct(ast, fields) {
  return make6(ast, {
    fields,
    mapFields(f, options) {
      const fields = f(this.fields);
      return makeStruct(struct(fields, options?.unsafePreserveChecks ? this.ast.checks : undefined), fields);
    }
  });
}
function Struct(fields) {
  return makeStruct(struct(fields, undefined), fields);
}
function Record(key, value) {
  return make6(record(key.ast, value.ast), {
    key,
    value
  });
}
function makeTuple(ast, elements) {
  return make6(ast, {
    elements,
    mapElements(f, options) {
      const elements = f(this.elements);
      return makeTuple(tuple(elements, options?.unsafePreserveChecks ? this.ast.checks : undefined), elements);
    }
  });
}
function Tuple(elements) {
  return makeTuple(tuple(elements), elements);
}
var ArraySchema = /* @__PURE__ */ lambda((schema) => make6(new Arrays(false, [], [schema.ast]), {
  value: schema
}));
function makeUnion(ast, members) {
  return make6(ast, {
    members,
    mapMembers(f, options) {
      const members = f(this.members);
      return makeUnion(union2(members, this.ast.mode, options?.unsafePreserveChecks ? this.ast.checks : undefined), members);
    }
  });
}
function Union2(members, options) {
  return makeUnion(union2(members, options?.mode ?? "anyOf", undefined), members);
}
function Literals(literals) {
  const members = literals.map(Literal2);
  return make6(union2(members, "anyOf", undefined), {
    literals,
    members,
    mapMembers(f) {
      return Union2(f(this.members));
    },
    pick(literals) {
      return Literals(literals);
    },
    transform(to) {
      return Union2(members.map((member, index) => member.transform(to[index])));
    }
  });
}
var UndefinedOr = /* @__PURE__ */ lambda((self) => Union2([self, Undefined2]));
function suspend2(f) {
  return make6(new Suspend(() => f().ast));
}
function decodeTo2(to, transformation) {
  return (from) => {
    return make6(decodeTo(from.ast, to.ast, transformation ? make3(transformation) : passthrough2()), {
      from,
      to
    });
  };
}
function encodeTo(to, transformation) {
  return (from) => {
    return transformation ? decodeTo2(from, transformation)(to) : decodeTo2(from)(to);
  };
}
function withConstructorDefault2(defaultValue) {
  return (schema) => make6(withConstructorDefault(schema.ast, defaultValue), {
    schema
  });
}
function toIssueEffect(self) {
  return catchCause2(self, (cause) => failCauseSync2(() => map5(cause, (error) => error.issue)));
}
function withDecodingDefaultKey(defaultValue, options) {
  const encode = options?.encodingStrategy === "omit" ? omit() : passthrough();
  return (self) => {
    return optionalKey2(toEncoded2(self)).pipe(decodeTo2(self, {
      decode: withDefault(toIssueEffect(defaultValue)),
      encode
    }));
  };
}
function withDecodingDefaultTypeKey(defaultValue, options) {
  return (self) => {
    return toType2(self).pipe(withDecodingDefaultKey(defaultValue, options), encodeTo(optionalKey2(self)));
  };
}
function tag(literal) {
  return Literal2(literal).pipe(withConstructorDefault2(succeed5(literal)));
}
function TaggedStruct(value, fields) {
  return Struct({
    _tag: tag(value),
    ...fields
  });
}
function instanceOf(constructor, annotations) {
  return declare((u) => u instanceof constructor, annotations);
}
function link() {
  return (encodeTo, transformation) => {
    return new Link(encodeTo.ast, make3(transformation));
  };
}
var makeFilter2 = makeFilter;
function isPattern2(regExp, annotations) {
  const source = regExp.source;
  const flags = regExp.flags;
  const runtimeRegExp = flags === "" ? `new RegExp(${format(source)})` : `new RegExp(${format(source)}, ${format(flags)})`;
  return isPattern(regExp, {
    toCode: () => ({
      runtime: `Schema.isPattern(${runtimeRegExp})`
    }),
    ...annotations
  });
}
function isBase64(annotations) {
  const regExp = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
  return isPattern2(regExp, {
    expected: "a base64 encoded string",
    representation: {
      id: "effect/schema/isBase64",
      payload: null
    },
    toJsonSchema: () => ({
      pattern: regExp.source
    }),
    toCode: () => ({
      runtime: "Schema.isBase64()"
    }),
    ...annotations
  });
}
var Finite = /* @__PURE__ */ make6(finite);
function makeIsGreaterThan(options) {
  const gt = isGreaterThan(options.order);
  const formatter = options.formatter ?? format;
  return (exclusiveMinimum, annotations) => {
    return makeFilter2((input) => gt(input, exclusiveMinimum), {
      expected: `a value greater than ${formatter(exclusiveMinimum)}`,
      arbitrary: {
        constraint: {
          ordered: {
            order: options.order,
            minimum: exclusiveMinimum,
            exclusiveMinimum: true
          }
        }
      },
      ...options.annotate?.(exclusiveMinimum),
      ...annotations
    });
  };
}
function makeIsGreaterThanOrEqualTo(options) {
  const gte = isGreaterThanOrEqualTo(options.order);
  const formatter = options.formatter ?? format;
  return (minimum, annotations) => {
    return makeFilter2((input) => gte(input, minimum), {
      expected: `a value greater than or equal to ${formatter(minimum)}`,
      arbitrary: {
        constraint: {
          ordered: {
            order: options.order,
            minimum
          }
        }
      },
      ...options.annotate?.(minimum),
      ...annotations
    });
  };
}
function makeIsLessThan(options) {
  const lt = isLessThan(options.order);
  const formatter = options.formatter ?? format;
  return (exclusiveMaximum, annotations) => {
    return makeFilter2((input) => lt(input, exclusiveMaximum), {
      expected: `a value less than ${formatter(exclusiveMaximum)}`,
      arbitrary: {
        constraint: {
          ordered: {
            order: options.order,
            maximum: exclusiveMaximum,
            exclusiveMaximum: true
          }
        }
      },
      ...options.annotate?.(exclusiveMaximum),
      ...annotations
    });
  };
}
function makeIsLessThanOrEqualTo(options) {
  const lte = isLessThanOrEqualTo(options.order);
  const formatter = options.formatter ?? format;
  return (maximum, annotations) => {
    return makeFilter2((input) => lte(input, maximum), {
      expected: `a value less than or equal to ${formatter(maximum)}`,
      arbitrary: {
        constraint: {
          ordered: {
            order: options.order,
            maximum
          }
        }
      },
      ...options.annotate?.(maximum),
      ...annotations
    });
  };
}
function makeIsBetween(deriveOptions) {
  const greaterThanOrEqualTo = isGreaterThanOrEqualTo(deriveOptions.order);
  const greaterThan = isGreaterThan(deriveOptions.order);
  const lessThanOrEqualTo = isLessThanOrEqualTo(deriveOptions.order);
  const lessThan = isLessThan(deriveOptions.order);
  const formatter = deriveOptions.formatter ?? format;
  return (options, annotations) => {
    const gte = options.exclusiveMinimum ? greaterThan : greaterThanOrEqualTo;
    const lte = options.exclusiveMaximum ? lessThan : lessThanOrEqualTo;
    return makeFilter2((input) => gte(input, options.minimum) && lte(input, options.maximum), {
      expected: `a value between ${formatter(options.minimum)}${options.exclusiveMinimum ? " (excluded)" : ""} and ${formatter(options.maximum)}${options.exclusiveMaximum ? " (excluded)" : ""}`,
      arbitrary: {
        constraint: {
          ordered: {
            order: deriveOptions.order,
            minimum: options.minimum,
            maximum: options.maximum,
            ...options.exclusiveMinimum && {
              exclusiveMinimum: true
            },
            ...options.exclusiveMaximum && {
              exclusiveMaximum: true
            }
          }
        }
      },
      ...deriveOptions.annotate?.(options),
      ...annotations
    });
  };
}
function encodeNumberPayload(number) {
  if (!globalThis.Number.isFinite(number)) {
    throw new globalThis.RangeError(`Expected a finite number, got ${format(number)}`);
  }
  return number;
}
var isGreaterThan2 = /* @__PURE__ */ makeIsGreaterThan({
  order: Number2,
  annotate: (exclusiveMinimum) => ({
    representation: {
      id: "effect/schema/isGreaterThan",
      payload: {
        exclusiveMinimum: encodeNumberPayload(exclusiveMinimum)
      }
    },
    toJsonSchema: () => ({
      exclusiveMinimum
    }),
    toCode: () => ({
      runtime: `Schema.isGreaterThan(${format(exclusiveMinimum)})`
    })
  })
});
var isGreaterThanOrEqualTo2 = /* @__PURE__ */ makeIsGreaterThanOrEqualTo({
  order: Number2,
  annotate: (minimum) => ({
    representation: {
      id: "effect/schema/isGreaterThanOrEqualTo",
      payload: {
        minimum: encodeNumberPayload(minimum)
      }
    },
    toJsonSchema: () => ({
      minimum
    }),
    toCode: () => ({
      runtime: `Schema.isGreaterThanOrEqualTo(${format(minimum)})`
    })
  })
});
var isLessThan2 = /* @__PURE__ */ makeIsLessThan({
  order: Number2,
  annotate: (exclusiveMaximum) => ({
    representation: {
      id: "effect/schema/isLessThan",
      payload: {
        exclusiveMaximum: encodeNumberPayload(exclusiveMaximum)
      }
    },
    toJsonSchema: () => ({
      exclusiveMaximum
    }),
    toCode: () => ({
      runtime: `Schema.isLessThan(${format(exclusiveMaximum)})`
    })
  })
});
var isLessThanOrEqualTo2 = /* @__PURE__ */ makeIsLessThanOrEqualTo({
  order: Number2,
  annotate: (maximum) => ({
    representation: {
      id: "effect/schema/isLessThanOrEqualTo",
      payload: {
        maximum: encodeNumberPayload(maximum)
      }
    },
    toJsonSchema: () => ({
      maximum
    }),
    toCode: () => ({
      runtime: `Schema.isLessThanOrEqualTo(${format(maximum)})`
    })
  })
});
var isBetween = /* @__PURE__ */ makeIsBetween({
  order: Number2,
  annotate: (options) => {
    const exclusiveMinimum = options.exclusiveMinimum ? true : undefined;
    const exclusiveMaximum = options.exclusiveMaximum ? true : undefined;
    const payload = {
      minimum: encodeNumberPayload(options.minimum),
      maximum: encodeNumberPayload(options.maximum),
      ...exclusiveMinimum && {
        exclusiveMinimum
      },
      ...exclusiveMaximum && {
        exclusiveMaximum
      }
    };
    return {
      representation: {
        id: "effect/schema/isBetween",
        payload
      },
      toJsonSchema: () => ({
        [exclusiveMinimum ? "exclusiveMinimum" : "minimum"]: options.minimum,
        [exclusiveMaximum ? "exclusiveMaximum" : "maximum"]: options.maximum
      }),
      toCode: () => ({
        runtime: `Schema.isBetween({ minimum: ${format(options.minimum)}, maximum: ${format(options.maximum)}, exclusiveMinimum: ${format(exclusiveMinimum)}, exclusiveMaximum: ${format(exclusiveMaximum)} })`
      })
    };
  }
});
function isInt(annotations) {
  return makeFilter2((n) => globalThis.Number.isSafeInteger(n), {
    expected: "an integer",
    representation: {
      id: "effect/schema/isInt",
      payload: null
    },
    toJsonSchema: () => ({
      type: "integer"
    }),
    toCode: () => ({
      runtime: "Schema.isInt()"
    }),
    arbitrary: {
      constraint: {
        integer: true
      }
    },
    ...annotations
  });
}
var Int = /* @__PURE__ */ Number5.check(/* @__PURE__ */ isInt());
function isMinLength(minLength, annotations) {
  minLength = Math.max(0, Math.floor(minLength));
  return makeFilter2((input) => input.length >= minLength, {
    expected: `a value with a length of at least ${minLength}`,
    representation: {
      id: "effect/schema/isMinLength",
      payload: {
        minLength
      }
    },
    toJsonSchema: ({
      type
    }) => type === "array" ? {
      minItems: minLength
    } : {
      minLength
    },
    toCode: () => ({
      runtime: `Schema.isMinLength(${minLength})`
    }),
    [STRUCTURAL_ANNOTATION_KEY]: true,
    arbitrary: {
      constraint: {
        minLength
      }
    },
    ...annotations
  });
}
function isMaxLength(maxLength, annotations) {
  maxLength = Math.max(0, Math.floor(maxLength));
  return makeFilter2((input) => input.length <= maxLength, {
    expected: `a value with a length of at most ${maxLength}`,
    representation: {
      id: "effect/schema/isMaxLength",
      payload: {
        maxLength
      }
    },
    toJsonSchema: ({
      type
    }) => type === "array" ? {
      maxItems: maxLength
    } : {
      maxLength
    },
    toCode: () => ({
      runtime: `Schema.isMaxLength(${maxLength})`
    }),
    [STRUCTURAL_ANNOTATION_KEY]: true,
    arbitrary: {
      constraint: {
        maxLength
      }
    },
    ...annotations
  });
}
var RegExp2 = /* @__PURE__ */ instanceOf(globalThis.RegExp, {
  representation: {
    id: "effect/schema/RegExp",
    payload: null
  },
  toCode: () => ({
    runtime: `Schema.RegExp`,
    Type: `globalThis.RegExp`
  }),
  expected: "RegExp",
  toCodecJson: () => link()(Struct({
    source: String4,
    flags: String4
  }), transformOrFail2({
    decode: (e, options) => try_2({
      try: () => new globalThis.RegExp(e.source, e.flags),
      catch: () => new InvalidValue({
        expected: "valid RegExp source and flags"
      }, e, options)
    }),
    encode: (regExp) => succeed5({
      source: regExp.source,
      flags: regExp.flags
    })
  })),
  toArbitrary: () => (fc) => fc.tuple(fc.constantFrom(".", ".*", "\\d+", "\\w+", "[a-z]+", "[A-Z]+", "[0-9]+", "^[a-zA-Z0-9]+$", "^\\d{4}-\\d{2}-\\d{2}$"), fc.uniqueArray(fc.constantFrom("g", "i", "m", "s", "u", "y"), {
    minLength: 0,
    maxLength: 6
  }).map((flags) => flags.join(""))).map(([source, flags]) => new globalThis.RegExp(source, flags)),
  toEquivalence: () => (a, b) => a.source === b.source && a.flags === b.flags
});
var URLString = /* @__PURE__ */ String4.annotate({
  expected: "a string that will be decoded as a URL"
});
var URL2 = /* @__PURE__ */ instanceOf(globalThis.URL, {
  representation: {
    id: "effect/schema/URL",
    payload: null
  },
  toCode: () => ({
    runtime: `Schema.URL`,
    Type: `globalThis.URL`
  }),
  expected: "URL",
  toCodecJson: () => link()(URLString, urlFromString),
  toArbitrary: () => (fc) => fc.webUrl().map((s) => new globalThis.URL(s)),
  toEquivalence: () => (a, b) => a.toString() === b.toString()
});
var File = /* @__PURE__ */ instanceOf(globalThis.File, {
  representation: {
    id: "effect/schema/File",
    payload: null
  },
  toCode: () => ({
    runtime: `Schema.File`,
    Type: `globalThis.File`
  }),
  expected: "File",
  toCodecJson: () => link()(Struct({
    data: String4.check(isBase64()),
    type: String4,
    name: String4,
    lastModified: Int
  }), transformOrFail2({
    decode: (e, options) => match(decodeBase64(e.data), {
      onFailure: () => fail5(new InvalidValue({
        expected: "a valid Base64 string"
      }, e.data, options)),
      onSuccess: (bytes) => {
        const buffer = new globalThis.Uint8Array(bytes);
        return succeed5(new globalThis.File([buffer], e.name, {
          type: e.type,
          lastModified: e.lastModified
        }));
      }
    }),
    encode: (file, options) => tryPromise2({
      try: async () => {
        const bytes = new globalThis.Uint8Array(await file.arrayBuffer());
        return {
          data: encodeBase64(bytes),
          type: file.type,
          name: file.name,
          lastModified: file.lastModified
        };
      },
      catch: () => new InvalidValue({
        expected: "a readable File"
      }, file, options)
    })
  }))
});
var FormData2 = /* @__PURE__ */ instanceOf(globalThis.FormData, {
  representation: {
    id: "effect/schema/FormData",
    payload: null
  },
  toCode: () => ({
    runtime: `Schema.FormData`,
    Type: `globalThis.FormData`
  }),
  expected: "FormData",
  toCodecJson: () => link()(ArraySchema(Tuple([String4, Union2([Struct({
    _tag: tag("String"),
    value: String4
  }), Struct({
    _tag: tag("File"),
    value: File
  })])])), transformOrFail2({
    decode: (e) => {
      const out = new globalThis.FormData;
      for (const [key, entry] of e) {
        out.append(key, entry.value);
      }
      return succeed5(out);
    },
    encode: (formData) => {
      return succeed5(globalThis.Array.from(formData.entries()).map(([key, value]) => {
        if (typeof value === "string") {
          return [key, {
            _tag: "String",
            value
          }];
        } else {
          return [key, {
            _tag: "File",
            value
          }];
        }
      }));
    }
  }))
});
var URLSearchParams2 = /* @__PURE__ */ instanceOf(globalThis.URLSearchParams, {
  representation: {
    id: "effect/schema/URLSearchParams",
    payload: null
  },
  toCode: () => ({
    runtime: `Schema.URLSearchParams`,
    Type: `globalThis.URLSearchParams`
  }),
  expected: "URLSearchParams",
  toCodecJson: () => link()(String4.annotate({
    expected: "a query string that will be decoded as URLSearchParams"
  }), transform2({
    decode: (e) => new globalThis.URLSearchParams(e),
    encode: (params) => params.toString()
  }))
});
var Base64String = /* @__PURE__ */ String4.annotate({
  expected: "a base64 encoded string that will be decoded as Uint8Array",
  format: "byte",
  contentEncoding: "base64"
});
var Uint8Array2 = /* @__PURE__ */ instanceOf(globalThis.Uint8Array, {
  representation: {
    id: "effect/schema/Uint8Array",
    payload: null
  },
  toCode: () => ({
    runtime: `Schema.Uint8Array`,
    Type: `globalThis.Uint8Array`
  }),
  expected: "Uint8Array",
  toCodecJson: () => link()(Base64String, uint8ArrayFromBase64String),
  toArbitrary: () => (fc) => fc.uint8Array()
});
var immerable = /* @__PURE__ */ globalThis.Symbol.for("immer-draftable");
var payloadToken = {};
function makeClass(Inherited, identifier, struct2, annotations, proto) {
  const getClassSchema = getClassSchemaFactory(struct2, identifier, annotations);
  const ClassTypeId = getClassTypeId(identifier);
  const out = class extends Inherited {
    constructor(...[input, options]) {
      const internalOptions = options;
      const payload = internalOptions?.["~payload"];
      const value = payload?.token === payloadToken ? payload.value : struct2.make(input ?? {}, options);
      super(value, {
        ...options,
        disableChecks: true,
        "~payload": {
          token: payloadToken,
          value
        }
      });
    }
    static [TypeId8] = TypeId8;
    get [ClassTypeId]() {
      return ClassTypeId;
    }
    static [immerable] = true;
    static identifier = identifier;
    static fields = struct2.fields;
    static get ast() {
      return getClassSchema(this).ast;
    }
    static pipe() {
      return pipeArguments(this, arguments);
    }
    static rebuild(ast) {
      return getClassSchema(this).rebuild(ast);
    }
    static make(input, options) {
      return new this(input, options);
    }
    static makeOption(input, options) {
      return makeOption(getClassSchema(this))(input ?? {}, options);
    }
    static makeEffect(input, options) {
      return getClassSchema(this).makeEffect(input ?? {}, options);
    }
    static annotate(annotations) {
      return this.rebuild(annotate(this.ast, annotations));
    }
    static annotateKey(annotations) {
      return this.rebuild(annotateKey(this.ast, annotations));
    }
    static check(...checks) {
      return this.rebuild(appendChecks(this.ast, checks));
    }
    static extend(identifier2) {
      return (schema, annotations) => {
        const extension = isStruct(schema) ? schema : Struct(schema);
        const fields = {
          ...struct2.fields,
          ...extension.fields
        };
        const ast = struct(fields, struct2.ast.checks, {
          identifier: identifier2
        });
        return makeClass(this, identifier2, makeStruct(appendChecks(ast, extension.ast.checks), fields), annotations, proto);
      };
    }
    static mapFields(f, options) {
      return struct2.mapFields(f, options);
    }
  };
  if (proto !== undefined) {
    Object.assign(out.prototype, proto(identifier));
  }
  return out;
}
function getClassTransformation(self) {
  return new Transformation(transform((input) => new self(input, {
    "~payload": {
      token: payloadToken,
      value: input
    }
  })), passthrough());
}
function getClassTypeId(identifier) {
  return `~effect/Schema/Class/${identifier}`;
}
function getClassSchemaFactory(from, identifier, annotations) {
  let memo;
  return (self) => {
    if (memo !== undefined) {
      return memo;
    }
    const ClassTypeId = getClassTypeId(identifier);
    const isClassValue = (input) => input instanceof self || hasProperty(input, ClassTypeId);
    const transformation = getClassTransformation(self);
    const to = make6(new Declaration([from.ast], () => (input, ast, options) => {
      return isClassValue(input) ? succeed5(input) : fail5(new InvalidType(ast, input, options));
    }, {
      identifier,
      [CONSTRUCTOR_ANNOTATION_KEY]: ([from]) => ({
        isConstructed: isClassValue,
        link: new Link(from, transformation)
      }),
      toCodec: ([from]) => new Link(from.ast, transformation),
      toArbitrary: ([from]) => () => ({
        arbitrary: from.arbitrary.map((args) => new self(args)),
        terminal: from.terminal?.map((args) => new self(args))
      }),
      toFormatter: ([from]) => (t) => `${self.identifier}(${from(t)})`,
      [SENTINELS_ANNOTATION_KEY]: collectSentinels(from.ast),
      ...annotations
    }));
    return memo = decodeTo2(to, transformation)(from);
  };
}
function isStruct(schema) {
  return isSchema(schema);
}
var Class3 = (identifier) => (schema, annotations) => {
  const struct = isStruct(schema) ? schema : Struct(schema);
  return makeClass(Class2, identifier, struct, annotations, (identifier) => ({
    toString() {
      return `${identifier}(${format({
        ...this
      })})`;
    }
  }));
};
// packages/plugin-sdk/src/capability.ts
var CAPABILITIES = [
  "drawing:read",
  "drawing:write",
  "toolpath:read",
  "storage",
  "ui:panel",
  "ai:tool"
];
var CapabilitySchema = Literals(CAPABILITIES);
var ALL_CAPABILITIES = [...CAPABILITIES];
// packages/plugin-sdk/src/manifest.ts
var PluginIdSchema = String4.check(isMinLength(3), isMaxLength(128), isPattern2(/^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/));
var SemverSchema = String4.check(isPattern2(/^\d+\.\d+\.\d+(-[0-9A-Za-z-.]+)?$/));
var SUPPORTED_API_VERSION = "1";
var CommandContributionSchema = Struct({
  id: String4.check(isMinLength(1)),
  title: String4,
  keybinding: optional2(String4)
});
var PanelContributionSchema = Struct({
  id: String4.check(isMinLength(1)),
  title: String4,
  entry: String4
});
var PostProcessorContributionSchema = Struct({
  id: String4.check(isMinLength(1)),
  title: String4,
  entry: String4
});
var OperationContributionSchema = Struct({
  id: String4.check(isMinLength(1)),
  title: String4,
  entry: String4
});
var AiToolContributionSchema = Struct({
  id: String4.check(isPattern2(/^[a-z][a-z0-9_]{0,39}$/)),
  description: String4.check(isMinLength(10)).check(isMaxLength(2000)),
  kind: Literals(["read", "write"]),
  parameters: Record(String4, Unknown2),
  entry: String4.check(isMinLength(1))
});
var ContributionsSchema = Struct({
  commands: optional2(ArraySchema(CommandContributionSchema)),
  panels: optional2(ArraySchema(PanelContributionSchema)),
  postProcessors: optional2(ArraySchema(PostProcessorContributionSchema)),
  operations: optional2(ArraySchema(OperationContributionSchema)),
  aiTools: optional2(ArraySchema(AiToolContributionSchema))
});
var PluginManifestSchema = Struct({
  id: PluginIdSchema,
  name: String4.check(isMinLength(1)),
  version: SemverSchema,
  apiVersion: Literal2(SUPPORTED_API_VERSION),
  entry: String4.check(isMinLength(1)),
  capabilities: ArraySchema(CapabilitySchema),
  contributes: optional2(ContributionsSchema),
  signature: optional2(String4),
  dev: optional2(Boolean3)
});
var decodeManifest = decodeUnknownEffect2(PluginManifestSchema);
var encodeManifest = encodeEffect(PluginManifestSchema);
var isManifest = is2(PluginManifestSchema);
// packages/plugin-sdk/src/context.ts
var requireCapability = (ctx, capability, surface) => {
  const value = ctx[surface];
  if (value === undefined) {
    throw new CapabilityError(ctx.pluginId, capability);
  }
  return value;
};

class CapabilityError extends Error {
  pluginId;
  capability;
  _tag = "CapabilityDenied";
  constructor(pluginId, capability) {
    super(`Plugin ${pluginId} may not use "${capability}": it was not granted at install time`);
    this.pluginId = pluginId;
    this.capability = capability;
    this.name = "CapabilityError";
  }
}
// packages/plugin-sdk/src/plugin.ts
var definePlugin = (plugin) => plugin;
// packages/core/src/cad/vec.ts
var TAU = Math.PI * 2;
var add2 = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
var fromPolar = (radius, angle) => ({
  x: radius * Math.cos(angle),
  y: radius * Math.sin(angle)
});

// packages/core/src/cad/arc-math.ts
var normalizeAngle = (a) => {
  const r = a % TAU;
  const n = r < 0 ? r + TAU : r;
  return n >= TAU ? 0 : n;
};

// packages/core/src/cad/entities.ts
var Num = Finite;
var PositiveNum = Finite.check(isGreaterThan2(0));
var NonNegativeNum = Finite.check(isGreaterThanOrEqualTo2(0));
var NormalizedAngle = Finite.check(isGreaterThanOrEqualTo2(0), isLessThan2(TAU));
var Vec2Schema = Struct({ x: Num, y: Num });
var Vec3Schema = Struct({ x: Num, y: Num, z: Num });
var Point = Vec2Schema;
var ColorSchema = Struct({
  r: Num.check(isBetween({ minimum: 0, maximum: 255 })),
  g: Num.check(isBetween({ minimum: 0, maximum: 255 })),
  b: Num.check(isBetween({ minimum: 0, maximum: 255 })),
  a: optionalKey2(Num.check(isBetween({ minimum: 0, maximum: 1 })))
});
var LineTypeSchema = Literals(["continuous", "dashed", "dotted", "center", "phantom"]);
var LineStyleSchema = Struct({
  color: ColorSchema,
  width: NonNegativeNum,
  type: LineTypeSchema
});
var Transform2DSchema = Struct({
  translation: Vec2Schema,
  rotation: Num,
  scale: Vec2Schema
});
var baseFields = {
  id: String4.check(isMinLength(1)),
  layerId: String4,
  visible: Boolean3,
  locked: Boolean3,
  lineStyle: optionalKey2(LineStyleSchema),
  transform: optionalKey2(Transform2DSchema),
  userData: optionalKey2(Record(String4, Unknown2))
};
var LineSchema = TaggedStruct("Line", {
  ...baseFields,
  start: Point,
  end: Point
});
var CircleSchema = TaggedStruct("Circle", {
  ...baseFields,
  center: Point,
  radius: PositiveNum
});
var ArcSchema = TaggedStruct("Arc", {
  ...baseFields,
  center: Point,
  radius: PositiveNum,
  startAngle: NormalizedAngle,
  endAngle: NormalizedAngle,
  clockwise: Boolean3
});
var PolylineSchema = TaggedStruct("Polyline", {
  ...baseFields,
  points: ArraySchema(Point).check(isMinLength(2)),
  closed: Boolean3,
  bulge: optionalKey2(ArraySchema(Num))
}).check(makeFilter2((p) => p.bulge === undefined || p.bulge.length === p.points.length ? undefined : { path: ["bulge"], issue: "bulge must have exactly one entry per point" }));
var RectangleSchema = TaggedStruct("Rectangle", {
  ...baseFields,
  corner1: Point,
  corner2: Point
});
var EllipseSchema = TaggedStruct("Ellipse", {
  ...baseFields,
  center: Point,
  radiusX: PositiveNum,
  radiusY: PositiveNum,
  rotation: Num
});
var SplineSchema = TaggedStruct("Spline", {
  ...baseFields,
  controlPoints: ArraySchema(Point).check(isMinLength(2)),
  degree: Int.check(isBetween({ minimum: 1, maximum: 5 })),
  closed: Boolean3,
  knots: optionalKey2(ArraySchema(Num))
});
var TextAlignmentSchema = Literals(["left", "center", "right"]);
var TextBaselineSchema = Literals(["top", "middle", "bottom"]);
var TextSchema = TaggedStruct("Text", {
  ...baseFields,
  position: Point,
  text: String4,
  fontSize: PositiveNum,
  fontFamily: String4,
  rotation: Num,
  alignment: TextAlignmentSchema,
  baseline: TextBaselineSchema
});
var DimensionTypeSchema = Literals(["linear", "aligned", "angular", "radial", "diameter"]);
var DimensionSchema = TaggedStruct("Dimension", {
  ...baseFields,
  start: Point,
  end: Point,
  text: String4,
  textPosition: Point,
  arrowSize: NonNegativeNum,
  textSize: PositiveNum,
  dimensionType: DimensionTypeSchema
});
var HatchPatternSchema = Literals(["solid", "lines", "dots", "cross"]);
var HatchSchema = TaggedStruct("Hatch", {
  ...baseFields,
  boundary: ArraySchema(Point).check(isMinLength(3)),
  pattern: HatchPatternSchema,
  scale: PositiveNum,
  angle: Num,
  fillColor: optionalKey2(String4)
});
var BlockSchema = TaggedStruct("Block", {
  ...baseFields,
  name: String4,
  basePoint: Point,
  entities: ArraySchema(suspend2(() => EntitySchema))
});
var EntitySchema = Union2([
  LineSchema,
  CircleSchema,
  ArcSchema,
  PolylineSchema,
  RectangleSchema,
  EllipseSchema,
  SplineSchema,
  TextSchema,
  DimensionSchema,
  HatchSchema,
  BlockSchema
]);
var decodeEntity = decodeUnknownEffect2(EntitySchema);
var encodeEntity = encodeEffect(EntitySchema);
var isEntity = is2(EntitySchema);
var UnitsSchema = Literals(["mm", "inch"]);
var LayerSchema = Struct({
  id: String4.check(isMinLength(1)),
  name: String4,
  visible: Boolean3,
  locked: Boolean3,
  color: String4
});
var CURRENT_SCHEMA_VERSION = 1;
var DrawingSchema = Struct({
  schemaVersion: Literal2(CURRENT_SCHEMA_VERSION),
  id: String4.check(isMinLength(1)),
  name: String4,
  units: UnitsSchema,
  layers: ArraySchema(LayerSchema),
  entities: ArraySchema(EntitySchema),
  version: Int.check(isGreaterThanOrEqualTo2(0))
});
var decodeDrawing = decodeUnknownEffect2(DrawingSchema);
var encodeDrawing = encodeEffect(DrawingSchema);
var isDrawing = is2(DrawingSchema);
var baseEntity = (id, layerId = "layer-0") => ({
  id,
  layerId,
  visible: true,
  locked: false
});
// packages/core/src/cad/shapes.ts
var regularPolygon = (center, radius, sides, startAngle = Math.PI / 2) => {
  const n = Math.max(3, Math.floor(sides));
  const pts = [];
  for (let i = 0;i < n; i++)
    pts.push(fromPolar(radius, normalizeAngle(startAngle + i * TAU / n)));
  return pts.map((p) => add2(p, center));
};
// packages/core/src/cad/transform.ts
var ARC_STEP = Math.PI / 180;
// packages/core/src/cad/snap.ts
var SNAP_TYPES = [
  "endpoint",
  "midpoint",
  "center",
  "intersection",
  "perpendicular",
  "tangent",
  "nearest",
  "quadrant"
];
var DEFAULT_SNAP_SETTINGS = {
  enabled: true,
  types: [...SNAP_TYPES],
  tolerance: 10,
  gridEnabled: false,
  gridSpacing: 10
};
var quadrantAngles = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
// packages/core/src/cad/solid.ts
var Vec3Point = Struct({
  x: Finite,
  y: Finite,
  z: Finite
});
var Point2 = Struct({ x: Finite, y: Finite });
var Size = Struct({ x: Finite.check(isGreaterThan2(0)), y: Finite.check(isGreaterThan2(0)), z: Finite.check(isGreaterThan2(0)) });
var BoxSolidSchema = TaggedStruct("Box", {
  origin: Vec3Point,
  size: Size
});
var CylinderSolidSchema = TaggedStruct("Cylinder", {
  origin: Vec3Point,
  radius: Finite.check(isGreaterThan2(0)),
  height: Finite.check(isGreaterThan2(0)),
  segments: Int.check(isBetween({ minimum: 3, maximum: 512 })),
  axis: Literals(["z", "x", "y"]).pipe(optionalKey2)
});
var SphereSolidSchema = TaggedStruct("Sphere", {
  center: Vec3Point,
  radius: Finite.check(isGreaterThan2(0)),
  rings: Int.check(isBetween({ minimum: 2, maximum: 256 }))
});
var ConeSolidSchema = TaggedStruct("Cone", {
  origin: Vec3Point,
  baseRadius: Finite.check(isGreaterThan2(0)),
  topRadius: Finite.check(isGreaterThanOrEqualTo2(0)),
  height: Finite.check(isGreaterThan2(0)),
  segments: Int.check(isBetween({ minimum: 3, maximum: 512 })),
  axis: Literals(["z", "x", "y"]).pipe(optionalKey2)
});
var TorusSolidSchema = TaggedStruct("Torus", {
  center: Vec3Point,
  majorRadius: Finite.check(isGreaterThan2(0)),
  minorRadius: Finite.check(isGreaterThan2(0)),
  rotation: Finite.pipe(optionalKey2),
  majorSegments: Int.check(isBetween({ minimum: 3, maximum: 512 })),
  minorSegments: Int.check(isBetween({ minimum: 3, maximum: 256 })),
  axis: Literals(["z", "x", "y"]).pipe(optionalKey2)
});
var ExtrudeSolidSchema = TaggedStruct("Extrude", {
  profile: ArraySchema(Point2).check(isMinLength(3)),
  height: Finite,
  origin: Vec3Point.pipe(optionalKey2)
});
var RevolveSolidSchema = TaggedStruct("Revolve", {
  profile: ArraySchema(Point2).check(isMinLength(2)),
  angle: Finite,
  segments: Int.check(isBetween({ minimum: 3, maximum: 512 })).pipe(optionalKey2)
});
var SolidSchema = Union2([
  BoxSolidSchema,
  CylinderSolidSchema,
  SphereSolidSchema,
  ConeSolidSchema,
  TorusSolidSchema,
  ExtrudeSolidSchema,
  RevolveSolidSchema
]);
var decodeSolid = decodeUnknownEffect2(SolidSchema);
// packages/core/src/cad/migrate.ts
class DrawingMigrationError extends TaggedError2("DrawingMigrationError") {
}
// packages/core/src/cad/design.ts
var SOLIDS = new Set(["cube", "box", "sphere", "cylinder", "cone", "torus", "pyramid", "prism", "hemisphere", "ellipsoid", "capsule", "extrusion", "revolution", "parametric", "sweep", "loft", "gear", "spring", "bolt", "screw", "nut", "washer", "wall", "column", "stair"]);
var BOOLEANS = new Set(["boolean-union", "boolean-subtract", "boolean-intersect"]);
var RADIAN_LOOKALIKES = [Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI, 3 * Math.PI / 2, 2 * Math.PI];
// packages/core/src/cad/expr.ts
var UNITS = { mm: 1, cm: 10, m: 1000, in: 25.4, deg: Math.PI / 180, rad: 1 };
var CONSTANTS = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI };
// packages/core/src/cad/profile-shape.ts
var CORNER_TURN = 10 * Math.PI / 180;

// packages/core/src/cam/model/element-mesh.ts
var TAU2 = 2 * Math.PI;
var parametricCache = new Map;

// packages/core/src/cad/history.ts
var PRIMITIVE_MAY_BE_ZERO = new Set(["holeDiameter", "phiStart"]);
// packages/core/src/cad/parametric-from-element.ts
var SOLIDS2 = {
  cube: { numbers: ["width", "height", "depth"] },
  sphere: { numbers: ["radius", "segments"] },
  ellipsoid: { numbers: ["radiusX", "radiusY", "radiusZ", "segments"] },
  cylinder: { numbers: ["radius", "height", "segments"] },
  cone: { numbers: ["radius", "height", "segments"] },
  prism: { numbers: ["radius", "height", "sides"] },
  pyramid: { numbers: ["baseWidth", "baseDepth", "height"] },
  hemisphere: { numbers: ["radius", "segments"], options: ["direction"] },
  capsule: { numbers: ["radius", "height", "segments"], options: ["direction"] },
  torus: { numbers: ["radius", "tubeRadius"] },
  gear: { numbers: ["moduleValue", "teeth", "thickness", "pressureAngle", "holeDiameter"] },
  extrusion: { numbers: ["depth", "width", "height", "radius"], options: ["shape"], arrays: ["profile"] },
  revolution: { numbers: ["angle", "segments"], options: ["axis"], arrays: ["profile"] },
  sweep: { numbers: ["radius", "segments"], arrays: ["profile", "path"] },
  loft: { numbers: [], arrays: ["profiles", "positions"] },
  spring: { numbers: ["radius", "wireRadius", "turns", "height"] },
  bolt: { numbers: ["length"], options: ["size"] },
  screw: { numbers: ["length"], options: ["size"] },
  nut: { numbers: [], options: ["size"] },
  washer: { numbers: ["outerDiameter", "thickness"], options: ["size"] },
  wall: { numbers: ["length", "thickness", "height"] },
  floor: { numbers: ["width", "depth", "thickness"] },
  window: { numbers: ["width", "height", "thickness"] },
  door: { numbers: ["width", "height", "thickness"], options: ["style"] },
  column: { numbers: ["radius", "height"], options: ["style"] },
  roof: { numbers: ["width", "depth", "height"], options: ["style"] },
  stair: { numbers: ["width", "height", "depth", "steps"] }
};
var FLAT = ["rectangle", "circle", "polygon", "ellipse", "triangle"];
var CONTAINERS = new Set(["component", "group"]);
var CONVERTIBLE_TYPES = [...Object.keys(SOLIDS2), ...FLAT, ...CONTAINERS];
// packages/core/src/cad/element-transform.ts
var DEG = Math.PI / 180;
// packages/core/src/cad/scene-evidence.ts
var PRESENTATION = new Set(["layer", "layerId", "name", "description", "visible", "locked", "selected", "color", "opacity", "wireframe", "linewidth", "originalData"]);
// packages/core/src/cad/fasteners.ts
var t = (d, pitch, tapDrill, fine, medium, coarse, headDiameter, headHeight, counterboreDiameter, counterboreDepth, countersinkDiameter) => ({
  name: `M${d}`,
  d,
  pitch,
  tapDrill,
  clearance: { fine, medium, coarse },
  headDiameter,
  headHeight,
  counterboreDiameter,
  counterboreDepth,
  countersinkDiameter
});
var METRIC_THREADS = [
  t(2, 0.4, 1.6, 2.2, 2.4, 2.6, 3.8, 2, 4.5, 2.4, 4),
  t(2.5, 0.45, 2.05, 2.7, 2.9, 3.1, 4.5, 2.5, 5.5, 3, 5),
  t(3, 0.5, 2.5, 3.2, 3.4, 3.6, 5.5, 3, 6.5, 3.4, 6),
  t(4, 0.7, 3.3, 4.3, 4.5, 4.8, 7, 4, 8, 4.6, 8),
  t(5, 0.8, 4.2, 5.3, 5.5, 5.8, 8.5, 5, 10, 5.7, 10),
  t(6, 1, 5, 6.4, 6.6, 7, 10, 6, 11, 6.8, 12),
  t(8, 1.25, 6.8, 8.4, 9, 10, 13, 8, 15, 9, 16),
  t(10, 1.5, 8.5, 10.5, 11, 12, 16, 10, 18, 11, 20),
  t(12, 1.75, 10.2, 13, 13.5, 14.5, 18, 12, 20, 13, 24),
  t(14, 2, 12, 15, 15.5, 16.5, 21, 14, 24, 15, 27),
  t(16, 2, 14, 17, 17.5, 18.5, 24, 16, 26, 17.5, 30),
  t(20, 2.5, 17.5, 21, 22, 24, 30, 20, 33, 21.5, 36),
  t(24, 3, 21, 25, 26, 28, 36, 24, 40, 25.5, 43),
  t(30, 3.5, 26.5, 31, 33, 35, 45, 30, 50, 32, 54)
];
// packages/core/src/cad/dfm.ts
var GRAZING = Math.cos(65 * Math.PI / 180);
// packages/core/src/cam/ir.ts
var Positive = Finite.check(isGreaterThan2(0));
var NonNegative = Finite.check(isGreaterThanOrEqualTo2(0));
var RotarySchema = Struct({
  a: optionalKey2(Finite),
  b: optionalKey2(Finite),
  c: optionalKey2(Finite)
});
var RapidSchema = TaggedStruct("Rapid", {
  to: Vec3Schema,
  rotary: optionalKey2(RotarySchema)
});
var LinearSchema = TaggedStruct("Linear", {
  to: Vec3Schema,
  feed: Positive,
  rotary: optionalKey2(RotarySchema)
});
var ArcSchema2 = TaggedStruct("Arc", {
  to: Vec3Schema,
  center: Vec2Schema,
  clockwise: Boolean3,
  feed: Positive
});
var DwellSchema = TaggedStruct("Dwell", { seconds: NonNegative });
var CommentSchema = TaggedStruct("Comment", { text: String4 });
var OrientSchema = TaggedStruct("Orient", {
  a: optionalKey2(Finite),
  b: optionalKey2(Finite),
  c: optionalKey2(Finite)
});
var CycleKindSchema = Literals(["drill", "dwell", "peck", "chipBreak"]);
var CycleSchema = TaggedStruct("Cycle", {
  cycle: CycleKindSchema,
  to: Vec3Schema,
  feed: Positive,
  peckDepth: NonNegative,
  dwellSeconds: NonNegative,
  retractHeight: Finite
});
var MoveSchema = Union2([
  RapidSchema,
  LinearSchema,
  ArcSchema2,
  DwellSchema,
  CommentSchema,
  CycleSchema,
  OrientSchema
]);
var CoolantSchema = Literals(["off", "flood", "mist"]);
var ProgramUnitsSchema = Literals(["mm", "inch"]);
var WorkOffsetSchema = Literals(["G54", "G55", "G56", "G57", "G58", "G59"]);
var ToolpathSchema = Struct({
  id: String4.check(isMinLength(1)),
  name: String4,
  toolId: String4.check(isMinLength(1)),
  spindleRpm: NonNegative,
  coolant: CoolantSchema,
  moves: ArraySchema(MoveSchema)
});
var ProgramSchema = Struct({
  name: String4.check(isMinLength(1)),
  units: ProgramUnitsSchema,
  workOffset: WorkOffsetSchema,
  toolpaths: ArraySchema(ToolpathSchema),
  metadata: optionalKey2(Record(String4, String4))
});
var decodeToolpath = decodeUnknownEffect2(ToolpathSchema);
var encodeToolpath = encodeEffect(ToolpathSchema);
var decodeProgram = decodeUnknownEffect2(ProgramSchema);
var encodeProgram = encodeEffect(ProgramSchema);
var MachineProfileSchema = Struct({
  id: String4.check(isMinLength(1)),
  travel: Struct({
    minX: Finite,
    maxX: Finite,
    minY: Finite,
    maxY: Finite,
    minZ: Finite,
    maxZ: Finite
  }),
  maxFeed: optionalKey2(Positive),
  maxSpindleRpm: optionalKey2(NonNegative),
  rotary: optionalKey2(Struct({
    a: optionalKey2(Struct({ min: Finite, max: Finite })),
    b: optionalKey2(Struct({ min: Finite, max: Finite })),
    c: optionalKey2(Struct({ min: Finite, max: Finite }))
  })),
  tools: optionalKey2(ArraySchema(Struct({ id: String4.check(isMinLength(1)) })))
});
var validateProgramInput = decodeUnknownSync(ProgramSchema, { errors: "all" });
var validateMachineInput = decodeUnknownSync(MachineProfileSchema, { errors: "all" });
// packages/core/src/cam/tool.ts
var ToolKindSchema = Literals(["endmill", "ballnose", "drill", "vbit", "facemill"]);
var NonNegative2 = Finite.check(isGreaterThanOrEqualTo2(0));
var Positive2 = Finite.check(isGreaterThan2(0));
var ToolSchema = Struct({
  id: String4.check(isMinLength(1)),
  name: String4,
  kind: ToolKindSchema,
  diameter: Positive2,
  flutes: Int.check(isGreaterThanOrEqualTo2(1)),
  maxRpm: Positive2,
  stickout: optionalKey2(Positive2),
  angle: optionalKey2(Finite.check(isBetween({ minimum: 1, maximum: 180 }))),
  tipRadius: optionalKey2(Positive2)
});
var decodeTool = decodeUnknownEffect2(ToolSchema);
var encodeTool = encodeEffect(ToolSchema);
var StockSchema = Struct({
  x: Positive2,
  y: Positive2,
  z: Positive2,
  origin: Struct({ x: Finite, y: Finite, z: Finite }),
  material: String4
});
var decodeStock = decodeUnknownEffect2(StockSchema);
var encodeStock = encodeEffect(StockSchema);
// packages/core/src/cam/indexing.ts
var DEG2 = 180 / Math.PI;
var RAD = Math.PI / 180;
// packages/core/src/cam/params.ts
var NonNegative3 = Finite.check(isGreaterThanOrEqualTo2(0));
var Positive3 = Finite.check(isGreaterThan2(0));
var withDefault2 = (schema, value) => withConstructorDefault2(succeed5(value))(withDecodingDefaultTypeKey(succeed5(value))(schema));
var OperationFields = {
  id: withDefault2(String4.check(isMinLength(1)), "operation"),
  name: withDefault2(String4, "Operation"),
  clearanceHeight: withDefault2(Finite, 10),
  safeHeight: withDefault2(Finite, 5),
  retractHeight: withDefault2(Finite, 2),
  totalDepth: Positive3,
  stepdown: Positive3,
  feed: withDefault2(Positive3, 800),
  plungeFeed: withDefault2(Positive3, 300),
  spindleRpm: withDefault2(Positive3, 1e4),
  coolant: withDefault2(CoolantSchema, "off")
};
var heightsOrdered = makeFilter2((p) => p.clearanceHeight >= p.safeHeight && p.safeHeight >= p.retractHeight ? undefined : "heights must satisfy clearanceHeight >= safeHeight >= retractHeight");
// packages/core/src/cam/operations/profile.ts
var ProfileSideSchema = Literals(["outside", "inside", "onLine"]);
var LeadInSchema = Literals(["direct", "ramp", "helix", "arc"]);
var TabSchema = Struct({
  position: Finite.check(isBetween({ minimum: 0, maximum: 1 })),
  width: NonNegative3,
  height: NonNegative3
});

class ProfileParams extends Class3("cam/ProfileParams")(Struct({
  ...OperationFields,
  side: withDefault2(ProfileSideSchema, "outside"),
  climb: withDefault2(Boolean3, true),
  allowance: withDefault2(NonNegative3, 0),
  leadIn: withDefault2(LeadInSchema, "direct"),
  helixPitch: withDefault2(Positive3, 1),
  helixRadius: withDefault2(NonNegative3, 0),
  leadRadius: withDefault2(Positive3, 2),
  rampAngle: withDefault2(Finite.check(isBetween({ minimum: 0.1, maximum: 45 })), 3),
  tabs: withDefault2(ArraySchema(TabSchema), []),
  arcFit: withDefault2(Boolean3, false),
  tolerance: withDefault2(Positive3, 0.01)
}).check(heightsOrdered)) {
}
// packages/core/src/cam/operations/pocket.ts
var PocketEntrySchema = Literals(["plunge", "ramp", "helix"]);
var PocketOrderSchema = Literals(["insideOut", "outsideIn"]);

class PocketParams extends Class3("cam/PocketParams")(Struct({
  ...OperationFields,
  stepover: withDefault2(Finite.check(isBetween({ minimum: 1, maximum: 100 })), 40),
  allowance: withDefault2(NonNegative3, 0),
  finishPass: withDefault2(Boolean3, false),
  climb: withDefault2(Boolean3, true),
  entry: withDefault2(PocketEntrySchema, "helix"),
  order: withDefault2(PocketOrderSchema, "insideOut"),
  helixPitch: withDefault2(Positive3, 1),
  helixRadius: withDefault2(NonNegative3, 0),
  rampAngle: withDefault2(Finite.check(isBetween({ minimum: 0.1, maximum: 45 })), 3),
  tolerance: withDefault2(Positive3, 0.01),
  toolCentre: withDefault2(Boolean3, false)
}).check(heightsOrdered)) {
}
// packages/core/src/cam/operations/drill.ts
var { stepdown: _stepdown, feed: _feed, ...commonFields } = OperationFields;

class DrillParams extends Class3("cam/DrillParams")(Struct({
  ...commonFields,
  peck: withDefault2(NonNegative3, 0),
  chipBreak: withDefault2(Boolean3, false),
  dwell: withDefault2(NonNegative3, 0)
}).check(heightsOrdered)) {
}
// packages/core/src/cam/operations/face.ts
class FaceParams extends Class3("cam/FaceParams")(Struct({
  ...OperationFields,
  stepover: withDefault2(Finite.check(isBetween({ minimum: 1, maximum: 100 })), 60),
  overshoot: withDefault2(NonNegative3, 0),
  alongX: withDefault2(Boolean3, true),
  tolerance: withDefault2(Positive3, 0.01)
}).check(heightsOrdered)) {
}
// packages/core/src/cam/operations/engrave.ts
class EngraveParams extends Class3("cam/EngraveParams")(Struct({
  ...OperationFields,
  tolerance: withDefault2(Positive3, 0.01)
}).check(heightsOrdered)) {
}
// packages/core/src/cam/operations/adaptive.ts
class AdaptiveParams extends Class3("cam/AdaptiveParams")(Struct({
  ...OperationFields,
  engagement: withDefault2(Finite.check(isBetween({ minimum: 1, maximum: 50 })), 12),
  climb: withDefault2(Boolean3, true),
  helixPitch: withDefault2(Positive3, 1),
  tolerance: withDefault2(Positive3, 0.01)
}).check(heightsOrdered)) {
}

// packages/core/src/cam/operations/surface.ts
var SurfaceStrategySchema = Literals(["roughing", "parallel", "waterline", "rest"]);
var RestFromSchema = Struct({
  diameter: Positive3,
  kind: withDefault2(ToolKindSchema, "endmill"),
  tipRadius: optionalKey2(Positive3),
  allowance: optionalKey2(NonNegative3)
});

class SurfaceParams extends Class3("cam/SurfaceParams")(Struct({
  ...OperationFields,
  strategy: withDefault2(SurfaceStrategySchema, "roughing"),
  stepover: withDefault2(Finite.check(isBetween({ minimum: 1, maximum: 100 })), 40),
  scallop: withDefault2(NonNegative3, 0),
  angle: withDefault2(Finite, 0),
  oneWay: withDefault2(Boolean3, false),
  climb: withDefault2(Boolean3, true),
  allowance: withDefault2(NonNegative3, 0),
  tolerance: withDefault2(Positive3, 0.01),
  entry: withDefault2(PocketEntrySchema, "helix"),
  helixPitch: withDefault2(Positive3, 1),
  rampAngle: withDefault2(Finite.check(isBetween({ minimum: 0.1, maximum: 45 })), 3),
  restFrom: optionalKey2(RestFromSchema),
  restThreshold: withDefault2(Positive3, 0.02),
  clearing: withDefault2(Literals(["contour", "adaptive"]), "contour"),
  engagement: withDefault2(Finite.check(isBetween({ minimum: 1, maximum: 50 })), 12)
}).check(heightsOrdered)) {
}
// packages/core/src/cam/operations/thread.ts
class ThreadParams extends Class3("cam/ThreadParams")(Struct({
  ...OperationFields,
  stepdown: withDefault2(Positive3, 1e6),
  x: withDefault2(Finite, 0),
  y: withDefault2(Finite, 0),
  diameter: Positive3,
  pitch: Positive3,
  internal: withDefault2(Boolean3, true),
  rightHand: withDefault2(Boolean3, true),
  climb: withDefault2(Boolean3, true),
  passes: withDefault2(Int.check(isBetween({ minimum: 1, maximum: 20 })), 2),
  springPasses: withDefault2(Int.check(isBetween({ minimum: 0, maximum: 5 })), 0),
  compensateFeed: withDefault2(Boolean3, true),
  leadIn: withDefault2(Finite.check(isBetween({ minimum: 0.1, maximum: 2 })), 0.5),
  tolerance: withDefault2(NonNegative3, 0.01)
}).check(heightsOrdered)) {
}
// packages/core/src/cam/operations/multiaxis.ts
var MultiaxisStrategySchema = Literals(["parallel", "contour"]);
var ToolAxisSchema = Literals(["normal", "lead"]);
var Degrees = Finite.check(isBetween({ minimum: -85, maximum: 85 }));

class MultiaxisParams extends Class3("cam/MultiaxisParams")(Struct({
  ...OperationFields,
  strategy: withDefault2(MultiaxisStrategySchema, "parallel"),
  stepover: withDefault2(Finite.check(isBetween({ minimum: 1, maximum: 100 })), 30),
  scallop: withDefault2(NonNegative3, 0),
  angle: withDefault2(Finite, 0),
  oneWay: withDefault2(Boolean3, false),
  toolAxis: withDefault2(ToolAxisSchema, "normal"),
  lead: withDefault2(Degrees, 10),
  tilt: withDefault2(Degrees, 0),
  gouge: withDefault2(Boolean3, true),
  gougeAngle: withDefault2(Finite.check(isBetween({ minimum: 1, maximum: 85 })), 30),
  gougeClearance: withDefault2(NonNegative3, 0.02),
  maxRotaryStep: withDefault2(Finite.check(isBetween({ minimum: 1, maximum: 180 })), 30),
  sampling: withDefault2(Positive3, 0.5),
  tolerance: withDefault2(Positive3, 0.01),
  flute: withDefault2(Finite.check(isBetween({ minimum: 0.5, maximum: 6 })), 2)
}).check(heightsOrdered)) {
}
var RAD2 = Math.PI / 180;
// packages/core/src/cam/generator/cycles.ts
var FixedCycleType = {
  DRILLING: "drilling",
  DRILLING_DWELL: "drilling_dwell",
  PECK_DRILLING: "peck_drilling",
  RIGHT_TAPPING: "right_tapping",
  BORING: "boring",
  BORING_DWELL: "boring_dwell",
  BACK_BORING: "back_boring",
  LEFT_TAPPING: "left_tapping",
  BORING_WITH_RETRACT: "boring_retract",
  CUSTOM: "custom"
};
var WORDS = {
  G81: FixedCycleType.DRILLING,
  G82: FixedCycleType.DRILLING_DWELL,
  G83: FixedCycleType.PECK_DRILLING,
  G84: FixedCycleType.RIGHT_TAPPING,
  G85: FixedCycleType.BORING,
  G86: FixedCycleType.BORING_DWELL,
  G87: FixedCycleType.BACK_BORING,
  G88: FixedCycleType.CUSTOM,
  G74: FixedCycleType.LEFT_TAPPING,
  G89: FixedCycleType.BORING_WITH_RETRACT
};
var CODE_OF = {
  [FixedCycleType.DRILLING]: "G81",
  [FixedCycleType.DRILLING_DWELL]: "G82",
  [FixedCycleType.PECK_DRILLING]: "G83",
  [FixedCycleType.RIGHT_TAPPING]: "G84",
  [FixedCycleType.BORING]: "G85",
  [FixedCycleType.BORING_DWELL]: "G86",
  [FixedCycleType.BACK_BORING]: "G87",
  [FixedCycleType.LEFT_TAPPING]: "G74",
  [FixedCycleType.BORING_WITH_RETRACT]: "G89",
  [FixedCycleType.CUSTOM]: "G81"
};

// packages/core/src/cam/model/dexel.ts
var EMPTY = new Float64Array(0);

// packages/core/src/cam/model/model.ts
var BOOLEANS2 = new Set(["boolean-union", "boolean-subtract", "boolean-intersect"]);

// packages/core/src/cam/generator/unified-geometry.ts
var SOLID_TYPES = new Set([
  "cube",
  "sphere",
  "hemisphere",
  "cylinder",
  "cone",
  "capsule",
  "pyramid",
  "prism",
  "ellipsoid",
  "rectangle",
  "circle",
  "polygon",
  "ellipse",
  "triangle",
  "mesh",
  "custom",
  "imported"
]);

// packages/core/src/cam/generator/schema.ts
var Num2 = Finite;
var PositiveInt = Int.check(isGreaterThan2(0));
var Percent = Finite.check(isGreaterThan2(0), isLessThanOrEqualTo2(100));
var MachineTypeSchema = Literals(["mill", "lathe", "3dprinter"]);
var MillOperationSchema = Literals(["contour", "pocket", "drill", "engrave", "profile", "threading", "3d_surface", "probing", "multiaxis"]);
var LatheOperationSchema = Literals(["facing", "turning", "boring", "threading", "grooving", "parting", "knurling"]);
var PrinterOperationSchema = Literals(["standard", "vase", "support", "infill", "raft", "brim"]);
var OperationTypeSchema = Union2([MillOperationSchema, LatheOperationSchema, PrinterOperationSchema]);
var MaterialTypeSchema = Literals(["aluminum", "steel", "wood", "plastic", "brass", "titanium", "composite", "other"]);
var ToolTypeSchema = Literals(["endmill", "ballnose", "drill", "vbit", "chamfer", "threadmill", "reamer", "probe", "toolsetter"]);
var LatheToolTypeSchema = Literals(["turning", "facing", "threading", "grooving", "boring", "parting"]);
var PrinterNozzleSchema = Literals(["brass", "hardened", "ruby", "standard"]);
var AllToolTypeSchema = Union2([ToolTypeSchema, LatheToolTypeSchema, PrinterNozzleSchema]);
var OriginTypeSchema = Literals(["workpiece-center", "workpiece-corner", "workpiece-corner2", "machine-zero", "custom"]);
var GeometryTypeSchema = Literals([
  "rectangle",
  "circle",
  "polygon",
  "custom",
  "selected",
  "cube",
  "sphere",
  "cylinder",
  "cone",
  "extrude",
  "line",
  "pyramid",
  "hemisphere",
  "ellipsoid",
  "capsule",
  "triangle",
  "ellipse",
  "prism"
]);
var ToolpathSettingsSchema = Struct({
  machineType: withDefault2(MachineTypeSchema, "mill"),
  operationType: withDefault2(OperationTypeSchema, "contour"),
  material: withDefault2(MaterialTypeSchema, "aluminum"),
  toolType: withDefault2(AllToolTypeSchema, "endmill"),
  toolDiameter: withDefault2(Positive3, 6),
  flutes: withDefault2(PositiveInt, 2),
  depth: withDefault2(Positive3, 5),
  stepdown: withDefault2(Positive3, 1),
  stepover: withDefault2(Percent, 40),
  feedrate: withDefault2(Positive3, 800),
  plungerate: withDefault2(Positive3, 300),
  rpm: withDefault2(Positive3, 1e4),
  tolerance: withDefault2(NonNegative3, 0.01),
  offset: withDefault2(Literals(["inside", "outside", "center"]), "outside"),
  direction: withDefault2(Literals(["climb", "conventional"]), "climb"),
  coolant: withDefault2(Boolean3, true),
  finishingPass: withDefault2(Boolean3, false),
  finishingAllowance: withDefault2(NonNegative3, 0.2),
  finishingStrategy: withDefault2(Literals(["contour", "parallel", "spiral", "radial"]), "contour"),
  surfaceStrategy: withDefault2(Literals(["roughing", "parallel", "waterline"]), "roughing"),
  surfaceClearing: withDefault2(Literals(["contour", "adaptive"]), "contour"),
  adaptiveEngagement: withDefault2(Finite.check(isBetween({ minimum: 1, maximum: 50 })), 12),
  scallop: withDefault2(NonNegative3, 0),
  rasterAngle: withDefault2(Num2, 0),
  rasterOneWay: withDefault2(Boolean3, false),
  useAI: withDefault2(Boolean3, false),
  aiDifficulty: withDefault2(Literals(["simple", "moderate", "complex"]), "moderate"),
  aiOptimize: withDefault2(Literals(["speed", "quality", "balance"]), "balance"),
  optimizePath: withDefault2(Boolean3, false),
  useArcFitting: withDefault2(Boolean3, false),
  useHighSpeedMode: withDefault2(Boolean3, false),
  useExactStop: withDefault2(Boolean3, false),
  useToolCompensation: withDefault2(Boolean3, false),
  useAdaptiveFeeds: withDefault2(Boolean3, false),
  useRestMachining: withDefault2(Boolean3, false),
  restToolDiameter: withDefault2(Positive3, 10),
  fiveAxisStrategy: withDefault2(Literals(["parallel", "contour"]), "parallel"),
  fiveAxisToolAxis: withDefault2(Literals(["normal", "lead"]), "lead"),
  fiveAxisLead: withDefault2(Finite.check(isBetween({ minimum: -85, maximum: 85 })), 10),
  fiveAxisTilt: withDefault2(Finite.check(isBetween({ minimum: -85, maximum: 85 })), 0),
  fiveAxisGouge: withDefault2(Boolean3, true),
  toolNumber: withDefault2(PositiveInt, 1),
  workOffset: withDefault2(Literals(["G54", "G55", "G56", "G57", "G58", "G59"]), "G54"),
  probeCycle: withDefault2(Literals(["zSurface", "edgeX", "edgeY", "corner", "bore", "boss", "toolLength"]), "zSurface"),
  probeFeed: withDefault2(Positive3, 100),
  probeSearch: withDefault2(Positive3, 10),
  probeStylus: withDefault2(Positive3, 4),
  probeDialect: withDefault2(Literals(["linuxcnc", "fanuc"]), "linuxcnc"),
  probeFeatureSize: withDefault2(Positive3, 20),
  threadPitch: withDefault2(Positive3, 1.5),
  threadType: withDefault2(Literals(["internal", "external"]), "internal"),
  threadHand: withDefault2(Literals(["right", "left"]), "right"),
  threadPasses: withDefault2(Int.check(isBetween({ minimum: 1, maximum: 20 })), 2),
  threadSpringPasses: withDefault2(Int.check(isBetween({ minimum: 0, maximum: 5 })), 0),
  latheZero: withDefault2(Literals(["face", "chuck"]), "face"),
  bedOrigin: withDefault2(Literals(["corner", "center"]), "corner"),
  nozzleDiameter: withDefault2(Positive3, 0.4),
  filamentDiameter: withDefault2(Positive3, 1.75),
  layerHeight: withDefault2(Positive3, 0.2),
  extrusionWidth: withDefault2(Positive3, 0.4),
  printSpeed: withDefault2(Positive3, 60),
  printTemperature: withDefault2(Positive3, 200),
  bedWidth: withDefault2(Positive3, 220),
  bedDepth: withDefault2(Positive3, 220),
  centerOnBed: withDefault2(Boolean3, true),
  bedTemperature: withDefault2(NonNegative3, 60),
  stockDiameter: withDefault2(Positive3, 50),
  stockLength: withDefault2(Positive3, 100),
  spindleDirection: withDefault2(Literals(["cw", "ccw"]), "cw"),
  turningOperation: withDefault2(Literals(["external", "internal", "face"]), "external"),
  applyToolCompensation: withDefault2(Boolean3, true),
  originType: withDefault2(OriginTypeSchema, "workpiece-center"),
  originX: withDefault2(Num2, 0),
  originY: withDefault2(Num2, 0),
  originZ: withDefault2(Num2, 0)
});
var DEFAULT_SETTINGS = decodeUnknownSync(ToolpathSettingsSchema)({});
var StockSchema2 = Struct({
  width: Positive3,
  height: Positive3,
  depth: Positive3,
  radius: withDefault2(NonNegative3, 0),
  x: withDefault2(Num2, 0),
  y: withDefault2(Num2, 0),
  topZ: withDefault2(Num2, 0),
  allowance: withDefault2(NonNegative3, 1),
  material: optionalKey2(String4),
  elementId: optionalKey2(String4)
});
var CadElementSchema = Record(String4, Unknown2);
var GeometrySchema = Struct({
  geometryType: withDefault2(GeometryTypeSchema, "rectangle"),
  rectangleWidth: withDefault2(Positive3, 100),
  rectangleHeight: withDefault2(Positive3, 50),
  circleRadius: withDefault2(Positive3, 25),
  polygonSides: withDefault2(Int.check(isGreaterThanOrEqualTo2(3)), 6),
  polygonRadius: withDefault2(Positive3, 30),
  customPath: withDefault2(String4, ""),
  selectedElements: withDefault2(ArraySchema(CadElementSchema), []),
  stock: optionalKey2(StockSchema2)
});
var DEFAULT_GEOMETRY = decodeUnknownSync(GeometrySchema)({});
var PrinterExtrasSchema = Struct({
  infillDensity: withDefault2(Finite.check(isBetween({ minimum: 0, maximum: 100 })), 20),
  infillPattern: withDefault2(Literals(["grid", "lines", "triangles", "honeycomb"]), "grid"),
  supportType: withDefault2(Literals(["none", "minimal", "full"]), "minimal"),
  shellCount: withDefault2(PositiveInt, 2),
  printResolution: withDefault2(Literals(["standard", "high", "low"]), "standard"),
  printOrientation: withDefault2(Literals(["original", "auto-optimal"]), "original")
});
var DEFAULT_PRINTER_EXTRAS = decodeUnknownSync(PrinterExtrasSchema)({});
var RotaryRangeSchema = Struct({ min: Finite, max: Finite });
var MachineForProgramSchema = Struct({
  id: String4,
  name: withDefault2(String4, ""),
  axes: withDefault2(Literals([3, 4, 5]), 3),
  controller: withDefault2(String4, "generic"),
  fiveAxis: optionalKey2(Struct({
    layout: Literals(["table-AC", "table-BC"]),
    tilt: RotaryRangeSchema,
    rotation: optionalKey2(RotaryRangeSchema),
    pivot: optionalKey2(Struct({ x: Finite, y: Finite, z: Finite })),
    tcp: withDefault2(Literals(["control", "program"]), "control")
  }))
});
var GenerateRequestSchema = Struct({
  settings: withDefault2(ToolpathSettingsSchema, DEFAULT_SETTINGS),
  geometry: withDefault2(GeometrySchema, DEFAULT_GEOMETRY),
  printer: withDefault2(PrinterExtrasSchema, DEFAULT_PRINTER_EXTRAS),
  machine: optionalKey2(MachineForProgramSchema),
  stamp: optionalKey2(String4)
});
var GcodeStatsSchema = Struct({
  lines: Int,
  cutLength: Finite,
  rapidLength: Finite,
  minZ: Finite,
  maxZ: Finite,
  estimatedSeconds: Finite,
  bounds: Struct({
    min: Struct({ x: Finite, y: Finite, z: Finite }),
    max: Struct({ x: Finite, y: Finite, z: Finite })
  })
});
var GenerateResponseSchema = Struct({
  gcode: String4,
  cycles: ArraySchema(Struct({ gcode: String4 })),
  warnings: ArraySchema(String4),
  stats: GcodeStatsSchema,
  program: ProgramSchema
});
var ParseRequestSchema = Struct({
  gcode: String4,
  name: withDefault2(String4, "Program")
});
var ParseResponseSchema = Struct({
  warnings: ArraySchema(String4),
  stats: GcodeStatsSchema,
  program: ProgramSchema
});
var SuggestRequestSchema = Struct({
  settings: withDefault2(ToolpathSettingsSchema, DEFAULT_SETTINGS),
  geometry: withDefault2(GeometrySchema, DEFAULT_GEOMETRY)
});
var SuggestResponseSchema = Struct({
  parameters: optionalKey2(Struct({
    depth: Finite,
    stepdown: Finite,
    operationType: OperationTypeSchema
  })),
  suggestions: ArraySchema(String4),
  feedback: String4,
  statistics: Struct({
    cuttingSpeed: Finite,
    chipLoad: Finite,
    materialRemovalRate: Finite,
    effectiveStepover: Finite
  }),
  operation: Struct({ title: String4, description: String4 }),
  warnings: ArraySchema(String4)
});
// packages/core/src/cam/verify/schema.ts
var VerifyToolKindSchema = Literals(["endmill", "ballnose", "drill", "vbit", "facemill"]);
var VerifyToolSchema = Struct({
  kind: withDefault2(VerifyToolKindSchema, "endmill"),
  diameter: Positive3,
  cuttingLength: optionalKey2(Positive3),
  shankDiameter: optionalKey2(Positive3),
  stickout: optionalKey2(Positive3),
  holderDiameter: optionalKey2(Positive3),
  holderLength: optionalKey2(Positive3),
  angle: optionalKey2(Finite.check(isBetween({ minimum: 1, maximum: 179 }))),
  tipRadius: optionalKey2(Positive3)
});
var BoundsSchema = Struct({
  minX: Finite,
  maxX: Finite,
  minY: Finite,
  maxY: Finite,
  minZ: Finite,
  maxZ: Finite
});
var VerifyFixtureSchema = Struct({
  id: String4.check(isMinLength(1)),
  bounds: BoundsSchema
});
var VerifyRequestSchema = Struct({
  gcode: optionalKey2(String4),
  program: optionalKey2(ProgramSchema),
  stock: BoundsSchema,
  tool: VerifyToolSchema,
  fixtures: withDefault2(ArraySchema(VerifyFixtureSchema), []),
  target: optionalKey2(Struct({ solids: ArraySchema(SolidSchema) })),
  resolution: optionalKey2(Positive3),
  tolerance: withDefault2(NonNegative3, 0.05),
  start: optionalKey2(Vec3Schema)
});
var VerifyCodeSchema = Literals([
  "InvalidInput",
  "InterpreterWarning",
  "RapidInMaterial",
  "ShankCollision",
  "HolderCollision",
  "FixtureCollision",
  "BelowStock",
  "Gouge",
  "UncutStock",
  "ResolutionCoarsened"
]);
var VerifySeveritySchema = Literals(["error", "warning", "info"]);
var VerifyIssueSchema = Struct({
  code: VerifyCodeSchema,
  severity: VerifySeveritySchema,
  message: String4,
  line: optionalKey2(Int),
  point: optionalKey2(Vec3Schema),
  count: Int,
  fixtureId: optionalKey2(String4)
});
var VerifyStatsSchema = Struct({
  cellSize: Finite,
  cellsX: Int,
  cellsY: Int,
  samples: Int,
  stockVolume: Finite,
  removedVolume: Finite,
  remainingVolume: Finite,
  engagedLength: Finite,
  airCutLength: Finite,
  gougeVolume: optionalKey2(Finite),
  maxGouge: optionalKey2(Finite),
  uncutVolume: optionalKey2(Finite),
  maxUncut: optionalKey2(Finite)
});
var VerifyPreviewSchema = Struct({
  nx: Int,
  ny: Int,
  minX: Finite,
  minY: Finite,
  cellX: Finite,
  cellY: Finite,
  minZ: Finite,
  maxZ: Finite,
  heights: ArraySchema(Finite),
  gouge: ArraySchema(Int)
});
var VerifyResponseSchema = Struct({
  ok: Boolean3,
  issues: ArraySchema(VerifyIssueSchema),
  stats: VerifyStatsSchema,
  preview: VerifyPreviewSchema
});
// packages/plugin-sdk/examples/hello-gear/index.ts
var gearEntity = (id) => ({
  ...baseEntity(id),
  _tag: "Polyline",
  points: regularPolygon({ x: 0, y: 0 }, 10, 24),
  closed: true
});
var helloPost = (program) => {
  const header = `(hello-gear: ${program.name})`;
  return program.toolpaths.length === 0 ? `${header}
` : `${header}
(; replace this block with a real dialect)
M30
`;
};
var hello_gear_default = definePlugin({
  manifest: {
    id: "com.example.hello-gear",
    name: "Hello Gear",
    version: "1.0.0",
    apiVersion: "1",
    entry: "index.js",
    capabilities: ["drawing:write", "toolpath:read", "storage", "ui:panel"],
    contributes: {
      commands: [{ id: "hello-gear.add", title: "Add a gear" }],
      panels: [{ id: "hello-gear.panel", title: "Gear generator", entry: "panel" }],
      postProcessors: [{ id: "hello-gear.header", title: "Hello Gear header", entry: "post" }]
    },
    dev: true
  },
  activate(ctx) {
    const drawing = requireCapability(ctx, "drawing:write", "drawing");
    const storage = requireCapability(ctx, "storage", "storage");
    const ui = requireCapability(ctx, "ui:panel", "ui");
    ui.registerCommand({ id: "hello-gear.add", title: "Add a gear" });
    ui.registerPanel({ id: "hello-gear.panel", title: "Gear generator", entry: "panel" });
    ctx.drawing?.read();
    storage.set("installedAt", "2026-01-01T00:00:00.000Z");
    return () => {
      drawing.patch({ _tag: "RemoveEntity", id: "gear-demo" });
      storage.delete("installedAt");
    };
  }
});
export {
  hello_gear_default as default,
  gearEntity,
  helloPost
};
