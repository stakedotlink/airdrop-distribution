import { program } from 'commander'
import { BigNumber } from 'ethers'
import fs from 'fs'
import { network } from 'hardhat'
import { linkpool } from '../../api/linkpool'
import { getContract, isTokenSupported } from '../utils/helpers'

async function main() {
  program
    .version('0.0.0')
    .requiredOption('--token <name>', 'input name of token that has new distributions')

  program.parse(process.argv)
  const opts = program.opts()

  if (!isTokenSupported(opts.token))
    throw new Error('Token is not supported on the selected network')

  const tree = JSON.parse(
    fs.readFileSync(`scripts/merkleGeneration/${opts.token}/outputTree.${network.name}.json`, {
      encoding: 'utf8',
    })
  )

  if (typeof tree !== 'object') throw new Error('Invalid JSON')

  const token = await getContract(opts.token)
  const merkleDistributor = await getContract('MerkleDistributor')
  const distribution = await merkleDistributor.distributions(token.address)

  let func
  let amount

  if (distribution[3].gt(0)) {
    func = 'updateDistribution'
    amount = BigNumber.from(tree.tokenTotal).sub(distribution[5])
  } else {
    func = 'addDistribution'
    amount = BigNumber.from(tree.tokenTotal)
  }

  let tx = await token.approve(merkleDistributor.address, amount)
  await tx.wait()
  tx = await merkleDistributor[func](token.address, tree.merkleRoot, amount)
  await tx.wait()

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
