import { db, workerLockTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

export interface LeaseRepository {
  acquire(owner: string, now: Date, ttlMs: number): Promise<boolean>;
  renew(owner: string, now: Date, ttlMs: number): Promise<boolean>;
  release(owner: string): Promise<void>;
  status(): Promise<{ ownerToken: string | null; leaseUntil: Date | null }>;
}

export const databaseLeaseRepository: LeaseRepository = {
  async acquire(owner, now, ttlMs) {
    return db.transaction(async (tx) => {
      const [row] = await tx.select().from(workerLockTable)
        .where(eq(workerLockTable.id, 1)).for("update");
      if (row?.ownerToken && row.leaseUntil && row.leaseUntil > now && row.ownerToken !== owner) return false;
      await tx.update(workerLockTable).set({
        ownerToken: owner, leaseUntil: new Date(now.getTime() + ttlMs), updatedAt: now,
      }).where(eq(workerLockTable.id, 1));
      return true;
    });
  },
  async renew(owner, now, ttlMs) {
    const result = await db.update(workerLockTable).set({
      leaseUntil: new Date(now.getTime() + ttlMs), updatedAt: now,
    }).where(sql`${workerLockTable.id} = 1 AND ${workerLockTable.ownerToken} = ${owner} AND ${workerLockTable.leaseUntil} > ${now}`);
    return (result.rowCount ?? 0) > 0;
  },
  async release(owner) {
    await db.update(workerLockTable).set({ ownerToken: null, leaseUntil: null, updatedAt: new Date() })
      .where(sql`${workerLockTable.id} = 1 AND ${workerLockTable.ownerToken} = ${owner}`);
  },
  async status() {
    const [row] = await db.select({ ownerToken: workerLockTable.ownerToken, leaseUntil: workerLockTable.leaseUntil })
      .from(workerLockTable).where(eq(workerLockTable.id, 1));
    return { ownerToken: row?.ownerToken ?? null, leaseUntil: row?.leaseUntil ?? null };
  },
};

export class WorkerLeaseCoordinator {
  private active = false;
  constructor(
    private readonly repo: LeaseRepository,
    private readonly ownerToken: string,
    private readonly ttlMs = 90_000,
  ) {}
  async tryAcquire(now = new Date()): Promise<boolean> {
    this.active = await this.repo.acquire(this.ownerToken, now, this.ttlMs);
    return this.active;
  }
  async renew(now = new Date()): Promise<boolean> {
    this.active = this.active && await this.repo.renew(this.ownerToken, now, this.ttlMs);
    return this.active;
  }
  async release(): Promise<void> { if (this.active) await this.repo.release(this.ownerToken); this.active = false; }
  isActive(): boolean { return this.active; }
  /** Runs work only while this coordinator owns the durable lease. */
  async executeIfLeader<T>(work: () => Promise<T>): Promise<T | undefined> {
    if (!this.active) return undefined;
    return work();
  }
}