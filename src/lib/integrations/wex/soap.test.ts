import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { assertNoSoapFault, parseAccountTransactionsV3, parseCardSummaries, parseCarrierInfo, parseChildTransactionsV3, parseLogin } from './soap'

const envelope = (body: string) => `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body>${body}</soapenv:Body></soapenv:Envelope>`
const card = (last4: string, extra = '') => `<value><cardNumber>TESTCARD${last4}</cardNumber><driverName>Sanitized Driver</driverName><status>ACTIVE</status>${extra}</value>`

describe('WEX SOAP parsing', () => {
  it('normalizes one card into an array', () => expect(parseCardSummaries(envelope(`<getCardSummariesV2Response><result>${card('1001')}</result></getCardSummariesV2Response>`))).toHaveLength(1))
  it('parses multiple cards', () => expect(parseCardSummaries(envelope(`<getCardSummariesV2Response><result>${card('1001')}${card('1002')}</result></getCardSummariesV2Response>`))).toHaveLength(2))
  it('normalizes xsi:nil and empty fields', () => {
    const [result] = parseCardSummaries(envelope(`<getCardSummariesV2Response><result>${card('1001', '<gpsid xsi:nil="1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/><vin></vin>')}</result></getCardSummariesV2Response>`))
    expect(result.gpsid).toBeNull(); expect(result.vin).toBeNull()
  })
  it('detects faults returned with HTTP 200 bodies', () => expect(() => parseLogin(envelope('<soapenv:Fault><faultcode>Server</faultcode><faultstring>Invalid login</faultstring></soapenv:Fault>'))).toThrow('Invalid login'))
  it('redacts long identifiers echoed by SOAP faults', () => expect(() => assertNoSoapFault(envelope('<soapenv:Fault><faultstring>Invalid client ABCDEFGHIJKLMNOP123456</faultstring></soapenv:Fault>'))).toThrow('Invalid client [redacted]'))
  it('rejects missing login results', () => expect(() => parseLogin(envelope('<loginResponse><result/></loginResponse>'))).toThrow('authentication failed'))
  it('rejects access-denied text instead of treating it as a clientId', () => expect(() => parseLogin(envelope('<loginResponse><result>Not Allowed 192.0.2.1</result></loginResponse>'))).toThrow('rejected the login source'))
  it('does not serialize a full number in normalized UI-shaped data', () => {
    const [result] = parseCardSummaries(envelope(`<getCardSummariesV2Response><result>${card('1001')}</result></getCardSummariesV2Response>`))
    const ui = JSON.stringify({ card_number_last4: result.cardNumber.slice(-4), status: result.status })
    expect(ui).not.toContain(result.cardNumber)
  })
  it('parses a V3 transaction and normalizes its line-item gallons', () => {
    const xml = envelope('<getChildTransactionsNewV3Response><result><value><transactionId>9001</transactionId><carrierId>42</carrierId><companyXRef>Sanitized Fleet</companyXRef><cardNumber>TESTCARD1001</cardNumber><transactionDate>2026-07-15T12:00:00Z</transactionDate><netTotal>123.45</netTotal><discAmount>4.25</discAmount><transactionType>1</transactionType><locationName>Test Fuel Stop</locationName><locationState>TN</locationState><lineItems><quantity>12.5</quantity></lineItems><lineItems><quantity>5</quantity></lineItems></value></result></getChildTransactionsNewV3Response>')
    const [transaction] = parseChildTransactionsV3(xml)
    expect(transaction).toMatchObject({ transactionId: '9001', carrierId: '42', amount: 123.45, gallons: 17.5 })
  })
  it('parses own-account V3 transactions', () => {
    const xml = envelope('<getMCTransExtLocV3Response><result><value><transactionId>9002</transactionId><carrierId>42</carrierId><cardNumber>TESTCARD1001</cardNumber><transactionDate>2026-07-15T12:00:00Z</transactionDate><netTotal>50</netTotal><transactionType>1</transactionType><locationName>Test Stop</locationName></value></result></getMCTransExtLocV3Response>')
    expect(parseAccountTransactionsV3(xml)).toHaveLength(1)
  })
  it('parses carrier customer information', () => {
    const xml = envelope('<getCarrierInfoResponse><result><name>Sanitized Fleet</name><carrierId>42</carrierId><locationGroups>false</locationGroups></result></getCarrierInfoResponse>')
    expect(parseCarrierInfo(xml)).toEqual({ carrierId: '42', name: 'Sanitized Fleet' })
  })
})
