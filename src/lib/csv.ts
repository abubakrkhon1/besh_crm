const SPREADSHEET_FORMULA_PREFIX = /^[\s\u0000-\u001f]*[=+\-@]/

/**
 * Encodes one CSV field while preventing string values from being interpreted
 * as formulas when the file is opened in spreadsheet software.
 */
export function encodeCsvCell(value: unknown): string {
  const text = String(value ?? '')
  const safeText = typeof value === 'string' && SPREADSHEET_FORMULA_PREFIX.test(text)
    ? `'${text}`
    : text

  return `"${safeText.replaceAll('"', '""')}"`
}

export function createCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return rows.map((row) => row.map(encodeCsvCell).join(',')).join('\n')
}
