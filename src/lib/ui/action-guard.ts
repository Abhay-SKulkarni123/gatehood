export type ActionGuard = {
  begin: (key: string) => boolean;
  end: (key: string) => void;
  current: () => string | null;
};

export function createActionGuard(onChange: (key: string | null) => void): ActionGuard {
  let active: string | null = null;

  return {
    begin(key) {
      if (active !== null) {
        return false;
      }
      active = key;
      onChange(key);
      return true;
    },
    end(key) {
      if (active !== key) {
        return;
      }
      active = null;
      onChange(null);
    },
    current() {
      return active;
    },
  };
}
