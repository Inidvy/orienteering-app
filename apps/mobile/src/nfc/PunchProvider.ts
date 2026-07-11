// Punch source port. Real implementations later:
//  - Android: react-native-nfc-manager reader mode, auto-armed while the run
//    screen is foregrounded (decision P2-5A)
//  - iOS: Core NFC session armed by the PUNCH button
// The mock provider drives development, emulators, and e2e-mobile tests
// (the test plan's "NFC via debug mock punch provider").

export interface TagRead {
  tagUid: string;
}

export interface PunchProvider {
  /** arm a scan session; resolves on read, rejects on failure/timeout */
  scan(timeoutMs: number): Promise<TagRead>;
  cancel(): void;
  readonly autoArms: boolean; // Android reader mode: true
}

export function mockPunchProvider(queue: (TagRead | Error)[]): PunchProvider {
  const pending = [...queue];
  return {
    autoArms: false,
    async scan(): Promise<TagRead> {
      const next = pending.shift();
      if (!next) throw new Error("mock queue empty");
      if (next instanceof Error) throw next;
      return next;
    },
    cancel() {
      /* no-op */
    },
  };
}
