import { TargetLockService } from './target-lock.service';

describe('TargetLockService', () => {
  it('prevents two concurrent checks for the same target', () => {
    const locks = new TargetLockService();
    expect(locks.tryAcquire('target-a')).toBe(true);
    expect(locks.tryAcquire('target-a')).toBe(false);
    locks.release('target-a');
    expect(locks.tryAcquire('target-a')).toBe(true);
  });

  it('allows different targets to run in parallel', () => {
    const locks = new TargetLockService();
    expect(locks.tryAcquire('a')).toBe(true);
    expect(locks.tryAcquire('b')).toBe(true);
    expect(locks.size).toBe(2);
  });
});
