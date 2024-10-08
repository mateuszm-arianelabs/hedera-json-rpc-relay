# Hbar limiter service design

## Table of Contents

- [Hbar limiter service design](#hbar-limiter-service-design)
  - [Table of Contents](#table-of-contents)
  - [Purpose](#purpose)
  - [Goals](#goals)
  - [Requirements](#requirements)
    - [Spending Tracking](#spending-tracking)
    - [Spending Limits](#spending-limits)
  - [Architecture](#architecture)
    - [High-Level Design](#high-level-design)
    - [Class Diagram](#class-diagram)
  - [Additional Considerations](#additional-considerations)
    - [Performance](#performance)
    - [Monitoring and logging](#monitoring-and-logging)
  - [Future enhancements](#future-enhancements)

## Purpose

The purpose of the HBar Limiter is to track and control the spending of HBars in real-time across various operations and transaction types. It aims to provide flexible hbar limiting capabilities for relay operators, ensuring efficient resource utilization and preventing potential misuse or drainage of HBars.

## Goals

1. Implement real-time tracking of HBar spending across different operations and transaction types.
2. Provide configurable limiting based on various criteria such as sending address and IP address.
3. Offer tiered access control for different user groups or projects.
4. Enable early detection and prevention of potential HBar drainage.
5. Support flexible alerting mechanisms for spending thresholds.

## Requirements

### Spending Tracking

1. Track HBar spending in real-time.
2. Categorize spending by:
   a. Operation type (e.g., FileAppend, FileCreate)
   b. Transaction type (Ethereum or Hedera)

### Spending Limits

1. Compare current spending against:
   a. Total predefined limit
   b. Current operator balance
2. Support limits based on transaction origin address (`tx.from`).
   1. Limit based on `tx.from`
   2. Limit based on IP
3. Support tiered spending limits, e.g.:
   - **Tier 1**: Trusted Partners (unlimited)
   - **Tier 2**: Supported projects (higher limit)
   - **Tier 3**: General users (standard limit)

### Early Detection and Prevention (Preemptive Rate Limit)

**Preemptive Rate Limiting for HFS Transactions**

1. Calculate the number of potential HFS transactions based on the size of the incoming call data:

   - **File Create:** 1 transaction
   - **File Append:** (size_of_call_data / file_chunk_size) transactions

2. Use the [Hedera Fee Estimator](https://hedera.com/fees) to estimate the costs of each HFS transaction, based on the maximum chunk size configuration (currently set to 5 KB).

3. Calculate the total estimated fee and compare it against the remaining budget to determine if a preemptive rate limit should be applied.

## Architecture

### High-Level Design

The Hbar limiter will be implemented as a separate service, used by other services/classes that need it. It will have two main purposes - to capture the gas fees for different operation and to check if an operation needs to be paused, due to exceeded Hbar limit

### Class Diagram

#### Service Layer

```mermaid
classDiagram
    class SdkClient {
        -hbarLimitService: IHBarLimitService
        -metricService: MetricService
        +executeTransaction(transaction: Transaction, callerName: string, interactingEntity: string, requestId?: string): Promise<TransactionId>
        +executeQuery~T~(query: Query~T~, callerName: string, interactingEntity: string, requestId?: string): Promise<Query~T~>
    }

    class MetricService {
      -hbarLimitService: IHBarLimitService
      +captureTransactionFees(transaction: Transaction, callerName: string, interactingEntity: string, requestId?: string) void
      +captureQueryFees~T~(query: Query~T~, callerName: string, interactingEntity: string, requestId?: string) void
    }

    class HBarLimitService {
        -hbarSpendingPlanRepository: HbarSpendingPlanRepository
        -ethAddressHbarSpendingPlanRepository: EthAddressHbarSpendingPlanRepository
        -ipAddressHbarSpendingPlanRepository: IpAddressHbarSpendingPlanRepository
        +shouldLimit(txFrom: string, ip?: string) boolean
        +shouldPreemtivelyLimitFileTransactions(callDataSize: number, fileChunkSize: number, currentNetworkExchangeRateInCents: number) boolean
        +resetLimiter() void
        +addExpense(amount: number, txFrom: string, ip?: string) void
        -getSpendingPlanOfEthAddress(address: string): HbarSpendingPlan
        -getSpendingPlanOfIpAddress(ip: string): HbarSpendingPlan
        -checkTotalSpent() boolean
        -shouldReset() boolean
    }

    class IHBarLimitService
    <<interface>> IHBarLimitService
    IHBarLimitService : shouldLimit() boolean
    IHBarLimitService : shouldPreemtivelyLimitFileTransactions() boolean
    IHBarLimitService : resetLimiter() void
    IHBarLimitService : addExpense() void

    SdkClient --> MetricService : uses
    SdkClient --> IHBarLimitService : uses
    MetricService --> IHBarLimitService : uses
    IHBarLimitService <|-- HBarLimitService: implements
```

#### Database Layer:

```mermaid
classDiagram
    class HbarSpendingPlan {
        -id: string
        -subscriptionType: SubscriptionType
        -createdAt: Date
        -active: boolean
        -spendingHistory: HbarSpendingRecord[]
        -spentToday: number
    }

    class HbarSpendingRecord {
        -amount: number
        -timestamp: Date
    }

    class EthAddressHbarSpendingPlan {
        -ethAddress: string
        -planId: string
    }

    class IpAddressHbarSpendingPlan {
        -ipAddress: string
        -planId: string
    }

    class CacheService {
        -internalCache: ICacheClient
        -sharedCache: ICacheClient
        +getAsync<T>(key: string, callingMethod: string, requestIdPrefix?: string): Promise<T>
        +set(key: string, value: any, callingMethod: string, ttl?: number, requestIdPrefix?: string): Promise<void>
        +multiSet(entries: Record<string, any>, callingMethod: string, ttl?: number, requestIdPrefix?: string): Promise<void>
        +delete(key: string, callingMethod: string, requestIdPrefix?: string): Promise<void>
        +clear(requestIdPrefix?: string): Promise<void>
        +incrBy(key: string, amount: number, callingMethod: string, requestIdPrefix?: string): Promise<number>
        +rPush(key: string, value: any, callingMethod: string, requestIdPrefix?: string): Promise<number>
        +lRange<T>(key: string, start: number, end: number, callingMethod: string, requestIdPrefix?: string): Promise<T[]>
    }

    class HbarSpendingPlanRepository {
        -cache: CacheService
        +findById(id: string): Promise<IHbarSpendingPlan>
        +findByIdWithDetails(id: string): Promise<IDetailedHbarSpendingPlan>
        +create(subscriptionType: SubscriptionType): Promise<IDetailedHbarSpendingPlan>
        +checkExistsAndActive(id: string): Promise<void>
        +getSpendingHistory(id: string): Promise<HbarSpendingRecord[]>
        +addAmountToSpendingHistory(id: string, amount: number): Promise<number>
        +getSpentToday(id: string): Promise<number>
        +addAmountToSpentToday(id: string, amount: number): Promise<void>
    }

    class EthAddressHbarSpendingPlanRepository {
        -cache: CacheService
        +findByAddress(ethAddress: string): Promise<EthAddressHbarSpendingPlan>
        +save(ethAddressPlan: EthAddressHbarSpendingPlan): Promise<void>
        +delete(ethAddress: string): Promise<void>
    }

    class IpAddressHbarSpendingPlanRepository {
        -cache: CacheService
        +findByIp(ip: string): Promise<IpAddressHbarSpendingPlan>
        +save(ipAddressPlan: IpAddressHbarSpendingPlan): Promise<void>
        +delete(ip: string): Promise<void>
    }

    class SubscriptionType
    <<Enumeration>> SubscriptionType
    SubscriptionType : BASIC
    SubscriptionType : EXTENDED
    SubscriptionType : PRIVILEGED

    HbarSpendingPlan --> SubscriptionType : could be one of the types
    HbarSpendingPlan --> HbarSpendingRecord : stores history of
    EthAddressHbarSpendingPlan --> HbarSpendingPlan : links an ETH address to
    IpAddressHbarSpendingPlan --> HbarSpendingPlan : links an IP address to

    HbarSpendingPlanRepository --> CacheService : uses
    EthAddressHbarSpendingPlanRepository --> CacheService : uses
    IpAddressHbarSpendingPlanRepository --> CacheService : uses
```

## Additional Considerations

### Performance

1. Ensure minimal impact on transaction processing times. (Capturing of transaction fees should happen asynchronously behind the scenes)
2. Design for high throughput to handle peak transaction volumes

### Monitoring and logging

1. Use the existing logger in the relay
2. Build on existing dashboards for system health and rate limiting statistics. Add any new metrics to the current dashboards.

## Future enhancements

1. Machine learning-based anomaly detection for unusual spending patterns.
