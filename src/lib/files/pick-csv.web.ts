import type { PickedCsvFile } from './types';

export function pickCsvFile(): Promise<PickedCsvFile | null> {
  if (typeof document === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise<PickedCsvFile | null>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv,text/plain';

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, text: String(reader.result ?? '') });
      reader.onerror = () => reject(reader.error ?? new Error('Unable to read the selected CSV file.'));
      reader.readAsText(file);
    };

    input.click();
  });
}
