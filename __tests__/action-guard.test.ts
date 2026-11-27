import { createActionGuard } from '@/lib/ui/action-guard';

describe('createActionGuard', () => {
  it('allows one action at a time and rejects overlapping actions', () => {
    const onChange = jest.fn();
    const guard = createActionGuard(onChange);

    expect(guard.begin('notice')).toBe(true);
    expect(guard.begin('pin')).toBe(false);
    expect(guard.current()).toBe('notice');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('notice');
  });

  it('only clears the action that owns the guard', () => {
    const onChange = jest.fn();
    const guard = createActionGuard(onChange);

    guard.begin('notice');
    guard.end('pin');

    expect(guard.current()).toBe('notice');
    expect(onChange).not.toHaveBeenCalledWith(null);
  });

  it('allows a new action after the active action completes', () => {
    const guard = createActionGuard(jest.fn());

    expect(guard.begin('notice')).toBe(true);
    guard.end('notice');
    expect(guard.current()).toBeNull();
    expect(guard.begin('pin')).toBe(true);
  });
});
