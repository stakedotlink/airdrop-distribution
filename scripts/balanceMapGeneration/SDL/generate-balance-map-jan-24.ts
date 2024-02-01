import fs from 'fs'
import { network, ethers } from 'hardhat'

const distributionAmount = 800000 * 1e18
const topRewards = [40000, 30000, 20000, 15000, 15000]
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

const raffleWinners = [
  '0xD8b158F394c32d66298e5e622de7cC4263BeaC7D',
  '0x26Cf23D6E30E03e46e7AbF4D4525F604CEa6f8d4',
  '0x915E88322EDFa596d29BdF163b5197c53cDB1A68',
  '0x27f476724960e15aA405Ce5A0D43C272A1FAeA0E',
  '0x12243A169c448d0bb039023039210D9A1084c9a9',
  '0x427a9957d3a131EE969a3BB5537070C6aEf03Ea4',
  '0x67CEC3Cd50c1C593D02b9bDE548bfd471bd33143',
  '0x62d76Bf057B4d5fe2509b6e95318057DBd6B4c27',
  '0x2c9bf6F31f79c1102c746AcE184596898c364229',
  '0x5CF90072DAbb1bF8cecAD5DBAE3Fd49226E9781E',
  '0x0eABE0E4f4285cD3874c7a7e8bff8f22e2311d9F',
  '0x97d61EBB746C139a3Fa9CC86b5e273e2ebe6629B',
  '0xa8737C2FfC0774f96c1DcAef5A5f82a53DC9e90d',
  '0xaf5555536A70EF5daE26FdEE44A04Ab8CC270Ec2',
  '0x86F5309Fa6BA046dEAeaF97C429591A82b5ff466',
  '0x04CE35bF4aFfcD47Cd81997e04D7A3173F8D7349',
  '0xeecb2169492d0cC78111afFA6c42e558B2F60E09',
  '0x9301fAD136578E07B7F91a2E0611464cED1FbEf0',
  '0x4112111874dD89D82d50B25D947De2fE937aa80D',
  '0x20cf96B69C750eCf4da1F68B8bDA9b1d6614ef56',
  '0x4deDaa1E0A226c8e7f826F1A34d516Ac98599B9b',
  '0xf60E69eD3B8cbd43330E31893E28925c8880B2BF',
  '0x223FcD1cc1d1357261fFCE1FC2f6b71671BB2482',
  '0x6541607C75bc3aBb53814D38e41f2c373d4C7cA8',
  '0x9afDa15071686B4131fcA4F8ec5950f69849eBD4',
  '0x99226A1EF791699e863CeF8b2A7622d7a97EB120',
  '0x400a27F8735BEF28698cd620b50C220e92685466',
  '0xaCf1A9E51682337bA52D4450F6695BF5CF6b0bc3',
  '0xc7029ba924d8684A6fdCDc444608B39bebcB0704',
  '0x81422e8868BED9F3779538CA3f8E7e4d80f28E52',
  '0x09A0718CCA56393CAf756279Bb961678C5E820ee',
  '0x5A0397d7d467B9b22eE4BC3de2Df230e56B41fB7',
]

const readBalanceData = (name: string) => {
  let json = JSON.parse(
    fs.readFileSync(`scripts/balanceMapGeneration/SDL/balanceData/${name}.json`, {
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
        summedBalanceMap[formattedAddress] = BigInt(0)
      }
      summedBalanceMap[formattedAddress] += BigInt(balanceMap[address])
    })
  })

  return summedBalanceMap
}

const getRESDLBalanceMap = (balanceMap: any) => {
  const resdlBalances = readBalanceData(`resdl-snapshot`)
  const sdlBalanceMap = sumBalanceMaps([resdlBalances])

  let totalreSDL = BigInt(0)

  Object.values(sdlBalanceMap).forEach((amount: any) => {
    totalreSDL += BigInt(amount)
  })

  if (totalreSDL === BigInt(0)) {
    throw new Error('Total reSDL is 0, check balance data.')
  }

  Object.keys(sdlBalanceMap).forEach((address) => {
    const addressAmount = BigInt(sdlBalanceMap[address])
    const share = (addressAmount * BigInt(distributionAmount)) / totalreSDL
    if (!balanceMap[address]) {
      balanceMap[address] = BigInt(0)
    }
    balanceMap[address] = BigInt(balanceMap[address]) + share
  })
}

const getLINKBalanceMap = (balanceMap: any) => {
  const linkBalances = readBalanceData(`pp-snapshot`)
  const linkBalanceMap = sumBalanceMaps([linkBalances])

  let totalLink = BigInt(0)

  Object.values(linkBalanceMap).forEach((amount: any) => {
    totalLink += BigInt(amount)
  })

  if (totalLink === BigInt(0)) {
    throw new Error('Total LINK is 0, check balance data.')
  }

  Object.keys(linkBalanceMap).forEach((address) => {
    const addressAmount = BigInt(linkBalanceMap[address])
    const share = (addressAmount * BigInt(20)) / BigInt(100)
    if (!balanceMap[address]) {
      balanceMap[address] = BigInt(0)
    }
    balanceMap[address] = BigInt(balanceMap[address]) + share
  })

  return {
    topAccounts: calculateTopAccounts(linkBalanceMap),
    eligableAccounts: calculateRaffleEligable(linkBalanceMap),
  }
}

const calculateTopAccounts = (balanceMap: any) => {
  const sortedAddresses = Object.keys(balanceMap).sort((a, b) => {
    const balanceA = BigInt(balanceMap[a])
    const balanceB = BigInt(balanceMap[b])
    if (balanceA > balanceB) return -1
    if (balanceA < balanceB) return 1
    return 0
  })

  return sortedAddresses.slice(0, 5)
}

const calculateRaffleEligable = (balanceMap: any) => {
  const sortedAddresses = Object.keys(balanceMap).filter((address) => {
    if (BigInt(balanceMap[address]) > BigInt(10 * 1e18)) {
      return address
    }
  })

  return sortedAddresses
}

// collects all the balances from the balance maps and adds them to the balance map
const getTotals = (balanceMap: any) => {
  getRESDLBalanceMap(balanceMap)
  const { topAccounts } = getLINKBalanceMap(balanceMap)

  return topAccounts
}

async function main() {
  const balanceMap: any = {}

  const topAccounts = getTotals(balanceMap)

  Object.keys(balanceMap).forEach((address) => {
    let amount = balanceMap[address]
    if (topAccounts.includes(address)) {
      amount += BigInt(topRewards[topAccounts.indexOf(address)] * 1e18)
    }
    if (raffleWinners.includes(ethers.utils.getAddress(address))) {
      amount += BigInt(2500 * 1e18)
    }
    if (amount === BigInt(0)) {
      delete balanceMap[address]
    } else {
      balanceMap[address] = amount.toString()
    }
  })

  fs.writeFileSync(
    `scripts/balanceMapGeneration/SDL/outputBalanceMapsJan24/balanceMap.${network.name}.json`,
    JSON.stringify(balanceMap, null, 1)
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
