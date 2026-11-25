/**
 * Minimal in-memory stand-ins for Mongoose models, for tests that must not need
 * MongoDB. Supports the filters and updates the platform code uses: equality
 * (arrays: "contains"), dotted paths, $ne, $in, $nin, $gt, $lt; $set,
 * $setOnInsert, $inc; upsert. Reads return deep copies (like .lean()).
 */
const mongoose = require('mongoose');

const clone = (value) => {
  if (Array.isArray(value)) return value.map(clone);
  if (value instanceof mongoose.Types.ObjectId || value instanceof Date) return value;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v !== 'function').map(([k, v]) => [k, clone(v)]));
  }
  return value;
};

const idEq = (a, b) => String(a) === String(b);
const getPath = (doc, path) => path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), doc);
const setPath = (doc, path, value) => {
  const keys = path.split('.');
  let cur = doc;
  for (const k of keys.slice(0, -1)) {
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[keys.at(-1)] = value;
};

const isOperatorObject = (cond) => cond && typeof cond === 'object' && !Array.isArray(cond)
  && !(cond instanceof mongoose.Types.ObjectId) && !(cond instanceof Date)
  && Object.keys(cond).some((k) => k.startsWith('$'));

const eq = (actual, expected) => {
  if (expected === null) return actual === null || actual === undefined;
  if (Array.isArray(actual) && !Array.isArray(expected)) return actual.some((a) => idEq(a, expected));
  if (actual instanceof Date && expected instanceof Date) return actual.getTime() === expected.getTime();
  return actual !== undefined && idEq(actual, expected);
};

const matchesValue = (actual, cond) => {
  if (!isOperatorObject(cond)) return eq(actual, cond);
  return Object.entries(cond).every(([op, v]) => {
    switch (op) {
      case '$ne': return !eq(actual, v);
      case '$in': return v.some((x) => eq(actual, x));
      case '$nin': return !v.some((x) => eq(actual, x));
      case '$gt': return actual != null && actual > v;
      case '$lt': return actual != null && actual < v;
      default: throw new Error(`fakeDb: unsupported operator ${op}`);
    }
  });
};

const matches = (doc, filter = {}) => Object.entries(filter).every(([path, cond]) => matchesValue(getPath(doc, path), cond));

const applyUpdate = (doc, update, inserting) => {
  for (const [path, value] of Object.entries(update.$set || {})) setPath(doc, path, clone(value));
  if (inserting) for (const [path, value] of Object.entries(update.$setOnInsert || {})) setPath(doc, path, clone(value));
  for (const [path, value] of Object.entries(update.$inc || {})) setPath(doc, path, (getPath(doc, path) || 0) + value);
};

/** A query that can be awaited directly or through .lean(); .select/.sort are accepted and ignored. */
const query = (fn) => {
  const chain = {
    select: () => chain,
    sort: () => chain,
    lean: async () => clone(fn()),
    then: (resolve, reject) => Promise.resolve().then(() => clone(fn())).then(resolve, reject),
  };
  return chain;
};

/**
 * @param {object[]} docs
 * @param {object}   [options]
 * @param {string[]} [options.unique]   fields with a unique index
 * @param {(doc) => void} [options.onCreate]  validation / defaults hook
 */
const makeModel = (docs = [], { unique = [], onCreate } = {}) => {
  const model = {
    docs: clone(docs),
    writes: 0,
    failNext: null, // { op, error } — throw once on the next matching operation
  };
  const maybeFail = (op) => {
    if (model.failNext && model.failNext.op === op) {
      const { error } = model.failNext;
      model.failNext = null;
      throw error;
    }
  };
  const checkUnique = (doc, except) => {
    for (const field of unique) {
      if (doc[field] !== undefined && model.docs.some((d) => d !== except && idEq(d[field], doc[field]))) {
        const err = new Error(`E11000 duplicate key error collection: ${field}_1 dup key`);
        err.code = 11000;
        throw err;
      }
    }
  };
  const withMethods = (doc) => ({ ...clone(doc), toObject: () => clone(doc), toJSON: () => clone(doc) });

  Object.assign(model, {
    find: (filter) => query(() => model.docs.filter((d) => matches(d, filter))),
    findOne: (filter) => query(() => model.docs.find((d) => matches(d, filter)) ?? null),
    findById: (id) => query(() => model.docs.find((d) => idEq(d._id, id)) ?? null),
    countDocuments: async (filter) => model.docs.filter((d) => matches(d, filter)).length,
    create: async (input) => {
      maybeFail('create');
      const doc = { _id: new mongoose.Types.ObjectId(), ...clone(input) };
      if (onCreate) onCreate(doc);
      checkUnique(doc);
      model.writes += 1;
      model.docs.push(doc);
      return withMethods(doc);
    },
    updateOne: async (filter, update, { upsert } = {}) => {
      maybeFail('updateOne');
      model.writes += 1;
      const doc = model.docs.find((d) => matches(d, filter));
      if (doc) {
        applyUpdate(doc, update, false);
        return { matchedCount: 1, modifiedCount: 1 };
      }
      if (!upsert) return { matchedCount: 0, modifiedCount: 0 };
      const fresh = { _id: new mongoose.Types.ObjectId() };
      for (const [k, v] of Object.entries(filter)) if (!isOperatorObject(v)) setPath(fresh, k, clone(v));
      applyUpdate(fresh, update, true);
      model.docs.push(fresh);
      return { matchedCount: 0, upsertedCount: 1 };
    },
    updateMany: async (filter, update) => {
      maybeFail('updateMany');
      model.writes += 1;
      const docs = model.docs.filter((d) => matches(d, filter));
      for (const doc of docs) applyUpdate(doc, update, false);
      return { matchedCount: docs.length, modifiedCount: docs.length };
    },
    findOneAndUpdate: (filter, update) => query(() => {
      const doc = model.docs.find((d) => matches(d, filter));
      if (!doc) return null;
      model.writes += 1;
      applyUpdate(doc, update, false);
      return doc;
    }),
    findOneAndDelete: (filter) => query(() => {
      const i = model.docs.findIndex((d) => matches(d, filter));
      if (i < 0) return null;
      model.writes += 1;
      return model.docs.splice(i, 1)[0];
    }),
    deleteMany: async (filter) => {
      model.writes += 1;
      const before = model.docs.length;
      model.docs = model.docs.filter((d) => !matches(d, filter));
      return { deletedCount: before - model.docs.length };
    },
    deleteOne: async (filter) => {
      model.writes += 1;
      const i = model.docs.findIndex((d) => matches(d, filter));
      if (i >= 0) model.docs.splice(i, 1);
      return { deletedCount: i >= 0 ? 1 : 0 };
    },
  });
  return model;
};

module.exports = { clone, idEq, matches, makeModel };
