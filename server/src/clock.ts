// Services read the time only from an injected clock and write every timestamp from it,
// so tests can control session expiry and due dates (SDS section 8).
export type Clock = {
  now: () => Date;
};

export const systemClock: Clock = {
  now: () => new Date(),
};
