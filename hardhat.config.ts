import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import '@nomicfoundation/hardhat-ledger'

const balance = '100000000000000000000000'
const accounts = [
  'c3381a96fa2be2aae2f2798e0887272e634417710aa09ecad9328754cdc8db8a',
  '33a3d35ee3408a701f0ff775390ede800f728562ed656ec0036f9e4fd96e7d5b',
  'fd52fbad9cb1258e30e6f83d1f2ecb2f6702887c1444d968133f41f3edb3f566',
  '73026645a77a51ebd812fd8780137f9b532a43cfadf379d1882dbfe5046bbff9',
  '73c8d46d8610c89d3f727fdd18099d9a142878bf5e010e65ba9382b8bb030b06',
  '630c184b1bb553100f94dc0dc8234b9334e0bf2e5595f83b1c494e09d5f5713a',
]

const config: HardhatUserConfig = {
  defaultNetwork: 'localhost',
  networks: {
    localhost: {
      url: 'http://127.0.0.1:8545',
      accounts,
    },
    mainnet: {
      url: '',
      ledgerAccounts: [],
      ledgerOptions: {
        derivationFunction: (x) => `m/44'/60'/0'/${x}`, // legacy derivation path
      },
    },
    hardhat: {
      chainId: 1337,
      accounts: accounts.map((acct) => ({ privateKey: acct, balance })),
      mining: {
        auto: true,
        interval: 5000,
      },
      // forking: {
      //   url: '',
      //   blockNumber: 22376526,
      // },
    },
  },
  etherscan: {
    apiKey: '',
  },
  solidity: { version: '0.8.29', settings: { optimizer: { enabled: true, runs: 200 } } },
  gasReporter: { enabled: false },
}

export default config
