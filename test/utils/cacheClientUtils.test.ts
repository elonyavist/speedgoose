import {ObjectId} from "mongodb"
import Keyv from "keyv"
import {CachedResult, CacheNamespaces} from "../../src/types/types"
import * as cacheClientUtils from "../../src/utils/cacheClientUtils"
import * as debugUtils from "../../src/utils/debugUtils"
import {getCacheStrategyInstance, objectDeserializer, objectSerializer} from "../../src/utils/commonUtils"
import {cachingTestCases} from "../assets/utils/cacheClientUtils"
import {generateTestDocument, getValuesFromSet} from "../testUtils"
import * as commonUtils from "../../src/utils/commonUtils"
import {clearCacheForKey} from "../../src/utils/cacheClientUtils"
import {generateCacheKeyForSingleDocument} from "../../src/utils/cacheKeyUtils"

const mockedGetHydrationCache = jest.spyOn(commonUtils, 'getHydrationCache')
const mockedAddValueToInternalCachedSet = jest.spyOn(cacheClientUtils, 'addValueToInternalCachedSet')
const mockedLogCacheClear = jest.spyOn(debugUtils, 'logCacheClear')

describe('createInMemoryCacheClientWithNamespace', () => {
    const cacheClient = cacheClientUtils.createInMemoryCacheClientWithNamespace('testNamespace')

    test(`should return Keyv instance with opts`, () => {
        expect(cacheClient.opts.namespace).toEqual('testNamespace')
        expect(cacheClient.opts.serialize).toEqual(objectSerializer)
        expect(cacheClient.opts.deserialize).toEqual(objectDeserializer)
    })

    test(`should set and return objects as they are - without stringify `, async () => {

        //setting values 
        for (const testCase of cachingTestCases) {
            await cacheClient.set(testCase.key, testCase.value)
        }

        for (const testCase of cachingTestCases) {
            expect(await cacheClient.get(testCase.key)).toEqual(testCase.value)
        }
    })
})

describe('getResultsFromCache', () => {
    test(`should set and return objects as they are - without stringify when using getResultsFromCache`, async () => {

        for (const testCase of cachingTestCases) {
            await getCacheStrategyInstance().addValueToCache(CacheNamespaces.RESULTS_NAMESPACE, testCase.key, testCase.value as CachedResult)
        }

        for (const testCase of cachingTestCases) {
            expect(await cacheClientUtils.getResultsFromCache(testCase.key)).toEqual(testCase.value)
        }
    })
})

describe('setKeyInHydrationCaches', () => {
    const id1 = new ObjectId()
    const id2 = new ObjectId()

    const document1 = generateTestDocument({_id: id1, name: 'testModelName1'})
    const document2 = generateTestDocument({_id: id2, name: 'testModelName2'})
    const document3 = generateTestDocument({_id: id1, name: 'testModelName1_withVariation', fieldA: 'fieldA'})

    beforeEach(async () => {
        await cacheClientUtils.setKeyInHydrationCaches('testKey1', document1, {})
        await cacheClientUtils.setKeyInHydrationCaches('testKey2', document2, {})
        await cacheClientUtils.setKeyInHydrationCaches('testKey1_varation', document3, {})
    })

    test(`keys after set should be accessible with the getHydrationCache method`, async () => {
        expect(mockedGetHydrationCache).toBeCalled()
        expect(mockedAddValueToInternalCachedSet).toBeCalled()

        expect(await commonUtils.getHydrationCache().get('testKey1')).toEqual(document1)
        expect(await commonUtils.getHydrationCache().get('testKey2')).toEqual(document2)
        expect(await commonUtils.getHydrationCache().get('testKey1_varation')).toEqual(document3)
    })

    test(`getHydrationVariationsCache should return set with unique keys `, async () => {
        const set1 = await commonUtils.getHydrationVariationsCache().get(id1.toString()) as Set<string>
        const set2 = await commonUtils.getHydrationVariationsCache().get(id2.toString()) as Set<string>

        expect(getValuesFromSet(set1)).toEqual(['testKey1', 'testKey1_varation'].sort())
        expect(getValuesFromSet(set2)).toEqual(['testKey2',].sort())
    })

    test(`should allow to overwrite keys in hydration cache `, async () => {
        const document4 = generateTestDocument({_id: id1, name: 'someBrandNewDocumentToOverwrite'})
        await cacheClientUtils.setKeyInHydrationCaches('testKey1', document4, {})

        expect(mockedGetHydrationCache).toBeCalled()
        expect(mockedAddValueToInternalCachedSet).toBeCalled()

        expect(await commonUtils.getHydrationCache().get('testKey1')).not.toEqual(document1)
        expect(await commonUtils.getHydrationCache().get('testKey1')).toEqual(document4)

        const set1 = await commonUtils.getHydrationVariationsCache().get(id1.toString()) as Set<string>
        expect(getValuesFromSet(set1)).toEqual(['testKey1', 'testKey1_varation'].sort())
    })
})

describe('addValueToInternalCachedSet', () => {
    const cacheClient: Keyv<Set<string | number>> = cacheClientUtils.createInMemoryCacheClientWithNamespace('testNamespace')

    test(`should create set with first element if does not exists for given key`, async () => {
        await cacheClientUtils.addValueToInternalCachedSet(cacheClient, 'firstNamespace', 'firstValue')
        const set = await cacheClient.get('firstNamespace') as Set<string>

        expect(getValuesFromSet(set)).toEqual(['firstValue'])
    })

    test(`should add next element to exisitng set`, async () => {
        await cacheClientUtils.addValueToInternalCachedSet(cacheClient, 'secondNamespace', 'firstValue')
        await cacheClientUtils.addValueToInternalCachedSet(cacheClient, 'secondNamespace', 'secondValue')

        const set = await cacheClient.get('secondNamespace') as Set<string>

        expect(getValuesFromSet(set)).toEqual(['firstValue', 'secondValue'])
    })

    test(`should prevent parrarel saves into set`, async () => {
        await Promise.all(
            [cacheClientUtils.addValueToInternalCachedSet(cacheClient, 'thirdNamepsace', 'firstValue'),
            cacheClientUtils.addValueToInternalCachedSet(cacheClient, 'thirdNamepsace', 'secondValue'),
            cacheClientUtils.addValueToInternalCachedSet(cacheClient, 'thirdNamepsace', 'thirdValue'),
            cacheClientUtils.addValueToInternalCachedSet(cacheClient, 'thirdNamepsace', 'fourthValue'),
            cacheClientUtils.addValueToInternalCachedSet(cacheClient, 'thirdNamepsace', 'fifthValue'),
            cacheClientUtils.addValueToInternalCachedSet(cacheClient, 'thirdNamepsace', 'sixthValue')
            ])


        const set = await cacheClient.get('thirdNamepsace') as Set<string>

        expect(getValuesFromSet(set)).toEqual(['firstValue', 'secondValue', 'thirdValue', 'fourthValue', 'fifthValue', 'sixthValue'].sort())
    })
})

describe(`clearCacheForKey`, () => {

    test(`should log informations with debugger`, async () => {
        mockedLogCacheClear.mockClear()
        await clearCacheForKey('testKey')
        expect(mockedLogCacheClear).toBeCalledTimes(1)
        expect(mockedLogCacheClear).toHaveBeenCalledWith(`Clearing results cache for key`, 'testKey')
    })

    test(`should clear cached key from results cache`, async () => {
        const testCase = {
            key: 'magicHat',
            value: 'rabbit'
        }

        const strategy = await getCacheStrategyInstance()
        //setting value to clear
        await strategy.addValueToCache(CacheNamespaces.RESULTS_NAMESPACE, testCase.key, testCase.value)
        //checking if the value is set
        expect(await strategy.getValueFromCache(CacheNamespaces.RESULTS_NAMESPACE, testCase.key)).toEqual(testCase.value)
        //ok rabbit is still there. Lets do some magic  
        await clearCacheForKey(testCase.key)
        const cachedValue = await strategy.getValueFromCache(CacheNamespaces.RESULTS_NAMESPACE, testCase.key)
        // expect(cachedValue).not.toEqual(testCase.value)
        expect(cachedValue).toBeUndefined()
    })
})

describe(`clearCacheForRecordId`, () => {
    test(`should log informations with debugger`, async () => {
        mockedLogCacheClear.mockClear()
        await cacheClientUtils.clearCacheForRecordId('recordId')
        expect(mockedLogCacheClear).toBeCalledTimes(2)
        expect(mockedLogCacheClear).toHaveBeenCalledWith(`Clearing results and hydration cache for recordId`, 'recordId')
        expect(mockedLogCacheClear).toHaveBeenCalledWith(`Clearing hydration cache for recordId`, 'recordId')
    })

    test(`should clear hydration cache`, async () => {
        const testCase = {
            key: 'recordId',
            cacheQueryKey: 'cacheQueryKey',
            value: generateTestDocument({name: 'testDocument'})
        }
        const recordId = String(testCase.value._id)
        const strategy = getCacheStrategyInstance()
        //setting value to clear
        await strategy.addValueToManyCachedSets([recordId], testCase.cacheQueryKey)
        await cacheClientUtils.setKeyInHydrationCaches(testCase.key, testCase.value, {cacheKey: testCase.cacheQueryKey})
        //checking if the value was set
        expect(await commonUtils.getHydrationCache().get(testCase.key)).toEqual(testCase.value)
        expect(await strategy.getValuesFromCachedSet(recordId)).toEqual([testCase.cacheQueryKey])

        // invoking clearCacheForRecordId
        await cacheClientUtils.clearCacheForRecordId(recordId)

        expect(await commonUtils.getHydrationCache().get(testCase.key)).toBeUndefined()
        expect(await strategy.getValuesFromCachedSet(recordId)).toEqual([])
    })
})
