const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

export function parseIdList(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\s,;]+/)
        .map((item) => item.trim())
        .filter(isSlug),
    ),
  );
}
