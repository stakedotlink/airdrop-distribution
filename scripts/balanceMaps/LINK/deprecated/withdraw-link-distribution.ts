import fs from 'fs'
import { ethers } from 'hardhat'

const tokenAddress = '0x514910771af9ca656af840dff83e8264ecf986ca' // address of LINK token
const oldDistributorAddress = '0xe7Dd77d408920c000C40C35c4c111318Ba8B4767' // address of old merkle distributor
const multicallAddress = '0xcA11bde05977b3631167028862bE2a173976CA11' // address of multicall contract
const inputBalanceMapPath = 'scripts/balanceMaps/LINK/2023-04-27.json' // path to input balance map
const outputBalanceMapPath = 'scripts/balanceMaps/LINK/distributor-deprecation.json' // path to output balance map

function getBalanceMap() {
  return JSON.parse(
    fs.readFileSync(inputBalanceMapPath, {
      encoding: 'utf8',
    })
  )
}

function writeBalanceMap(balanceMap: any) {
  fs.writeFileSync(outputBalanceMapPath, JSON.stringify(balanceMap, null, 1))
}

async function main() {
  const distributor = (await ethers.getContractAt(
    'MerkleDistributor',
    oldDistributorAddress
  )) as any
  const token = await ethers.getContractAt('ERC20', tokenAddress)
  const multicall = await ethers.getContractAt('Multicall3', multicallAddress)

  console.log('Pausing merkle distributor...')
  await (await distributor.pauseForWithdrawal(tokenAddress)).wait()

  console.log('Generating new balance map...')

  const oldDistributorInterface = new ethers.Interface([
    'function getClaimed(address token, address account) view',
  ])
  const oldBalanceMap = getBalanceMap()
  const accounts = Object.keys(oldBalanceMap)
  let claimed: bigint[] = []

  for (let i = 0; i < 2000; i += 500) {
    const batch = await multicall.aggregate3
      .staticCall(
        accounts.slice(i, i + 500).map((account) => ({
          target: oldDistributorAddress,
          allowFailure: false,
          callData: oldDistributorInterface.encodeFunctionData('getClaimed', [
            tokenAddress,
            account,
          ]),
        }))
      )
      .then((d) => d.map((d) => BigInt(d[1])))
    claimed = claimed.concat(batch)
  }

  const balanceMap: any = {}
  accounts.forEach((account, i) => {
    balanceMap[account] = (BigInt(oldBalanceMap[account]) - claimed[i]).toString()
  })

  //adjust for extra LINK sent to distributor
  const balance = BigInt(await token.balanceOf(oldDistributorAddress)) - 999999999997289040n
  const totalUnclaimed: any = Object.values(balanceMap).reduce(
    (prev: any, cur: any) => prev + BigInt(cur),
    0n
  )

  if (Object.keys(balanceMap).length != accounts.length) throw Error('Invalid balance map')
  if (totalUnclaimed != balance) throw Error('Invalid balance map')

  writeBalanceMap(balanceMap)

  console.log('Withdrawing unclaimed tokens...')
  await (await distributor.withdrawUnclaimedTokens(tokenAddress, ethers.ZeroHash, 0)).wait()

  console.log('Success! Total unclaimed: ', totalUnclaimed)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
