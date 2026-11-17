/**
 * Shared test teardown cleanup.
 * Purpose: remove temp roots without the intermittent ENOTEMPTY rmdir race under parallel tests.
 * Context: session close can still release handles while teardown runs; retries absorb transient failures.
 * Usage: `await removeDir(root)` where teardown previously used a bare recursive force `rm`.
 */
import { rm } from 'node:fs/promises'

/** Remove `path` recursively, retrying transient ENOTEMPTY/EBUSY/EPERM from racing teardown. */
export async function removeDir(path: string): Promise<void> {
  await rm(path, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 50,
  })
}
