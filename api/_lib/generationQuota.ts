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

export const enforceDailyGenerationQuota = async (
  db: any,
  userId: string,
  res: VercelResponse,
): Promise<boolean> => {
  const limit = dailyGenerationLimit();
  if (!limit) return true;

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
  if ((count ?? 0) >= limit) {
    res.status(429).json({
      code: 'DAILY_GENERATION_LIMIT',
      error: `Daily generation limit reached (${limit}). Try again tomorrow.`,
    });
    return false;
  }
  return true;
};
