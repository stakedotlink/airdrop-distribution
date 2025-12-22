import fs from 'fs'
import { PinataSDK } from 'pinata'
import { ethers } from 'hardhat'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import { getContract, getAccounts } from './utils/helpers'
import { ERC20, MerkleDistributor } from '../typechain-types'

// address of token to distribute
const tokenAddress = '' // 0x514910771AF9Ca656af840dff83E8264EcF986CA

// symbol of token to distribute (IPFS file will use this symbol)
const tokenSymbol = '' // LINK

// path to balance maps that contain additional amounts to distribute for each address
const balanceMapPaths: string[] = [] // ['./scripts/balanceMaps/LINK/2025-05-08/map.json']

// optional list of fields corresponding to each balance map (IPFS file will include the distribution amount
// from each balance map using these fields if they are included)
const balanceMapFields: string[] = [] // ['stLINKAmount', 'reSDLAmount']

// total additional amount to distribute
const newDistributionAmount = 0n // 1000000000000000000000n

const expireDate = 0 // unix timestamp of airdrop expiry

function getBalanceMaps() {
  const maps = balanceMapPaths.map((path) =>
    JSON.parse(
      fs.readFileSync(path, {
        encoding: 'utf8',
      })
    )
  )

  return maps
}

function generateNewTree(oldTreeData: any, balanceMaps: any) {
  const newTreeData: any = {}

  Object.keys(oldTreeData).forEach((account) => {
    account = account.toLowerCase()

    if (BigInt(oldTreeData[account].amount) == 0n) throw Error('Zero value in old tree data')

    newTreeData[account] = {
      amount: BigInt(oldTreeData[account].amount).toString(),
    }
  })

  balanceMaps.forEach((map: any, index: any) => {
    const mapField = balanceMapFields[index]

    Object.keys(map).forEach((account) => {
      account = account.toLowerCase()

      if (BigInt(map[account]) == 0n) throw Error('Zero value in balance map')

      if (newTreeData[account] == undefined) newTreeData[account] = { amount: 0 }

      newTreeData[account].amount = (
        BigInt(map[account]) + BigInt(newTreeData[account].amount)
      ).toString()
      newTreeData[account][mapField] = map[account].toString()
    })
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

  const { signers } = await getAccounts()

  const tokenContract = (await ethers.getContractAt('ERC20', tokenAddress)).connect(
    signers[6]
  ) as ERC20
  const distributor = (await getContract('MerkleDistributor')).connect(
    signers[6]
  ) as MerkleDistributor
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

  const balanceMaps = getBalanceMaps()
  const { newTreeData, newMerkleRoot } = generateNewTree(oldTreeData, balanceMaps)
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
      expireDate,
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
