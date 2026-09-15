import { Injectable } from '@nestjs/common';

/**
 * In-process mutual exclusion so the scheduler and a manual "check now" can
 * never run two simultaneous checks for the same target (spec 28).
 *
 * LIMITATION: this is process-local. With multiple API replicas each replica
 * keeps its own set and duplicate checks become possible; a distributed lock
 * (Redis/advisory lock) or a single worker would be required.
 */
@Injectable()
export class TargetLockService {
  private readonly inFlight = new Set<string>();

  tryAcquire(targetId: string): boolean {
    if (this.inFlight.has(targetId)) return false;
    this.inFlight.add(targetId);
    return true;
  }

  release(targetId: string): void {
    this.inFlight.delete(targetId);
  }

  isLocked(targetId: string): boolean {
    return this.inFlight.has(targetId);
  }

  get size(): number {
    return this.inFlight.size;
  }
}
