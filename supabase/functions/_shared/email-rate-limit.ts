// Existing multi-recipient features wait before retrying a rate-limited send.
export async function retryRateLimitedEmail<T>(
  send: () => Promise<T>,
  wait: (milliseconds: number) => Promise<void> = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
): Promise<T> {
  try {
    return await send();
  } catch (error) {
    if (!error || typeof error !== 'object' || !('status' in error) || error.status !== 429) throw error;
    const seconds = 'retryAfterSeconds' in error && typeof error.retryAfterSeconds === 'number'
      ? error.retryAfterSeconds : 60;
    await wait(Math.max(0, seconds) * 1000);
    return send();
  }
}