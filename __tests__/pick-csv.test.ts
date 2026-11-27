jest.mock('expo-file-system', () => ({
  File: { pickFileAsync: jest.fn() },
}));

import { pickCsvFile as pickCsvFileNative } from '@/lib/files/pick-csv.native';
import { pickCsvFile as pickCsvFileWeb } from '@/lib/files/pick-csv.web';

class MockFileReader {
  result: string | null = null;
  error: Error | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  readAsText(): void {
    this.result = 'unit,label\ntower-1,Unit 101\n';
    this.onload?.();
  }
}

describe('CSV file picker platform exports', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exports pickCsvFile from both platform implementations', () => {
    expect(typeof pickCsvFileWeb).toBe('function');
    expect(typeof pickCsvFileNative).toBe('function');
  });

  it('opens a browser file chooser and returns the selected CSV text', async () => {
    const originalCreateElement = document.createElement.bind(document);
    const input = {
      type: '',
      accept: '',
      files: [] as Array<{ name: string }>,
      onchange: null as (() => void) | null,
      click: jest.fn(() => {
        input.files = [{ name: 'buyers.csv' }];
        input.onchange?.();
      }),
    };

    jest.spyOn(document, 'createElement').mockImplementation((tagName: string) =>
      tagName === 'input'
        ? (input as unknown as HTMLInputElement)
        : originalCreateElement(tagName),
    );
    Object.defineProperty(globalThis, 'FileReader', {
      value: MockFileReader,
      configurable: true,
      writable: true,
    });

    const picked = await pickCsvFileWeb();

    expect(input.type).toBe('file');
    expect(input.accept).toContain('.csv');
    expect(input.click).toHaveBeenCalledTimes(1);
    expect(picked).toEqual({ name: 'buyers.csv', text: 'unit,label\ntower-1,Unit 101\n' });
  });
});
