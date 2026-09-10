import { describe, expect, it, vi } from "vitest";
import { WorkerLeaseCoordinator, type LeaseRepository } from "../workerLease";
import { startWorker } from "../../worker";

function fakeRepository(_clock: () => Date): LeaseRepository {
  let ownerToken: string | null = null;
  let leaseUntil: Date | null = null;
  return {
    async acquire(owner, now, ttlMs) {
      if (ownerToken && leaseUntil && leaseUntil > now && ownerToken !== owner) return false;
      ownerToken = owner;
      leaseUntil = new Date(now.getTime() + ttlMs);
      return true;
    },
    async renew(owner, now, ttlMs) {
      if (ownerToken !== owner || !leaseUntil || leaseUntil <= now) return false;
      leaseUntil = new Date(now.getTime() + ttlMs);
      return true;
    },
    async release(owner) {
      if (ownerToken === owner) {
        ownerToken = null;
        leaseUntil = null;
      }
    },
    async status() { return { ownerToken, leaseUntil }; },
  };
}

describe("Lot 7 worker lease acceptance", () => {
  it("fences a second coordinator, renews, then hands over after release/expiry", async () => {
    let now = new Date("2026-01-01T00:00:00.000Z");
    const repo = fakeRepository(() => now);
    const first = new WorkerLeaseCoordinator(repo, "first", 100);
    const second = new WorkerLeaseCoordinator(repo, "second", 100);
    expect(await first.tryAcquire(now)).toBe(true);
    expect(await second.tryAcquire(now)).toBe(false);
    expect(await second.executeIfLeader(async () => "must-not-run")).toBeUndefined();
    expect(await first.executeIfLeader(async () => "runs")).toBe("runs");
    now = new Date(now.getTime() + 50);
    expect(await first.renew(now)).toBe(true);
    now = new Date(now.getTime() + 101);
    expect(await first.renew(now)).toBe(false);
    expect(await second.tryAcquire(now)).toBe(true);
    await second.release();
  });

  it("stops trading immediately when the renewal loses the lease", async () => {
    let now = new Date("2026-01-01T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const repo = fakeRepository(() => now);
    const lease = new WorkerLeaseCoordinator(repo, "owner", 100);
    const start = vi.fn();
    const stop = vi.fn();
    const worker = startWorker({
      lease, start, stop, initialTick: false, retryMs: 10_000,
      setIntervalFn: (() => 1) as unknown as typeof setInterval,
      clearIntervalFn: vi.fn() as unknown as typeof clearInterval,
    });
    await worker.tick();
    expect(start).toHaveBeenCalledOnce();
    now = new Date(now.getTime() + 101);
    vi.setSystemTime(now);
    await worker.tick();
    expect(stop).toHaveBeenCalledOnce();
    await worker.shutdown();
    vi.useRealTimers();
  });
});