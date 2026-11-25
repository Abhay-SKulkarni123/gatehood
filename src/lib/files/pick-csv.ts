import { Platform } from 'react-native';
import { pickCsvFileNative } from './pick-csv.native';
import { pickCsvFileWeb } from './pick-csv.web';
import type { PickedCsvFile } from './types';

export function pickCsvFile(): Promise<PickedCsvFile | null> {
  return Platform.OS === 'web' ? pickCsvFileWeb() : pickCsvFileNative();
}
