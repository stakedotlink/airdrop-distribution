import fs from 'fs'
import { network } from 'hardhat'

const bucketSize = 4779332 * 1e18
const excludeAddresses = [
  '0x0aA3d1c7838e20790A196d56899fE0Bc8B23700F', // LPL Owners Pool
  '0x08341befE6428568cdF798D19223821697DcEC15', // LPL Migration
  '0xAEF186611EC96427d161107fFE14bba8aA1C2284', // Delegator Pool
  '0xab31ae46f4d4dd01a475d41832de9b863b712e13', // LinkPool wallet
  '0xB351EC0FEaF4B99FdFD36b484d9EC90D0422493D', // DAO wallet
  '0xdedA4c43136D4f40F75073B0d815c648330fD072', // Chainlink wallet
  // Node Op Addresses
  '0x6879826450e576b401c4ddeff2b7755b1e85d97c',
  '0x20C0B7b370c97ed139aeA464205c05fCeAF4ac68',
  '0x26119F458dD1E8780554e3e517557b9d290Fb4dD',
  '0x479F6833BC5456b00276473DB1bD3Ee93ff8E3e2',
  '0xF2aD781cFf42E1f506b78553DA89090C65b1A847',
  '0xc316276f87019e5adbc3185A03e23ABF948A732D',
  '0xfAE26207ab74ee528214ee92f94427f8Cdbb6A32',
  '0x4dc81f63CB356c1420D4620414f366794072A3a8',
  '0xa0181758B14EfB2DAdfec66d58251Ae631e2B942',
  '0xcef3Da64348483c65dEC9CB1f59DdF46B0149755',
  '0xE2b7cBA5E48445f9bD17193A29D7fDEb4Effb078',
  '0x06c28eEd84E9114502d545fC5316F24DAa385c75',
  '0x6eF38c3d1D85B710A9e160aD41B912Cb8CAc2589',
  '0x3F44C324BD76E031171d6f2B87c4FeF00D4294C2',
  '0xd79576F14B711406a4D4489584121629329dFa2C',
].map((address) => address.toLowerCase())

const readBalanceData = (name: string) => {
  let json = JSON.parse(
    fs.readFileSync(`scripts/balanceMapGeneration/SDL/patch/${name}.json`, {
      encoding: 'utf8',
    })
  )

  if (typeof json !== 'object') throw new Error('Invalid JSON')

  return json
}

const sumBalanceMaps = (balanceMaps: any[]) => {
  const summedBalanceMap: any = {}

  balanceMaps.forEach((balanceMap) => {
    Object.keys(balanceMap).forEach((address) => {
      const formattedAddress = address.toLowerCase()

      if (excludeAddresses.includes(formattedAddress)) return

      if (!summedBalanceMap[formattedAddress]) {
        summedBalanceMap[formattedAddress] = 0
      }
      summedBalanceMap[formattedAddress] += Number(balanceMap[address])
    })
  })

  return summedBalanceMap
}

const getLPLBalanceMap = (snapshotMonth: string) => {
  const lplBalances = readBalanceData(`${snapshotMonth}-lpl-balances`)
  const lplaBalances = readBalanceData(`${snapshotMonth}-lpla-balances`)

  return sumBalanceMaps([lplBalances, lplaBalances])
}

const getSDLBalanceMap = (snapshotMonth: string) => {
  const sdlBalances = readBalanceData(`${snapshotMonth}-sdl-balances`)
  const stSDLBalances = readBalanceData(`${snapshotMonth}-stsdl-balances`)
  const sdlLPBalances = readBalanceData(`${snapshotMonth}-sdl-slp-balances`)

  return sumBalanceMaps([sdlBalances, stSDLBalances, sdlLPBalances])
}

// LPL and LPLA holders (as of Nov snapshot)
const getBucket1 = (balanceMap: any) => {
  const lplBalanceMapNov = getLPLBalanceMap('nov')
  const totalLPL = Object.values(lplBalanceMapNov).reduce(
    (total: number, amount: any) => total + amount,
    0
  )

  Object.keys(lplBalanceMapNov).forEach((address) => {
    if (!balanceMap[address]) {
      balanceMap[address] = 0
    }
    balanceMap[address] += (lplBalanceMapNov[address] / totalLPL) * bucketSize
  })
}

// LPL and LPLA holders (as of Nov snapshot) who migrated and retained greater than 50% of
// their original SDL allocation (as of Dec snapshot)
const getBucket2 = (balanceMap: any) => {
  const lplBalanceMapNov = getLPLBalanceMap('nov')
  const lplBalanceMapDec = getLPLBalanceMap('dec')
  const sdlBalanceMapDec = getSDLBalanceMap('dec')
  const sdlBalanceMapApr = getSDLBalanceMap('apr')
  const eligibleSDLBalanceMap: any = {}
  let totalEligibleSDL = 0

  Object.keys(lplBalanceMapNov).forEach((address) => {
    const lplBalanceNov = lplBalanceMapNov[address]
    const lplBalanceDec = lplBalanceMapDec[address] || 0
    const sdlAllocation = lplBalanceNov / 2
    const sdlBalanceDec = sdlBalanceMapDec[address] || 0
    const sdlBalanceApr = sdlBalanceMapApr[address] || 0

    // migrated and retained >= 50% as of dec snapshot
    if (sdlBalanceDec >= sdlAllocation / 2) {
      const eligibleSDLBalance = Math.min(sdlAllocation, sdlBalanceDec)
      eligibleSDLBalanceMap[address] = eligibleSDLBalance
      totalEligibleSDL += eligibleSDLBalance
      // did not migrate as of dec snapshot but migrated and retained >= 50% as of apr snapshot
    } else if (lplBalanceDec >= lplBalanceNov && sdlBalanceApr >= sdlAllocation / 2) {
      const eligibleSDLBalance = Math.min(sdlAllocation, sdlBalanceApr)
      eligibleSDLBalanceMap[address] = eligibleSDLBalance
      totalEligibleSDL += eligibleSDLBalance
    }
  })

  Object.keys(eligibleSDLBalanceMap).forEach((address) => {
    if (!balanceMap[address]) {
      balanceMap[address] = 0
    }
    balanceMap[address] += (eligibleSDLBalanceMap[address] / totalEligibleSDL) * bucketSize
  })
}

// SDL holders (as of dec snapshot)
const getBucket3 = (balanceMap: any) => {
  const sdlBalanceMapDec = getSDLBalanceMap('dec')
  const sdlBalanceMapApr = getSDLBalanceMap('apr')
  const lplBalanceMapNov = getLPLBalanceMap('nov')
  const lplBalanceMapDec = getLPLBalanceMap('dec')
  const totalSDLBalanceMap: any = {}
  let totalSDL = 0

  // LPL / LPLA holders that did not migrate as of dec snapshot but migrated and retained >= 50% as of apr snapshot
  Object.keys(lplBalanceMapNov).forEach((address) => {
    const lplBalanceNov = lplBalanceMapNov[address]
    const lplBalanceDec = lplBalanceMapDec[address] || 0
    const sdlBalanceApr = sdlBalanceMapApr[address] || 0
    const sdlAllocation = lplBalanceNov / 2

    if (lplBalanceDec >= lplBalanceNov && sdlBalanceApr >= sdlAllocation / 2) {
      const eligibleSDLBalance = Math.min(sdlAllocation, sdlBalanceApr)
      if (!totalSDLBalanceMap[address]) {
        totalSDLBalanceMap[address] = 0
      }
      totalSDLBalanceMap[address] += eligibleSDLBalance
      totalSDL += eligibleSDLBalance
    }
  })

  // SDL holders as of dec snapshot
  Object.keys(sdlBalanceMapDec).forEach((address) => {
    const sdlBalance = sdlBalanceMapDec[address]
    if (!totalSDLBalanceMap[address]) {
      totalSDLBalanceMap[address] = sdlBalance
      totalSDL += sdlBalance
    }
  })

  Object.keys(totalSDLBalanceMap).forEach((address) => {
    if (!balanceMap[address]) {
      balanceMap[address] = 0
    }
    balanceMap[address] += (totalSDLBalanceMap[address] / totalSDL) * bucketSize
  })
}

async function main() {
  const balanceMap: any = {}

  getBucket1(balanceMap)
  getBucket2(balanceMap)
  getBucket3(balanceMap)

  Object.keys(balanceMap).forEach((address) => {
    let amount = Math.trunc(balanceMap[address])
    if (amount == 0) {
      delete balanceMap[address]
    } else {
      balanceMap[address] = amount
    }
  })

  fs.writeFileSync(
    `scripts/merkleGeneration/SDL/inputMap.${network.name}.json`,
    JSON.stringify(balanceMap, null, 1)
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
