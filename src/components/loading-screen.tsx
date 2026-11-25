import { Screen } from './screen';
import { LoadingIndicator } from './loading-indicator';

export function LoadingScreen({ label = 'Checking access…' }: { label?: string }) {
  return (
    <Screen>
      <LoadingIndicator label={label} />
    </Screen>
  );
}
