import { CheckResultStatus, TargetStatus } from '../common/enums';

export interface HealthThresholds {
  failureThreshold: number;
  recoveryThreshold: number;
}

export interface HealthStateInput {
  status: TargetStatus;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  hasActiveIncident: boolean;
}

export interface HealthStateDecision {
  status: TargetStatus;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  shouldOpenIncident: boolean;
  shouldResolveIncident: boolean;
}

/**
 * Pure failure/recovery state machine (spec 14).
 *
 * Kept free of persistence so it can be unit-tested without a database and so
 * the caller can apply the whole decision inside a single transaction.
 */
export const computeHealthTransition = (
  current: HealthStateInput,
  result: CheckResultStatus,
  thresholds: HealthThresholds,
): HealthStateDecision => {
  const failureThreshold = Math.max(1, thresholds.failureThreshold);
  const recoveryThreshold = Math.max(1, thresholds.recoveryThreshold);

  if (result === CheckResultStatus.SUCCESS) {
    const consecutiveSuccesses = current.consecutiveSuccesses + 1;
    const recovering = current.hasActiveIncident || current.status === TargetStatus.DOWN;

    if (recovering && consecutiveSuccesses < recoveryThreshold) {
      // Not enough successes yet: stay DOWN and keep the incident open.
      return {
        status: TargetStatus.DOWN,
        consecutiveFailures: 0,
        consecutiveSuccesses,
        shouldOpenIncident: false,
        shouldResolveIncident: false,
      };
    }

    return {
      status: TargetStatus.UP,
      consecutiveFailures: 0,
      consecutiveSuccesses,
      shouldOpenIncident: false,
      shouldResolveIncident: recovering && current.hasActiveIncident,
    };
  }

  const consecutiveFailures = current.consecutiveFailures + 1;
  const reachedThreshold = consecutiveFailures >= failureThreshold;

  return {
    status: reachedThreshold ? TargetStatus.DOWN : TargetStatus.DEGRADED,
    consecutiveFailures,
    consecutiveSuccesses: 0,
    shouldOpenIncident: reachedThreshold && !current.hasActiveIncident,
    shouldResolveIncident: false,
  };
};
