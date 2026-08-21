import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { assertNoSoapFault, parseAccountTransactionsV3, parseCardSummaries, parseCarrierInfo, parseChildTransactionsV3, parseContracts, parseCreditLimits, parseLogin } from './soap'

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
  it('classifies WEX command execution faults as safe transient errors', () => {
    try {
      assertNoSoapFault(envelope('<soapenv:Fault><faultstring>ERROR running command 1234567890123456</faultstring></soapenv:Fault>'))
      throw new Error('Expected a WEX fault')
    } catch (error) {
      expect(error).toMatchObject({
        message: 'WEX reported a temporary processing error.',
        kind: 'soap_fault',
        retryable: true,
      })
    }
  })
  it('rejects missing login results', () => expect(() => parseLogin(envelope('<loginResponse><result/></loginResponse>'))).toThrow('authentication failed'))
  it('rejects access-denied text instead of treating it as a clientId', () => expect(() => parseLogin(envelope('<loginResponse><result>Not Allowed 192.0.2.1</result></loginResponse>'))).toThrow('rejected the login source'))
  it('does not serialize a full number in normalized UI-shaped data', () => {
    const [result] = parseCardSummaries(envelope(`<getCardSummariesV2Response><result>${card('1001')}</result></getCardSummariesV2Response>`))
    const ui = JSON.stringify({ card_number_last4: result.cardNumber.slice(-4), status: result.status })
    expect(ui).not.toContain(result.cardNumber)
  })
  it('parses a V3 transaction and normalizes its line-item gallons', () => {
    const xml = envelope('<getChildTransactionsNewV3Response><result><value><transactionId>9001</transactionId><carrierId>42</carrierId><companyXRef>Sanitized Fleet</companyXRef><cardNumber>TESTCARD1001</cardNumber><transactionDate>2026-07-15T12:00:00Z</transactionDate><netTotal>123.45</netTotal><settleAmount>120.25</settleAmount><discAmount>4.25</discAmount><carrierFee>1.25</carrierFee><issuerFee>0.75</issuerFee><transactionType>1</transactionType><contractId>17</contractId><authCode>AUTH1</authCode><invoice>INV1</invoice><locationId>300</locationId><locationName>Test Fuel Stop</locationName><locationAddress>1 Test Way</locationAddress><locationCity>Nashville</locationCity><locationState>TN</locationState><locationZip>37011</locationZip><locationLatitude>36.1</locationLatitude><locationLongitude>-86.7</locationLongitude><infos><type>ODOMETER</type><value>12345</value></infos><lineItems><amount>80</amount><quantity>12.5</quantity><ppu>3.5</ppu><prodCD>DIESEL</prodCD><fuelType>1</fuelType></lineItems><lineItems><amount>40</amount><quantity>5</quantity><lineTaxes><taxDescription>Fuel tax</taxDescription><amount>2.1</amount><taxCode>FT</taxCode></lineTaxes></lineItems><transTaxes><taxDescription>Sales tax</taxDescription><amount>3.2</amount><taxCode>ST</taxCode></transTaxes></value></result></getChildTransactionsNewV3Response>')
    const [transaction] = parseChildTransactionsV3(xml)
    expect(transaction).toMatchObject({
      transactionId: '9001', carrierId: '42', amount: 123.45, gallons: 17.5,
      settledAmount: 120.25, feesTotal: 2, contractId: 17, authorizationCode: 'AUTH1',
      merchantCity: 'Nashville', merchantZip: '37011', promptValues: [{ type: 'ODOMETER', value: '12345' }],
    })
    expect(transaction.lineItems).toHaveLength(2)
    expect(transaction.lineItems[0]).toMatchObject({ productCode: 'DIESEL', pricePerUnit: 3.5 })
    expect(transaction.lineItems[1].taxes[0]).toMatchObject({ description: 'Fuel tax', amount: 2.1 })
    expect(transaction.taxes[0]).toMatchObject({ description: 'Sales tax', amount: 3.2 })
  })
  it('parses own-account V3 transactions', () => {
    const xml = envelope('<getMCTransExtLocV3Response><result><value><transactionId>9002</transactionId><carrierId>42</carrierId><cardNumber>TESTCARD1001</cardNumber><transactionDate>2026-07-15T12:00:00Z</transactionDate><netTotal>50</netTotal><transactionType>1</transactionType><locationName>Test Stop</locationName></value></result></getMCTransExtLocV3Response>')
    expect(parseAccountTransactionsV3(xml)).toHaveLength(1)
  })
  it('parses carrier customer information', () => {
    const xml = envelope('<getCarrierInfoResponse><result><name>Sanitized Fleet</name><carrierId>42</carrierId><locationGroups>false</locationGroups></result></getCarrierInfoResponse>')
    expect(parseCarrierInfo(xml)).toEqual({ carrierId: '42', name: 'Sanitized Fleet' })
  })
  it('parses account contracts', () => {
    const xml = envelope('<getContractsResponse><result><value><contractId>17</contractId><description>Fleet Credit</description><currency>USD</currency><limitMethod>1</limitMethod><masterContract>true</masterContract><status>ACTIVE</status></value></result></getContractsResponse>')
    expect(parseContracts(xml)).toEqual([{ contractId: 17, description: 'Fleet Credit', currency: 'USD', limitMethod: 1, masterContract: true, status: 'ACTIVE' }])
  })
  it('parses contract credit limits with CRM-friendly names', () => {
    const xml = envelope('<getCreditLimitsResponse><result><contractStatus>ACTIVE</contractStatus><transLimit>2500</transLimit><origLimit>25000</origLimit><creditAvailable>16657.82</creditAvailable><dailyLimit>5000</dailyLimit><dailyAvailable>4200</dailyAvailable><totalAvailable>16657.82</totalAvailable><maxMoneyCode>500</maxMoneyCode><uom>USD</uom></result></getCreditLimitsResponse>')
    expect(parseCreditLimits(xml)).toMatchObject({ originalLimit: 25000, creditAvailable: 16657.82, transactionLimit: 2500, unitOfMeasure: 'USD' })
  })
})
