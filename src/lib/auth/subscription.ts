import { onAuthStateChanged } from '@react-native-firebase/auth';
import type { Auth, User } from '@react-native-firebase/auth';

export function subscribeToAuthState(
  auth: Auth,
  onUserChanged: (user: User | null) => void,
): () => void {
  return onAuthStateChanged(auth, onUserChanged);
}
