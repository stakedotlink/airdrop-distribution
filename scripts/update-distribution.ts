import fs from 'fs'
import { PinataSDK } from 'pinata'
import { ethers } from 'hardhat'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import { getContract } from './utils/helpers'
import { ERC20, MerkleDistributor } from '../typechain-types'

// address of token to distribute
const tokenAddress = ''
// symbol of token to distribute (IPFS file will use this symbol)
const tokenSymbol = ''
// path to balance map that contains additional amounts to distribute for each address
const balanceMapPath = './scripts/balanceMaps/'
// total additional amount to distribute
const newDistributionAmount = 0n

function getBalanceMap() {
  const map = JSON.parse(
    fs.readFileSync(balanceMapPath, {
      encoding: 'utf8',
    })
  )

  return map
}

function generateNewTree(oldTreeData: any, balanceMap: any) {
  const newTreeData: any = {}

  Object.keys(oldTreeData).forEach((account) => {
    if (BigInt(oldTreeData[account].amount) == 0n) throw Error('Zero value in old tree data')

    newTreeData[account] = {
      amount: BigInt(oldTreeData[account].amount).toString(),
    }
  })

  Object.keys(balanceMap).forEach((account) => {
    if (BigInt(balanceMap[account]) == 0n) throw Error('Zero value in balance map')

    newTreeData[account] = {
      amount: (BigInt(balanceMap[account]) + BigInt(newTreeData[account]?.amount || 0)).toString(),
    }
  })

  const accounts = Object.keys(newTreeData)

  accounts.forEach((account, index) => {
    newTreeData[account].index = index.toString()
  })

  let tree = StandardMerkleTree.of(
    accounts.map((account: any) => [account, newTreeData[account].amount]),
    ['address', 'uint256']
  )

  return { newTreeData, newMerkleRoot: tree.root }
}

async function main() {
  console.log('Generating new tree...')

  const PINATA_JWT = process.env.PINATA_JWT
  const PINATA_GATEWAY_URL = process.env.PINATA_GATEWAY_URL

  if (PINATA_JWT == undefined) throw Error('PINATA_JWT must be set')
  if (PINATA_GATEWAY_URL == undefined) throw Error('PINATA_GATEWAY_URL must be set')

  const pinata = new PinataSDK({
    pinataJwt: PINATA_JWT,
    pinataGateway: PINATA_GATEWAY_URL,
  })

  const tokenContract = (await ethers.getContractAt('ERC20', tokenAddress)) as ERC20
  const distributor = (await getContract('MerkleDistributor')) as MerkleDistributor
  const [token, isPaused, merkleRoot, ipfsHash] = await distributor.distributions(tokenAddress)

  if (isPaused) throw Error('Distribution is paused')

  let oldTreeData: any = {}
  let oldDistributionAmount = 0n

  if (token != ethers.ZeroAddress) {
    const res = await pinata.gateways.public.get(ipfsHash)
    const data = Object(res.data)
    if (data.merkleRoot != merkleRoot) {
      throw Error('Merkle roots do not match')
    }
    oldTreeData = data.data
    oldDistributionAmount = BigInt(data.totalAmount)
  }

  const balanceMap = getBalanceMap()
  const { newTreeData, newMerkleRoot } = generateNewTree(oldTreeData, balanceMap)
  const accounts = Object.keys(newTreeData)

  const totalDistributionAmount = oldDistributionAmount + newDistributionAmount
  const totalDistributed = accounts.reduce(
    (total, account) => total + BigInt(newTreeData[account].amount),
    0n
  )

  if (totalDistributed != totalDistributionAmount) {
    throw Error('Incorrect distribution amount')
  }

  if (Object.keys(newTreeData).length != accounts.length) {
    throw Error('Invalid merkle tree')
  }

  for (let i = 0; i < accounts.length; i++) {
    let account = accounts[i]

    let amount = BigInt(newTreeData[account].amount)
    let oldAmount = BigInt(oldTreeData[account]?.amount || 0)

    if (amount < oldAmount) {
      throw Error('Invalid merkle tree')
    }
  }

  console.log('Pinning tree to IPFS...')

  const upload = await pinata.upload.public
    .json({
      tokenSymbol,
      tokenAddress,
      merkleRoot: newMerkleRoot,
      totalAmount: totalDistributionAmount.toString(),
      data: newTreeData,
    })
    .name(`eth-merkle-distributor-${tokenSymbol}.json`)

  const newIpfsHash = upload.cid

  console.log('Transferring tokens...')

  await (await tokenContract.transfer(await distributor.getAddress(), newDistributionAmount)).wait()

  console.log('Updating merkle distributor...')

  if (token == ethers.ZeroAddress) {
    await (
      await distributor.addDistribution(
        tokenAddress,
        newMerkleRoot,
        newIpfsHash,
        totalDistributionAmount
      )
    ).wait()
  } else {
    await (
      await distributor.updateDistribution(
        tokenAddress,
        newMerkleRoot,
        newIpfsHash,
        totalDistributionAmount
      )
    ).wait()
  }

  console.log('Success!')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
