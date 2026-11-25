export type BootstrapState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

export function initialBootstrapState(): BootstrapState {
  return { status: 'loading' };
}

export function readyBootstrapState(): BootstrapState {
  return { status: 'ready' };
}

export function failedBootstrapState(error: unknown): BootstrapState {
  return {
    status: 'error',
    message: error instanceof Error && error.message ? error.message : 'Unable to start Gatehood.',
  };
}

export async function runBootstrap<Config>(
  loadConfig: () => Config,
  initialize: (config: Config) => unknown,
): Promise<BootstrapState> {
  try {
    const config = loadConfig();
    await initialize(config);
    return readyBootstrapState();
  } catch (error) {
    return failedBootstrapState(error);
  }
}
