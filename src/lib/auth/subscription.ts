import type { AppAuth, AppUser } from '@/types/firebase';
import { authAdapter } from './platform';

export function subscribeToAuthState(
  auth: AppAuth,
  onUserChanged: (user: AppUser | null) => void,
): () => void {
  return authAdapter.subscribe(auth, onUserChanged);
}
