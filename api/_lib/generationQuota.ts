import type { VercelResponse } from '@vercel/node';

/**
 * Opt-in per-user daily generation quota. Zero/unset keeps the existing
 * behaviour; a positive integer is counted against usage_logs for the UTC day.
 */
export const dailyGenerationLimit = (): number => {
  const value = Number(process.env.BANANA_DAILY_GENERATION_LIMIT || 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
};

const startOfUtcDay = (): Date => {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return start;
};

/** Records a provider-accepted request so the quota sees every billable path. */
export const recordAcceptedUsage = async (
  db: any,
  input: {
    userId: string;
    action: string;
    model: string;
    prompt?: string;
    imageCount?: number;
    estimatedCost?: number | null;
  },
): Promise<boolean> => {
  try {
    const { error } = await db.from('usage_logs').insert({
      user_id: input.userId,
      action: input.action,
      model: input.model,
      prompt: (input.prompt || '').slice(0, 500),
      image_count: input.imageCount ?? 1,
      estimated_cost: input.estimatedCost ?? null,
    });
    if (error) {
      console.warn('Accepted generation usage could not be recorded', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('Accepted generation usage could not be recorded', error);
    return false;
  }
};

const rejectQuota = (res: VercelResponse, limit: number): false => {
  res.status(429).json({
    code: 'DAILY_GENERATION_LIMIT',
    error: `Daily generation limit reached (${limit}). Try again tomorrow.`,
  });
  return false;
};

const isMissingReservationRpc = (error: any): boolean =>
  error?.code === 'PGRST202' || /reserve_generation_quota/i.test(String(error?.message || ''));

export const enforceDailyGenerationQuota = async (
  db: any,
  userId: string,
  res: VercelResponse,
): Promise<boolean> => {
  const limit = dailyGenerationLimit();
  if (!limit) return true;

  // The RPC reserves the slot atomically. Until the migration is applied (or
  // in the local workspace), fall back to the historical count check so
  // existing installations keep working.
  if (process.env.BANANA_RUNTIME !== 'local' && typeof db?.rpc === 'function') {
    const { data, error } = await db.rpc('reserve_generation_quota', { p_limit: limit });
    if (!error) return data === true ? true : rejectQuota(res, limit);
    if (!isMissingReservationRpc(error)) {
      res.status(503).json({ error: 'Usage quota could not be verified. Try again shortly.' });
      return false;
    }
    console.warn('Atomic quota reservation is unavailable; using the legacy counter.');
  }

  const start = startOfUtcDay();
  const localRuntime = process.env.BANANA_RUNTIME === 'local';
  const { count, error } = await db
    .from('usage_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', localRuntime ? start.getTime() : start.toISOString());

  if (error) {
    res.status(503).json({ error: 'Usage quota could not be verified. Try again shortly.' });
    return false;
  }
  if ((count ?? 0) >= limit) return rejectQuota(res, limit);
  return true;
};
