const DEFAULT_DELAY_MS = 280;

export function wait(ms = DEFAULT_DELAY_MS) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
