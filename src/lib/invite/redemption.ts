const INVITE_CODE_PATTERN = /^[A-Z0-9]{12,64}$/;

export type RedemptionGate = {
  begin: (input: string) => { code: string } | null;
  finish: () => void;
  isBusy: () => boolean;
};

export function normalizeInviteCodeInput(value: string): string {
  return value.trim().replace(/[\s-]/g, '').toUpperCase();
}

export function describeInviteCodeInput(value: string): string | null {
  const code = normalizeInviteCodeInput(value);
  if (!code) {
    return 'Enter the invite code from your builder.';
  }
  if (!INVITE_CODE_PATTERN.test(code)) {
    return 'Invite codes use 12 to 64 letters or numbers. Spaces and hyphens are allowed.';
  }
  return null;
}

export function createRedemptionGate(): RedemptionGate {
  let busy = false;

  return {
    begin(input) {
      if (busy || describeInviteCodeInput(input) !== null) {
        return null;
      }
      busy = true;
      return { code: normalizeInviteCodeInput(input) };
    },
    finish() {
      busy = false;
    },
    isBusy() {
      return busy;
    },
  };
}
