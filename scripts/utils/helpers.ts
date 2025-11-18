import fse from 'fs-extra'
import { ethers, network } from 'hardhat'

export const getAccounts = async () => {
  const signers = await ethers.getSigners()
  const accounts = await Promise.all(signers.map(async (signer) => signer.getAddress()))
  return { signers, accounts }
}

export const deploy = async (
  contractName: string,
  args: any[] = [],
  useLedgerSigner = false
): Promise<any> => {
  const signers = await ethers.getSigners()
  return (
    await ethers.deployContract(contractName, args, useLedgerSigner ? signers[6] : undefined)
  ).waitForDeployment()
}

export const getDeployments = () => {
  fse.ensureFileSync(`deployments/${network.name}.json`)
  const deployments = fse.readJSONSync(`deployments/${network.name}.json`, { throws: false })

  if (!deployments) {
    return {}
  }

  return deployments
}

export const updateDeployments = (
  newDeployments: { [key: string]: string },
  artifactMap: { [key: string]: string } = {}
) => {
  const deployments = getDeployments()

  let contractNames = Object.keys(newDeployments)
  let newDeploymentsWithArtifacts = contractNames.reduce(
    (acc, name: string) => (
      (acc[name] = { address: newDeployments[name], artifact: artifactMap[name] || name }), acc
    ),
    {} as any
  )

  fse.outputJSONSync(
    `deployments/${network.name}.json`,
    { ...deployments, ...newDeploymentsWithArtifacts },
    { spaces: 2 }
  )
}

export const getContract = async (contractName: string) => {
  const deployments = getDeployments()
  const contract = deployments[contractName]

  if (!contract) {
    throw Error('Deployed contract does not exist')
  }

  const { signers } = await getAccounts()
  return (await ethers.getContractAt(contract.artifact, contract.address)).connect(
    signers[0]
  ) as any
}
