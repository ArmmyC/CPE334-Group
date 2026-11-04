import { healthResponseSchema, type HealthResponse } from '@cpe334-group/shared';

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health');
  return healthResponseSchema.parse(await response.json());
}
