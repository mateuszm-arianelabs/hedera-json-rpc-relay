/*-
 *
 * Hedera JSON RPC Relay
 *
 * Copyright (C) 2022-2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

import { Logger } from 'pino';
import { Gauge, Registry } from 'prom-client';
import { ICacheClient } from './ICacheClient';
import constants from '../../constants';
import LRUCache, { LimitedByCount, LimitedByTTL } from 'lru-cache';

/**
 * Represents a LocalLRUCache instance that uses an LRU (Least Recently Used) caching strategy
 * for caching items internally from requests.
 * @implements {ICacheClient}
 */
export class LocalLRUCache implements ICacheClient {
  /**
   * Configurable options used when initializing the cache.
   *
   * @private
   */
  private readonly options: LimitedByCount & LimitedByTTL = {
    // The maximum number (or size) of items that remain in the cache (assuming no TTL pruning or explicit deletions).
    max: Number.parseInt(process.env.CACHE_MAX ?? constants.CACHE_MAX.toString()),
    // Max time to live in ms, for items before they are considered stale.
    ttl: Number.parseInt(process.env.CACHE_TTL ?? constants.CACHE_TTL.ONE_HOUR.toString()),
  };

  /**
   * The LRU cache used for caching items from requests.
   *
   * @private
   */
  private readonly cache: LRUCache<string, any>;

  /**
   * The logger used for logging all output from this class.
   * @private
   */
  private readonly logger: Logger;

  /**
   * The metrics register used for metrics tracking.
   * @private
   */
  private readonly register: Registry;
  private readonly cacheKeyGauge: Gauge<string>;

  /**
   * Represents a LocalLRUCache instance that uses an LRU (Least Recently Used) caching strategy
   * for caching items internally from requests.
   * @implements {ICacheClient}
   * @class
   * @constructor
   * @param {Logger} logger - The logger instance to be used for logging.
   * @param {Registry} register - The registry instance used for metrics tracking.
   */
  public constructor(logger: Logger, register: Registry) {
    this.cache = new LRUCache(this.options);
    this.logger = logger;
    this.register = register;

    const cacheSizeCollect = (): void => {
      this.purgeStale();
      this.cacheKeyGauge.set(this.cache.size);
    };

    const metricCounterName = 'rpc_relay_cache';
    register.removeSingleMetric(metricCounterName);
    this.cacheKeyGauge = new Gauge({
      name: metricCounterName,
      help: 'Relay LRU cache gauge',
      registers: [register],
      async collect(): Promise<void> {
        cacheSizeCollect();
      },
    });
  }

  /**
   * Retrieves a cached value associated with the given key.
   * If the value exists in the cache, updates metrics and logs the retrieval.
   * @param {string} key - The key associated with the cached value.
   * @param {string} callingMethod - The name of the method calling the cache.
   * @param {string} requestIdPrefix - A prefix to include in log messages (optional).
   * @returns {*} The cached value if found, otherwise null.
   */
  public async get(key: string, callingMethod: string, requestIdPrefix?: string): Promise<any> {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.logger.trace(
        `${requestIdPrefix} returning cached value ${key}:${JSON.stringify(value)} on ${callingMethod} call`,
      );
      return value;
    }

    return null;
  }

  /**
   * The remaining TTL of the specified key in the cache.
   * @param {string} key - The key to check the remaining TTL for.
   * @param {string} callingMethod - The name of the method calling the cache.
   * @param {string} [requestIdPrefix] - A prefix to include in log messages (optional).
   * @returns {Promise<number>} The remaining TTL in milliseconds.
   */
  public async getRemainingTtl(key: string, callingMethod: string, requestIdPrefix?: string): Promise<number> {
    const remainingTtl = this.cache.getRemainingTTL(key); // in milliseconds
    this.logger.trace(`${requestIdPrefix} returning remaining TTL ${key}:${remainingTtl} on ${callingMethod} call`);
    return remainingTtl;
  }

  /**
   * Sets a value in the cache associated with the given key.
   * Updates metrics, logs the caching, and associates a TTL if provided.
   * @param {string} key - The key to associate with the value.
   * @param {*} value - The value to cache.
   * @param {string} callingMethod - The name of the method calling the cache.
   * @param {number} ttl - Time to live for the cached value in milliseconds (optional).
   * @param {string} requestIdPrefix - A prefix to include in log messages (optional).
   */
  public async set(
    key: string,
    value: any,
    callingMethod: string,
    ttl?: number,
    requestIdPrefix?: string,
  ): Promise<void> {
    const resolvedTtl = ttl ?? this.options.ttl;
    this.logger.trace(`${requestIdPrefix} caching ${key}:${JSON.stringify(value)} for ${resolvedTtl} ms`);
    this.cache.set(key, value, { ttl: resolvedTtl });
  }

  /**
   * Stores multiple key-value pairs in the cache.
   *
   * @param keyValuePairs - An object where each property is a key and its value is the value to be cached.
   * @param callingMethod - The name of the calling method.
   * @param requestIdPrefix - Optional request ID prefix for logging.
   * @returns {Promise<void>} A Promise that resolves when the values are cached.
   */
  public async multiSet(
    keyValuePairs: Record<string, any>,
    callingMethod: string,
    requestIdPrefix?: string,
  ): Promise<void> {
    // Iterate over each entry in the keyValuePairs object
    for (const [key, value] of Object.entries(keyValuePairs)) {
      await this.set(key, value, callingMethod, undefined, requestIdPrefix);
    }
  }

  /**
   * Stores multiple key-value pairs in the cache.
   *
   * @param keyValuePairs - An object where each property is a key and its value is the value to be cached.
   * @param callingMethod - The name of the calling method.
   * @param ttl - Time to live on the set values
   * @param requestIdPrefix - Optional request ID prefix for logging.
   * @returns {void} A Promise that resolves when the values are cached.
   */
  public async pipelineSet(
    keyValuePairs: Record<string, any>,
    callingMethod: string,
    ttl?: number,
    requestIdPrefix?: string,
  ): Promise<void> {
    // Iterate over each entry in the keyValuePairs object
    for (const [key, value] of Object.entries(keyValuePairs)) {
      await this.set(key, value, callingMethod, ttl, requestIdPrefix);
    }
  }

  /**
   * Deletes a cached value associated with the given key.
   * Logs the deletion of the cache entry.
   * @param {string} key - The key associated with the cached value to delete.
   * @param {string} callingMethod - The name of the method calling the cache.
   * @param {string} requestIdPrefix - A prefix to include in log messages (optional).
   */
  public async delete(key: string, callingMethod: string, requestIdPrefix?: string): Promise<void> {
    this.logger.trace(`${requestIdPrefix} delete cache for ${key}`);
    this.cache.delete(key);
  }

  /**
   * Purges stale entries from the cache.
   * This method should be called periodically to remove items that have expired.
   */
  public purgeStale(): void {
    this.cache.purgeStale();
  }

  /**
   * Clears the entire cache, removing all entries.
   * Use this method with caution, as it wipes all cached data.
   */
  public async clear(): Promise<void> {
    this.cache.clear();
  }

  /**
   * Retrieves all keys in the cache that match the given pattern.
   * @param {string} pattern - The pattern to match keys against.
   * @param {string} callingMethod - The name of the method calling the cache.
   * @param {string} requestIdPrefix - A prefix to include in log messages (optional).
   * @returns {Promise<string[]>} An array of keys that match the pattern.
   */
  public async keys(pattern: string, callingMethod: string, requestIdPrefix?: string): Promise<string[]> {
    const keys = Array.from(this.cache.rkeys());

    // Replace escaped special characters with placeholders
    let regexPattern = pattern
      .replace(/\\\*/g, '__ESCAPED_STAR__')
      .replace(/\\\?/g, '__ESCAPED_QUESTION__')
      .replace(/\\\[/g, '__ESCAPED_OPEN_BRACKET__')
      .replace(/\\]/g, '__ESCAPED_CLOSE_BRACKET__');

    // Replace unescaped special characters with regex equivalents
    regexPattern = regexPattern
      .replace(/\\([*?[\]])/g, (_, char) => `__ESCAPED_${char}__`)
      .replace(/\[([^\]\\]+)]/g, '[$1]')
      .replace(/(?<!\\)\*/g, '.*')
      .replace(/(?<!\\)\?/g, '.')
      .replace(/(?<!\\)\[!]/g, '[^]');

    // Replace placeholders with the original special characters
    regexPattern = regexPattern
      .replace(/__ESCAPED_STAR__/g, '\\*')
      .replace(/__ESCAPED_QUESTION__/g, '\\?')
      .replace(/__ESCAPED_OPEN_BRACKET__/g, '\\[')
      .replace(/__ESCAPED_CLOSE_BRACKET__/g, '\\]');

    const regex = new RegExp(regexPattern);

    const matchingKeys = keys.filter((key) => regex.test(key));

    this.logger.trace(`${requestIdPrefix} retrieving keys matching ${pattern} on ${callingMethod} call`);
    return matchingKeys;
  }
}
