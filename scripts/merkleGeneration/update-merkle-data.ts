import { program } from 'commander'
import { BigNumber } from 'ethers'
import fs from 'fs'
import { network } from 'hardhat'
import { linkpool } from '../../api/linkpool'
import { getContract, isTokenSupported } from '../utils/helpers'

async function main() {
  program
    .version('0.0.0')
    .requiredOption('--token <symbol>', 'symbol of token that has a new distribution')
    .option(
      '--transferTokens <true/false>',
      'true if script should transfer tokens to MerkleDistributor for the new distribution'
    )
    .option(
      '--updateContract <true/false>',
      'true if script should update MerkleDistributor with the new distribution'
    )
    .option('--expiryTimestamp <seconds>', 'timestamp when unclaimed tokens can be withdrawn')

  program.parse(process.argv)
  const opts = program.opts()

  if (!isTokenSupported(opts.token))
    throw new Error('Token is not supported on the selected network')

  const tree = JSON.parse(
    fs.readFileSync(
      `scripts/merkleGeneration/outputTrees/${opts.token}/tree.${network.name}.json`,
      {
        encoding: 'utf8',
      }
    )
  )

  if (typeof tree !== 'object') throw new Error('Invalid JSON')

  const token = await getContract(opts.token)
  const merkleDistributor = await getContract('MerkleDistributor')
  const distribution = await merkleDistributor.distributions(token.address)

  let func
  let amount

  if (distribution[4].gt(0)) {
    func = 'updateDistribution'
    amount = BigNumber.from(tree.tokenTotal).sub(distribution[4])
  } else {
    func = 'addDistribution'
    amount = BigNumber.from(tree.tokenTotal)
  }

  // transfers airdrop tokens to MerkleDistributor
  if (opts.transferTokens == 'true') {
    let tx = await token.transfer(merkleDistributor.address, amount)
    await tx.wait()
  }

  if ((await token.balanceOf(merkleDistributor.address)).lt(amount)) {
    throw new Error('Not enough tokens in MerkleDistributor to support this distribution')
  }

  // Updates MerkleDistributor with new merkle tree details
  if (opts.updateContract == 'true') {
    if (!opts.expiryTimestamp) {
      throw new Error('Expiry timestamp must be set to update MerkleDistributor')
    }

    let tx = await merkleDistributor[func](
      token.address,
      tree.merkleRoot,
      amount,
      opts.expiryTimestamp
    )
    await tx.wait()
  }

  if ((await merkleDistributor.distributions(token.address))[3] != tree.merkleRoot) {
    throw new Error('On-chain distribution must be updated before updating the merkle DB')
  }

  // Updates merkle DB with new merkle tree details
  await linkpool.post('merkle', {
    ...tree,
    claims: Object.keys(tree.claims).map((address) => ({ address, ...tree.claims[address] })),
  })
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
