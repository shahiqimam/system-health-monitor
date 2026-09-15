import { CheckResultStatus, TargetStatus } from '../common/enums';
import { computeHealthTransition, HealthStateInput } from './health-state';

const THRESHOLDS = { failureThreshold: 3, recoveryThreshold: 2 };

const state = (overrides: Partial<HealthStateInput> = {}): HealthStateInput => ({
  status: TargetStatus.UP,
  consecutiveFailures: 0,
  consecutiveSuccesses: 5,
  hasActiveIncident: false,
  ...overrides,
});

describe('computeHealthTransition', () => {
  it('marks a healthy target UP without opening an incident', () => {
    const decision = computeHealthTransition(
      state({ status: TargetStatus.UNKNOWN, consecutiveSuccesses: 0 }),
      CheckResultStatus.SUCCESS,
      THRESHOLDS,
    );
    expect(decision.status).toBe(TargetStatus.UP);
    expect(decision.consecutiveSuccesses).toBe(1);
    expect(decision.shouldOpenIncident).toBe(false);
  });

  it('degrades on the first failure and does not open an incident', () => {
    const decision = computeHealthTransition(state(), CheckResultStatus.FAILURE, THRESHOLDS);
    expect(decision.status).toBe(TargetStatus.DEGRADED);
    expect(decision.consecutiveFailures).toBe(1);
    expect(decision.shouldOpenIncident).toBe(false);
  });

  it('stays DEGRADED on the second failure', () => {
    const decision = computeHealthTransition(
      state({ status: TargetStatus.DEGRADED, consecutiveFailures: 1, consecutiveSuccesses: 0 }),
      CheckResultStatus.FAILURE,
      THRESHOLDS,
    );
    expect(decision.status).toBe(TargetStatus.DEGRADED);
    expect(decision.consecutiveFailures).toBe(2);
    expect(decision.shouldOpenIncident).toBe(false);
  });

  it('goes DOWN and opens an incident at the failure threshold', () => {
    const decision = computeHealthTransition(
      state({ status: TargetStatus.DEGRADED, consecutiveFailures: 2, consecutiveSuccesses: 0 }),
      CheckResultStatus.FAILURE,
      THRESHOLDS,
    );
    expect(decision.status).toBe(TargetStatus.DOWN);
    expect(decision.consecutiveFailures).toBe(3);
    expect(decision.shouldOpenIncident).toBe(true);
  });

  it('does not open a second incident while one is already active', () => {
    const decision = computeHealthTransition(
      state({
        status: TargetStatus.DOWN,
        consecutiveFailures: 3,
        consecutiveSuccesses: 0,
        hasActiveIncident: true,
      }),
      CheckResultStatus.FAILURE,
      THRESHOLDS,
    );
    expect(decision.status).toBe(TargetStatus.DOWN);
    expect(decision.consecutiveFailures).toBe(4);
    expect(decision.shouldOpenIncident).toBe(false);
  });

  it('keeps a DOWN target DOWN on the first success while recovery is pending', () => {
    const decision = computeHealthTransition(
      state({
        status: TargetStatus.DOWN,
        consecutiveFailures: 4,
        consecutiveSuccesses: 0,
        hasActiveIncident: true,
      }),
      CheckResultStatus.SUCCESS,
      THRESHOLDS,
    );
    expect(decision.status).toBe(TargetStatus.DOWN);
    expect(decision.consecutiveSuccesses).toBe(1);
    expect(decision.consecutiveFailures).toBe(0);
    expect(decision.shouldResolveIncident).toBe(false);
  });

  it('recovers to UP and resolves the incident at the recovery threshold', () => {
    const decision = computeHealthTransition(
      state({
        status: TargetStatus.DOWN,
        consecutiveFailures: 0,
        consecutiveSuccesses: 1,
        hasActiveIncident: true,
      }),
      CheckResultStatus.SUCCESS,
      THRESHOLDS,
    );
    expect(decision.status).toBe(TargetStatus.UP);
    expect(decision.consecutiveSuccesses).toBe(2);
    expect(decision.shouldResolveIncident).toBe(true);
  });

  it('recovers without an incident when the target went DOWN with no incident recorded', () => {
    const decision = computeHealthTransition(
      state({ status: TargetStatus.DOWN, consecutiveSuccesses: 1, hasActiveIncident: false }),
      CheckResultStatus.SUCCESS,
      THRESHOLDS,
    );
    expect(decision.status).toBe(TargetStatus.UP);
    expect(decision.shouldResolveIncident).toBe(false);
  });
});
