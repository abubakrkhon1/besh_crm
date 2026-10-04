import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { assertNoSoapFault, parseAccountTransactionsV3, parseAllowedOrderTypes, parseCardRefreshingLimits, parseCardSummaries, parseCardV2, parseCarrierInfo, parseChildTransactionsV3, parseContracts, parseCreditLimits, parseLogin, parseMutationResponse, serializeCardOrder, serializeCardV2, serializeRefreshingLimits, serializeReplacementCardOrder } from './soap'

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
  it('parses and serializes complete card details without exposing them to storage', () => {
    const xml = envelope('<getCardv2Response><result><cardNumber>TESTCARD1001</cardNumber><header><locationOverride>0</locationOverride><overrideAllLocations>false</overrideAllLocations><override>0</override><policyNumber>17</policyNumber><status>ACTIVE</status></header><infos><infoId>DRIVER</infoId><lengthCheck>true</lengthCheck><maximum>10</maximum><minimum>1</minimum><value>2</value></infos><limits><hours>24</hours><limit>500</limit><limitId>FUEL</limitId><minHours>1</minHours><autoRollMap>0</autoRollMap><autoRollMax>0</autoRollMax></limits><locations>42</locations></result></getCardv2Response>')
    const result = parseCardV2(xml)
    expect(result.header).toMatchObject({ policyNumber: 17, status: 'ACTIVE' })
    expect(result.limits[0]).toMatchObject({ limitId: 'FUEL', limit: 500 })
    expect(serializeCardV2(result)).toContain('<status>ACTIVE</status>')
  })
  it('parses per-card refreshing limits', () => {
    const xml = envelope('<getCardRefreshingLimitsResponse><cardRefreshingLimitsData><refreshingLimitSource>CARD</refreshingLimitSource><dayCntLimit>4</dayCntLimit><dayAmtLimit>500</dayAmtLimit><weekAmtLimit>2500</weekAmtLimit><monAmtLimit>8000</monAmtLimit></cardRefreshingLimitsData></getCardRefreshingLimitsResponse>')
    expect(parseCardRefreshingLimits(xml)).toEqual({
      refreshingLimitSource: 'CARD', dayCountLimit: 4, dayAmountLimit: 500,
      weekCountLimit: null, weekAmountLimit: 2500, monthCountLimit: null, monthAmountLimit: 8000,
    })
  })
  it('parses allowed order defaults and successful mutation responses', () => {
    const choices = parseAllowedOrderTypes(envelope('<getAllowedOrderTypesResponse><response><value><orderType>2</orderType><orderDesc>New card</orderDesc><defCardStyle>5</defCardStyle><defCardStyleDesc>Fleet</defCardStyleDesc><defPolicy>17</defPolicy></value></response></getAllowedOrderTypesResponse>'))
    expect(choices[0]).toEqual({ orderType: 2, orderDescription: 'New card', defaultCardStyle: 5, defaultCardStyleDescription: 'Fleet', defaultPolicy: 17 })
    expect(parseMutationResponse(envelope('<setCardRefreshingLimitsResponse><requestStatus><errorCode>0</errorCode><description>OK</description></requestStatus></setCardRefreshingLimitsResponse>'), 'setCardRefreshingLimits')).toMatchObject({ errorCode: 0 })
    expect(parseMutationResponse(envelope('<createAndSubmitOrderResponse><orderId>9001</orderId><requestStatus><errorCode>0</errorCode></requestStatus></createAndSubmitOrderResponse>'), 'createAndSubmitOrder')).toMatchObject({ orderId: '9001' })
    expect(parseMutationResponse(envelope('<replaceLostOrStolenCardResponse><orderId>9002</orderId><requestStatus><errorCode>0</errorCode></requestStatus></replaceLostOrStolenCardResponse>'), 'replaceLostOrStolenCard')).toMatchObject({ orderId: '9002' })
  })
  it('rejects provider mutation failures', () => {
    expect(() => parseMutationResponse(envelope('<setCardRefreshingLimitsResponse><requestStatus><errorCode>12</errorCode><description>Invalid limit</description></requestStatus></setCardRefreshingLimitsResponse>'), 'setCardRefreshingLimits')).toThrow('Invalid limit')
    expect(() => parseMutationResponse(envelope('<setCardRefreshingLimitsResponse><requestStatus><errorCode>12</errorCode><description>Invalid card 1234567890123456</description></requestStatus></setCardRefreshingLimitsResponse>'), 'setCardRefreshingLimits')).toThrow('Invalid card [redacted]')
  })
  it('escapes user-entered values in mutation payloads', () => {
    expect(serializeRefreshingLimits({ refreshingLimitSource: 'CARD', dayCountLimit: null, dayAmountLimit: 500, weekCountLimit: null, weekAmountLimit: null, monthCountLimit: null, monthAmountLimit: null })).toContain('<dayAmtLimit>500</dayAmtLimit>')
    expect(serializeCardOrder({ policyNumber: 17, orderType: 2, cardStyle: 5, embossedName: 'A & B', shipToFirst: 'A', shipToLast: 'B', shipToAddress1: '1 Main', shipToAddress2: '', shipToCity: 'Tulsa', shipToState: 'OK', shipToZip: '74101', shipToCountry: 'US', shippingMethod: 1, rushProcessing: 'N', cardCarrier: '' })).toContain('<embossedName>A &amp; B</embossedName>')
    expect(serializeReplacementCardOrder({ cardNumber: 'TEST1001', shipToFirst: 'A & B', shipToLast: 'Driver', shipToAddress1: '1 Main', shipToAddress2: '', shipToCity: 'Tulsa', shipToState: 'OK', shipToZip: '74101', shipToCountry: 'US', shippingMethod: 1, rushProcessing: 'N', reason: 'Lost & missing' })).toContain('<reason>Lost &amp; missing</reason>')
  })
})
