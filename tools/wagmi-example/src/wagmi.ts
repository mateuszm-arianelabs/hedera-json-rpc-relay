/*-
 *
 * Hedera JSON RPC Relay - Wagmi Example
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

import {http, createConfig} from 'wagmi'
import {hedera, hederaTestnet} from 'wagmi/chains'
import {coinbaseWallet, injected} from 'wagmi/connectors'

export const config = createConfig({
  chains: [hederaTestnet, hedera],
  connectors: [
    injected(),
    coinbaseWallet(),
  ],
  transports: {
    [hederaTestnet.id]: http(),
    [hedera.id]: http()
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
