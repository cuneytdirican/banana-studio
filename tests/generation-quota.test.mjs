import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dailyGenerationLimit,
  enforceDailyGenerationQuota,
} from '../api/_lib/generationQuota.ts';

const createResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const createDb = (result) => {
  const chain = {
    select() {
      return chain;
    },
    eq() {
      return chain;
    },
    gte() {
      return Promise.resolve(result);
    },
  };
  return { from: table => (assert.equal(table, 'usage_logs'), chain) };
};

const withLimit = async (limit, run) => {
  if (limit === undefined) delete process.env.BANANA_DAILY_GENERATION_LIMIT;
  else process.env.BANANA_DAILY_GENERATION_LIMIT = String(limit);
  try {
    await run();
  } finally {
    delete process.env.BANANA_DAILY_GENERATION_LIMIT;
  }
};

test('dailyGenerationLimit ignores missing, zero and invalid values', () => {
  delete process.env.BANANA_DAILY_GENERATION_LIMIT;
  assert.equal(dailyGenerationLimit(), 0);
  process.env.BANANA_DAILY_GENERATION_LIMIT = '0';
  assert.equal(dailyGenerationLimit(), 0);
  process.env.BANANA_DAILY_GENERATION_LIMIT = 'not-a-number';
  assert.equal(dailyGenerationLimit(), 0);
  process.env.BANANA_DAILY_GENERATION_LIMIT = '7.8';
  assert.equal(dailyGenerationLimit(), 7);
  delete process.env.BANANA_DAILY_GENERATION_LIMIT;
});

test('a disabled quota does not touch the database', async () => {
  await withLimit(undefined, async () => {
    assert.equal(await enforceDailyGenerationQuota(null, 'user-1', createResponse()), true);
  });
});

test('a positive quota rejects requests at the limit', async () => {
  await withLimit(2, async () => {
    const response = createResponse();
    const allowed = await enforceDailyGenerationQuota(
      createDb({ count: 2, error: null }),
      'user-1',
      response,
    );
    assert.equal(allowed, false);
    assert.equal(response.statusCode, 429);
    assert.equal(response.body.code, 'DAILY_GENERATION_LIMIT');
  });
});

test('a positive quota admits requests below the limit', async () => {
  await withLimit(2, async () => {
    assert.equal(
      await enforceDailyGenerationQuota(createDb({ count: 1, error: null }), 'user-1', createResponse()),
      true,
    );
  });
});

const createRpcDb = (result) => ({
  rpc(name, args) {
    assert.equal(name, 'reserve_generation_quota');
    assert.equal(args.p_limit > 0, true);
    return Promise.resolve(result);
  },
  from() {
    throw new Error('RPC path must not count usage_logs directly');
  },
});

test('an atomic reservation admits the request', async () => {
  await withLimit(2, async () => {
    assert.equal(
      await enforceDailyGenerationQuota(createRpcDb({ data: true, error: null }), 'user-1', createResponse()),
      true,
    );
  });
});

test('an atomic reservation rejects the final slot with 429', async () => {
  await withLimit(1, async () => {
    const response = createResponse();
    assert.equal(
      await enforceDailyGenerationQuota(createRpcDb({ data: false, error: null }), 'user-1', response),
      false,
    );
    assert.equal(response.statusCode, 429);
  });
});

test('a broken reservation RPC fails closed with 503', async () => {
  await withLimit(2, async () => {
    const response = createResponse();
    assert.equal(
      await enforceDailyGenerationQuota(createRpcDb({ data: null, error: { code: 'XX000', message: 'db down' } }), 'user-1', response),
      false,
    );
    assert.equal(response.statusCode, 503);
  });
});

test('a missing reservation RPC falls back to the legacy counter', async () => {
  await withLimit(2, async () => {
    const legacy = createDb({ count: 1, error: null });
    legacy.rpc = async () => ({ data: null, error: { code: 'PGRST202', message: 'missing' } });
    assert.equal(await enforceDailyGenerationQuota(legacy, 'user-1', createResponse()), true);
  });
});

test('quota lookup failures fail closed with 503', async () => {
  await withLimit(2, async () => {
    const response = createResponse();
    const allowed = await enforceDailyGenerationQuota(
      createDb({ count: null, error: { message: 'unavailable' } }),
      'user-1',
      response,
    );
    assert.equal(allowed, false);
    assert.equal(response.statusCode, 503);
  });
});
