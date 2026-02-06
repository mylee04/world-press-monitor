const COOLDOWN_MS = 5 * 60 * 1000;
const MAX_FAILURES = 2;

interface CircuitState {
  failures: number;
  cooldownUntil: number;
}

const states = new Map<string, CircuitState>();

export function isCoolingDown(key: string): boolean {
  const state = states.get(key);
  if (!state) return false;
  if (Date.now() < state.cooldownUntil) return true;
  states.delete(key);
  return false;
}

export function markFailure(key: string): void {
  const state = states.get(key) ?? { failures: 0, cooldownUntil: 0 };
  state.failures += 1;
  if (state.failures >= MAX_FAILURES) {
    state.cooldownUntil = Date.now() + COOLDOWN_MS;
  }
  states.set(key, state);
}

export function markSuccess(key: string): void {
  states.delete(key);
}
