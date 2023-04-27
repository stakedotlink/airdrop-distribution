import fs from 'fs'
import { network } from 'hardhat'

const totalAirdropAmount = 1984 * 1e18
// LinkPool wallets
const excludeAddresses = [
  '0xab31ae46f4d4dd01a475d41832de9b863b712e13',
  '0x6879826450e576b401c4ddeff2b7755b1e85d97c',
].map((address) => address.toLowerCase())

const getLPLABalanceMap = () => {
  let json = JSON.parse(
    fs.readFileSync(`scripts/balanceMapGeneration/LINK/balanceData/dec-lpla-balances.json`, {
      encoding: 'utf8',
    })
  )

  if (typeof json !== 'object') throw new Error('Invalid JSON')

  let balanceMap: any = {}
  Object.keys(json).forEach((address) => {
    const formattedAddress = address.toLowerCase()

    if (excludeAddresses.includes(formattedAddress)) return

    if (!balanceMap[formattedAddress]) {
      balanceMap[formattedAddress] = 0
    }
    balanceMap[formattedAddress] += Number(json[address])
  })

  return balanceMap
}

async function main() {
  const lplaBalanceMap = getLPLABalanceMap()
  const totalLPLA = Object.values(lplaBalanceMap).reduce(
    (total: number, amount: any) => total + amount,
    0
  )

  const balanceMap: any = {}
  Object.keys(lplaBalanceMap).forEach((address) => {
    balanceMap[address] = Math.trunc((lplaBalanceMap[address] / totalLPLA) * totalAirdropAmount)
  })

  fs.writeFileSync(
    `scripts/merkleGeneration/LINK/inputMap.${network.name}.json`,
    JSON.stringify(balanceMap, null, 1)
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
