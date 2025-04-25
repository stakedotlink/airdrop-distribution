import base58 from 'bs58'
import fs from 'fs'
import axios from 'axios'
import { ethers } from 'hardhat'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import { getContract } from './utils/helpers'
import { ERC20, MerkleDistributor } from '../typechain-types'

const tokenAddress = '' // address of token to distribute
const balanceMapPath = '' // path to balance map that contains amounts to distribute for each address
const newDistributionAmount = 0n // total amount to distribute

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
  const accounts = Object.keys(balanceMap)

  accounts.forEach((account, index) => {
    newTreeData[account] = {
      index: index.toString(),
      amount: (BigInt(balanceMap[account]) + BigInt(oldTreeData[account]?.amount || 0)).toString(),
    }
  })

  let tree = StandardMerkleTree.of(
    accounts.map((account: any) => [account, newTreeData[account].amount]),
    ['address', 'uint256']
  )

  return { newTreeData, newMerkleRoot: tree.root }
}

async function main() {
  console.log('Generating new tree...')

  const PINATA_GATEWAY_URL = process.env.PINATA_GATEWAY_URL
  const PINATA_API_URL = process.env.PINATA_API_URL
  const PINATA_JWT = process.env.PINATA_JWT

  if (PINATA_GATEWAY_URL == undefined) throw Error('PINATA_GATEWAY_URL must be set')
  if (PINATA_API_URL == undefined) throw Error('PINATA_API_URL must be set')
  if (PINATA_JWT == undefined) throw Error('PINATA_JWT must be set')

  const tokenContract = (await ethers.getContractAt('ERC20', tokenAddress)) as ERC20
  const distributor = (await getContract('MerkleDistributor')) as MerkleDistributor
  const [token, isPaused, merkleRoot, ipfsHash] = await distributor.distributions(tokenAddress)

  if (isPaused) throw Error('Distribution is paused')

  let oldTreeData: any = {}
  let oldDistributionAmount = 0n

  if (token != ethers.ZeroAddress) {
    let res: any = await axios.get(
      `${PINATA_GATEWAY_URL}/ipfs/${base58.encode(Buffer.from('1220' + ipfsHash.slice(2), 'hex'))}`
    )
    const data = JSON.parse(res.data)
    if (data.merkleRoot != merkleRoot) {
      throw Error('Merkle roots do not match')
    }
    oldTreeData = data.data
    oldDistributionAmount = BigInt(data.totalAmount)
  }

  const totalDistributionAmount = oldDistributionAmount + newDistributionAmount
  const balanceMap = getBalanceMap()
  const accounts = Object.keys(balanceMap)
  const { newTreeData, newMerkleRoot } = generateNewTree(oldTreeData, balanceMap)

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

  const res: any = await axios.post(
    `${PINATA_API_URL}/pinning/pinJSONToIPFS`,
    {
      pinataOptions: {
        cidVersion: 0,
      },
      pinataContent: JSON.stringify({
        merkleRoot: newMerkleRoot,
        totalAmount: totalDistributionAmount.toString(),
        data: newTreeData,
      }),
    },
    {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + PINATA_JWT,
      },
    }
  )

  const newIpfsCID = res.data.IpfsHash
  const newIpfsHash = '0x' + Buffer.from(base58.decode(newIpfsCID)).toString('hex').slice(4)

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
