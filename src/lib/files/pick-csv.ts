import { Platform } from 'react-native';
import { pickCsvFile as pickCsvFileNative } from './pick-csv.native';
import { pickCsvFile as pickCsvFileWeb } from './pick-csv.web';
import type { PickedCsvFile } from './types';

export function pickCsvFile(): Promise<PickedCsvFile | null> {
  return Platform.OS === 'web' ? pickCsvFileWeb() : pickCsvFileNative();
}
