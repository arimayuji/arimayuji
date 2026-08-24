/**
 * Races a promise against a timer — the underlying call in `promise` isn't
 * cancelled (the Appwrite web SDK wires no `AbortSignal` into its `fetch`
 * calls), it just stops blocking whoever's awaiting it. Exists because a
 * request that neither resolves nor rejects (observed on some cellular
 * networks, never on Wi-Fi) otherwise leaves a "loading" state stuck
 * forever — there's nothing to catch, since nothing ever throws.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
