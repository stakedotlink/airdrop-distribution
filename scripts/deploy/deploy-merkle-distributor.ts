import { updateDeployments, deploy } from '../utils/helpers'
import { MerkleDistributor } from '../../typechain-types'

async function main() {
  const merkleDistributor = (await deploy('MerkleDistributor')) as MerkleDistributor
  console.log('MerkleDistributor deployed: ', await merkleDistributor.getAddress())

  updateDeployments({
    MerkleDistributor: await merkleDistributor.getAddress(),
  })
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
