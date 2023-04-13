import { program } from 'commander'
import fs from 'fs'
import { ethers, network } from 'hardhat'
import { parseBalanceMap } from '../../src/parse-balance-map'
import { getContract, isTokenSupported } from '../utils/helpers'

async function main() {
  program.version('0.0.0').requiredOption('--token <name>', 'input name of token to distribute')

  program.parse(process.argv)
  const opts = program.opts()

  if (!isTokenSupported(opts.token))
    throw new Error('Token is not supported on the selected network')

  const balances = JSON.parse(
    fs.readFileSync(`scripts/merkleGeneration/${opts.token}/inputMap.${network.name}.json`, {
      encoding: 'utf8',
    })
  )

  if (typeof balances !== 'object') throw new Error('Invalid JSON')

  const networkId = (await ethers.provider.getNetwork()).chainId
  const token = await getContract(opts.token)

  fs.writeFileSync(
    `scripts/merkleGeneration/${opts.token}/outputTree.${network.name}.json`,
    JSON.stringify({ token: token.address, networkId, ...parseBalanceMap(balances) }, null, 1)
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
