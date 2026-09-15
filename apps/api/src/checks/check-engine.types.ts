import { CheckErrorType, CheckResultStatus, HttpMethod } from '../common/enums';

/** The minimum a target must expose for the engine to check it. */
export interface CheckableTarget {
  id?: string;
  url: string;
  method: HttpMethod;
  expectedStatusMin: number;
  expectedStatusMax: number;
  timeoutMs: number;
  followRedirects: boolean;
  maxRedirects: number;
}

export interface CheckExecutionResult {
  status: CheckResultStatus;
  httpStatus: number | null;
  latencyMs: number | null;
  errorType: CheckErrorType | null;
  errorMessage: string | null;
  checkedAt: Date;
  redirectCount: number;
}
