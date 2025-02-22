import { Aggregate } from 'mongoose';
import { SpeedGooseCacheOperationContext, SpeedGooseConfig, SpeedGooseDebuggerOperations } from '../../../src/types/types';
import { getDebugger } from '../../../src/utils/debugUtils';
import { generateTestAggregate } from '../../testUtils';

type AggregateParamsOperationTestData = {
    given: {
        aggregationPipeline: Aggregate<unknown>;
        config: SpeedGooseConfig;
        params: SpeedGooseCacheOperationContext;
    };
    expected: SpeedGooseCacheOperationContext;
};

export const generateAggregateParamsOperationTestData = (): AggregateParamsOperationTestData[] => [
    // t01 - multitenancy with tenant multitenantValue in params and ttl in params
    {
        given: {
            aggregationPipeline: generateTestAggregate([{ $match: { someField: 'someValue' } }]),
            config: {
                redisUri: 'redisUri',
                multitenancyConfig: {
                    multitenantKey: 'tenantId',
                },
                defaultTtl: 30,
            },
            params: {
                ttl: 120,
                multitenantValue: 'tenantTestValue',
            },
        },
        expected: {
            ttl: 120,
            cacheKey: '{"pipeline":[{"$match":{"someField":"someValue"}}],"collection":"testmodels"}',
            multitenantValue: 'tenantTestValue',
            debug: expect.any(Function),
        },
    },
    // t02 - multitenancy disable but multitenantValue is set in params
    {
        given: {
            aggregationPipeline: generateTestAggregate([{ $match: { someField: 'someValue' } }]),
            config: {
                redisUri: 'redisUri',
                defaultTtl: 30,
            },
            params: {
                multitenantValue: 'tenantTestValue',
            },
        },
        expected: {
            ttl: 30,
            cacheKey: '{"pipeline":[{"$match":{"someField":"someValue"}}],"collection":"testmodels"}',
            multitenantValue: 'tenantTestValue',
            debug: expect.any(Function),
        },
    },
    // t03 - multitenancy disable, cacheKey set in params right with ttl, debug enabled
    {
        given: {
            aggregationPipeline: generateTestAggregate([{ $match: { someField: 'someValue' } }]),
            config: {
                redisUri: 'redisUri',
                defaultTtl: 30,
                debugConfig: {
                    enabled: true,
                },
            },
            params: {
                ttl: 90,
                cacheKey: 'aggregateTestKey',
                debug: getDebugger('testModel', SpeedGooseDebuggerOperations.CACHE_QUERY),
            },
        },
        expected: {
            ttl: 90,
            cacheKey: 'aggregateTestKey',
            debug: expect.any(Function),
        },
    },
];
