import { describe, expect, it } from 'vitest'
import { createCsv, encodeCsvCell } from './csv'

describe('CSV encoding', () => {
  it.each([
    '=HYPERLINK("https://attacker.invalid","click")',
    '+SUM(1,1)',
    '-2+3',
    '@SUM(1,1)',
    ' =SUM(1,1)',
    '\t=SUM(1,1)',
    '\r=SUM(1,1)',
  ])('neutralizes spreadsheet formula input %j', (value) => {
    expect(encodeCsvCell(value)).toBe(`"'${value.replaceAll('"', '""')}"`)
  })

  it('preserves ordinary strings and escapes embedded CSV quotes', () => {
    expect(encodeCsvCell('Acme "Fleet", LLC')).toBe('"Acme ""Fleet"", LLC"')
  })

  it('preserves numeric values, including negative numbers', () => {
    expect(encodeCsvCell(-42.5)).toBe('"-42.5"')
  })

  it('encodes nullish values as empty cells', () => {
    expect(encodeCsvCell(null)).toBe('""')
    expect(encodeCsvCell(undefined)).toBe('""')
  })

  it('serializes rows with the protected cell encoder', () => {
    expect(createCsv([
      ['Company', 'Amount'],
      ['=1+1', 25],
    ])).toBe('"Company","Amount"\n"\'=1+1","25"')
  })
})
