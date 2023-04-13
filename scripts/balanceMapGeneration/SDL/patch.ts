import fs from 'fs'
import { BigNumber } from 'ethers'

const DIR = 'scripts/balanceMapGeneration/SDL'
const VESTING_ROOT_ADDRESS = '0x9B6307c836019895eaA7b30EA91220A91E5c4520'

const readJson = (name: string) =>
  JSON.parse(
    fs.readFileSync(`${DIR}/patch/${name}-balances.json`, {
      encoding: 'utf8',
    })
  )

const writeJson = (name: string, json: any) =>
  fs.writeFileSync(`${DIR}/patch/${name}-balances.json`, JSON.stringify(json, null, 2))

const copyDirSync = (src: string, dest: string) => {
  fs.mkdirSync(dest, { recursive: true })
  fs.readdirSync(src).forEach((file) => {
    const srcPath = `${src}/${file}`
    const destPath = `${dest}/${file}`

    if (fs.statSync(srcPath).isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  })
}

const initPatch = () => {
  copyDirSync(`${DIR}/balanceData`, `${DIR}/patch`)
}

const createPatch = (name: any, wallets: any) =>
  wallets.reduce((prev: any, { address, allocation }: any) => {
    const key = Object.keys(prev).find((item) => item.toLowerCase() === address.toLowerCase())
    const value = key ? BigNumber.from(prev[key]) : BigNumber.from('0')
    const index = key ? key : address

    return {
      ...prev,
      [index]: value.add(allocation).toString(),
    }
  }, readJson(name))

const testPatch = (patch: any, wallets: any) =>
  wallets.reduce((prev: any, { address, balance }: any) => {
    const key = Object.keys(patch).find((item) => item.toLowerCase() === address.toLowerCase())
    if (!key) return false

    const newBalance = BigNumber.from(patch[key])
    const verified = newBalance.eq(balance)

    return prev && verified
  }, true)

const LPL = () => {
  const wallet1 = {
    address: '0x2b2ae79b92631eaa796140620bc64837ba9f761c',
    allocation: BigNumber.from('-1020408000000000000000000'),
    balance: BigNumber.from('0'),
  }
  const wallet2 = {
    address: '0x1d0ca7f39cfce77320a8ba53c28cd9cadf52787d',
    allocation: BigNumber.from('-1750000000000000000000000'),
    balance: BigNumber.from('0'),
  }

  const root = {
    address: VESTING_ROOT_ADDRESS,
    allocation: wallet1.allocation.add(wallet2.allocation).abs(),
    balance: BigNumber.from('2770408000000000000000000'),
  }

  const name = 'nov-lpl'
  const wallets = [wallet1, wallet2, root]
  const patched = createPatch(name, wallets)
  const verified = testPatch(patched, wallets)

  if (verified) writeJson(name, patched)
}

const stSDL = () => {
  const wallet1 = {
    address: '0x4dedaa1e0a226c8e7f826f1a34d516ac98599b9b',
    allocation: BigNumber.from('-133333330000000000000000'),
    balance: BigNumber.from('26383929088995829327147'),
  }
  const wallet2 = {
    address: '0x31803a1bd9aa6f6acbdf11af74f54f1b36d21131',
    allocation: BigNumber.from('-133333330000000000000000'),
    balance: BigNumber.from('14419623169130960348002'),
  }

  const wallet3 = {
    address: '0x3db1dbc23234a810e42a746b5631eb6d1cde9669',
    allocation: BigNumber.from('-133333330000000000000000'),
    balance: BigNumber.from('0'),
  }

  const root = {
    address: VESTING_ROOT_ADDRESS,
    allocation: wallet1.allocation.add(wallet2.allocation).add(wallet3.allocation).abs(),
    balance: BigNumber.from('399999990000000000000000'),
  }

  const name = 'dec-stsdl'
  const wallets = [wallet1, wallet2, , wallet3, root]
  const patched = createPatch(name, wallets)
  const verified = testPatch(patched, wallets)

  if (verified) writeJson(name, patched)
}

const SDL = () => {
  const wallet1 = {
    address: '0x12ccc98c23ad652a0eb69e6937dded95664ac740',
    allocation: BigNumber.from('-8999975000000000000000'),
    balance: BigNumber.from('0'),
  }
  const wallet2 = {
    address: '0x164ee02210ac1fb90c11368e3f6cdf7a3c8db97d',
    allocation: BigNumber.from('-11646059597403050000000'),
    balance: BigNumber.from('0'),
  }
  const wallet3 = {
    address: '0x10e7587d074520d713705849f7f42a220413cdbd',
    allocation: BigNumber.from('-18940449544942020000000'),
    balance: BigNumber.from('0'),
  }
  const wallet4 = {
    address: '0x137c6921015ec76a702feda965e4bea2b8e428f0',
    allocation: BigNumber.from('-21245117711814845738026'),
    balance: BigNumber.from('0'),
  }
  const wallet5 = {
    address: '0x1660a83d7ff5d9be484fada175c8ccc7662b250b',
    allocation: BigNumber.from('-10000000000000000000000'),
    balance: BigNumber.from('0'),
  }
  const wallet6 = {
    address: '0x10c60226363dad6bc00d6f4614bc4fbe246fa912',
    allocation: BigNumber.from('-3547000000000000000000'),
    balance: BigNumber.from('0'),
  }

  const root = {
    address: VESTING_ROOT_ADDRESS,
    allocation: wallet1.allocation
      .add(wallet2.allocation)
      .add(wallet3.allocation)
      .add(wallet4.allocation)
      .add(wallet5.allocation)
      .add(wallet6.allocation)
      .abs(),
    balance: BigNumber.from('884582941854159915738026'),
  }

  const wallet7 = {
    address: '0xd27b7d42d24d8f7c1cf5c46ccd3b986c396fde17',
    allocation: BigNumber.from('-447268027107153688986095'),
    balance: BigNumber.from('0'),
  }

  const name = 'dec-sdl'
  const wallets = [wallet1, wallet2, , wallet3, wallet4, wallet5, wallet6, root, wallet7]
  const patched = createPatch(name, wallets)
  const verified = testPatch(patched, wallets)

  if (verified) writeJson(name, patched)
}

const SDLSLP = () => {
  const wallet1 = {
    address: '0x454ff404b6766bf15c73c8804f405f8e99a87f4a',
    allocation: BigNumber.from('-294787692146577030622571'),
    balance: BigNumber.from('0'),
  }

  const root = {
    address: VESTING_ROOT_ADDRESS,
    allocation: wallet1.allocation.abs(),
    balance: BigNumber.from('294787692146577030622571'),
  }

  const name = 'dec-sdl-slp'
  const wallets = [wallet1, root]
  const patched = createPatch(name, wallets)
  const verified = testPatch(patched, wallets)

  if (verified) writeJson(name, patched)
}

const patch = () => {
  initPatch()
  LPL()
  stSDL()
  SDL()
  SDLSLP()
}

patch()
