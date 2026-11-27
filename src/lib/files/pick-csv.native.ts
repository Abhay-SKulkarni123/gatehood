import { File } from 'expo-file-system';
import type { PickedCsvFile } from './types';

export async function pickCsvFile(): Promise<PickedCsvFile | null> {
  const picked = await File.pickFileAsync({
    mimeTypes: ['text/csv', 'text/plain', 'application/vnd.ms-excel'],
  });

  if (picked.canceled) {
    return null;
  }

  const file = picked.result;
  return {
    name: file.name,
    text: await file.text(),
  };
}
