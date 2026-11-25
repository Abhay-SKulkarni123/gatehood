import {
  failedBootstrapState,
  initialBootstrapState,
  readyBootstrapState,
  runBootstrap,
} from '@/lib/boot/bootstrap';

describe('startup bootstrap', () => {
  it('starts in a loading state', () => {
    expect(initialBootstrapState()).toEqual({ status: 'loading' });
  });

  it('waits for initialization before reporting ready', async () => {
    const initialize = jest.fn(async () => undefined);

    const result = await runBootstrap(() => ({ projectId: 'demo' }), initialize);

    expect(result).toEqual(readyBootstrapState());
    expect(initialize).toHaveBeenCalledWith({ projectId: 'demo' });
  });

  it('reports useful initialization errors', async () => {
    const result = await runBootstrap(
      () => ({ projectId: 'demo' }),
      () => {
        throw new Error('Firebase web configuration is required.');
      },
    );

    expect(result).toEqual({
      status: 'error',
      message: 'Firebase web configuration is required.',
    });
  });

  it('supports retry after an initialization error', async () => {
    let attempts = 0;
    const initialize = jest.fn(() => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('Temporary failure.');
      }
      return Promise.resolve();
    });

    const first = await runBootstrap(() => ({ projectId: 'demo' }), initialize);
    const second = await runBootstrap(() => ({ projectId: 'demo' }), initialize);

    expect(first).toEqual(failedBootstrapState(new Error('Temporary failure.')));
    expect(second).toEqual(readyBootstrapState());
    expect(initialize).toHaveBeenCalledTimes(2);
  });
});
