/*-
 * ‌
 * Hedera JSON RPC Relay
 *
 * Copyright (C) 2022-2024 Hedera Hashgraph, LLC
 * ​
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
 * ‍
 */

import http from 'k6/http';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

import { TestScenarioBuilder } from '../../lib/common.js';
import { isNonErrorResponse, httpParams, getPayLoad } from './common.js';

const url = __ENV.RELAY_BASE_URL;

const methodName = 'eth_call';
const { options, run } = new TestScenarioBuilder()
  .name(methodName) // use unique scenario name among all tests
  .request((testParameters) => {
    // select a random contract address
    const contractIndex = randomIntBetween(0, testParameters.contractsAddresses.length - 1);
    const contractAddress = testParameters.contractsAddresses[contractIndex];
    // select a random  from  address
    const fromIndex = randomIntBetween(0, testParameters.wallets.length - 1);
    const from = testParameters.wallets[fromIndex].address;

    return http.post(
      url,
      getPayLoad(methodName, [{ from: from, to: contractAddress, data: '0xcfae3217' }, 'latest']),
      httpParams,
    );
  })
  .check(methodName, (r) => isNonErrorResponse(r))
  .testDuration('3s')
  .maxDuration(2000)
  .build();

export { options, run };
