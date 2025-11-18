import { PinataSDK } from 'pinata'
import { ethers } from 'hardhat'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import { getContract, getAccounts } from './utils/helpers'
import { MerkleDistributor, Multicall3 } from '../typechain-types'
import { fromEther } from '../test/utils/helpers'

// address of token to withdraw unclaimed tokens for
const tokenAddress = '' // 0x514910771AF9Ca656af840dff83E8264EcF986CA

// symbol of token (for IPFS filename)
const tokenSymbol = '' // LINK

/**
 * This script withdraws unclaimed tokens from an expired airdrop distribution
 *
 * Process:
 * 1. Pauses the distribution to prevent new claims
 * 2. Fetches the current merkle tree from IPFS
 * 3. Queries on-chain claimed amounts for all accounts
 * 4. Generates a new merkle tree with only claimed amounts
 * 5. Uploads the new tree to IPFS
 * 6. Calls withdrawUnclaimedTokens which:
 *    - Withdraws all remaining tokens to owner
 *    - Updates merkle root to new tree
 *    - Unpauses the distribution
 */

function generateClaimedAmountsTree(claimedAmounts: any): {
  newTreeData: any
  newMerkleRoot: string
  totalClaimedAmount: bigint
} {
  const newTreeData: any = {}
  let totalClaimedAmount = 0n

  // For each account, set their amount to what they've claimed
  Object.keys(claimedAmounts).forEach((account) => {
    account = account.toLowerCase()
    const claimed = claimedAmounts[account] || 0n

    // Only include accounts that have claimed something
    if (claimed > 0n) {
      newTreeData[account] = {
        amount: claimed.toString(),
      }
      totalClaimedAmount += claimed
    }
  })

  const accounts = Object.keys(newTreeData)

  if (accounts.length == 0) {
    return {
      newTreeData: {},
      newMerkleRoot: ethers.ZeroHash,
      totalClaimedAmount: 0n,
    }
  }

  accounts.forEach((account, index) => {
    newTreeData[account].index = index.toString()
  })

  let tree = StandardMerkleTree.of(
    accounts.map((account: any) => [account, newTreeData[account].amount]),
    ['address', 'uint256']
  )

  return {
    newTreeData,
    newMerkleRoot: tree.root,
    totalClaimedAmount,
  }
}

async function main() {
  console.log('Starting withdrawal of unclaimed tokens...')

  const PINATA_JWT = process.env.PINATA_JWT
  const PINATA_GATEWAY_URL = process.env.PINATA_GATEWAY_URL

  if (PINATA_JWT == undefined) throw Error('PINATA_JWT must be set')
  if (PINATA_GATEWAY_URL == undefined) throw Error('PINATA_GATEWAY_URL must be set')

  const pinata = new PinataSDK({
    pinataJwt: PINATA_JWT,
    pinataGateway: PINATA_GATEWAY_URL,
  })

  const multicall = (await getContract('Multicall3')) as Multicall3
  const distributor = (await getContract('MerkleDistributor')) as MerkleDistributor

  const [token, isPaused, merkleRoot, ipfsHash] = await distributor.distributions(tokenAddress)

  if (token == ethers.ZeroAddress) {
    throw Error('Distribution does not exist')
  }

  // Step 1: Pause the distribution if not already paused
  if (!isPaused) {
    console.log('Pausing distribution...')
    await (await distributor.pauseForWithdrawal(tokenAddress)).wait()
    console.log('Distribution paused')
  } else {
    console.log('Distribution already paused')
  }

  // Step 2: Fetch current tree from IPFS
  console.log('Fetching current merkle tree from IPFS...')
  const res = await pinata.gateways.public.get(ipfsHash)
  const data = Object(res.data)

  if (data.merkleRoot != merkleRoot) {
    throw Error('Merkle roots do not match')
  }

  const oldTreeData = data.data
  const oldTotalAmount = BigInt(data.totalAmount)
  const accounts = Object.keys(oldTreeData)

  console.log(`Found ${accounts.length} accounts in old tree`)
  console.log(`Total distribution amount: ${fromEther(oldTotalAmount)} ${tokenSymbol}`)

  // Step 3: Query claimed amounts for all accounts
  console.log('Querying claimed amounts for all accounts...')
  const claimedAmounts: any = {}
  let totalClaimed = 0n

  const batchSize = 100
  for (let i = 0; i < accounts.length; i += batchSize) {
    const batch = accounts.slice(i, Math.min(i + batchSize, accounts.length))

    const results = await multicall.aggregate3.staticCall(
      batch.map((account) => {
        return {
          target: distributor.target,
          allowFailure: false,
          callData: distributor.interface.encodeFunctionData('getClaimed', [tokenAddress, account]),
        }
      })
    )

    results.forEach((result, index) => {
      const account = batch[index].toLowerCase()
      const claimedAmount = distributor.interface.decodeFunctionResult(
        'getClaimed',
        result.returnData
      )[0]
      claimedAmounts[account] = claimedAmount
      totalClaimed += claimedAmount
    })
  }

  console.log(`Total claimed: ${fromEther(totalClaimed)} ${tokenSymbol}`)
  console.log(`Total unclaimed: ${fromEther(oldTotalAmount - totalClaimed)} ${tokenSymbol}`)

  // Step 4: Generate new tree with only claimed amounts
  console.log('Generating new merkle tree with claimed amounts...')
  const { newTreeData, newMerkleRoot, totalClaimedAmount } =
    generateClaimedAmountsTree(claimedAmounts)

  if (totalClaimedAmount != totalClaimed) {
    throw Error('Total claimed amount mismatch')
  }

  console.log(`New tree has ${Object.keys(newTreeData).length} accounts`)

  // Step 5: Upload new tree to IPFS
  console.log('Pinning new tree to IPFS...')
  const upload = await pinata.upload.public
    .json({
      tokenSymbol,
      tokenAddress,
      merkleRoot: newMerkleRoot,
      totalAmount: totalClaimedAmount.toString(),
      data: newTreeData,
    })
    .name(`eth-merkle-distributor-${tokenSymbol}.json`)

  const newIpfsHash = upload.cid
  console.log(`New IPFS hash: ${newIpfsHash}`)

  // Step 6: Withdraw unclaimed tokens
  console.log('Withdrawing unclaimed tokens...')
  const tx = await distributor.withdrawUnclaimedTokens(
    tokenAddress,
    newMerkleRoot,
    newIpfsHash,
    totalClaimedAmount
  )
  await tx.wait()

  console.log('✅ Withdrawal complete!')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
