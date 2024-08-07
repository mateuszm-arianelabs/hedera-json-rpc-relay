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

import pino from 'pino';
import { expect } from 'chai';
import { Registry } from 'prom-client';
import { RelayImpl } from '../../src/lib/relay';
import constants from '../../src/lib/constants';

const logger = pino();
const Relay = new RelayImpl(logger, new Registry());

describe('Net', async function () {
  it('should execute "net_listening"', function () {
    const result = Relay.net().listening();
    expect(result).to.eq(false);
  });

  it('should execute "net_version"', function () {
    const hederaNetwork: string = (process.env.HEDERA_NETWORK || '{}').toLowerCase();
    let expectedNetVersion = process.env.CHAIN_ID || constants.CHAIN_IDS[hederaNetwork] || '298';
    if (expectedNetVersion.startsWith('0x')) expectedNetVersion = parseInt(expectedNetVersion, 16).toString();

    const actualNetVersion = Relay.net().version();
    expect(actualNetVersion).to.eq(expectedNetVersion);
  });
});
