import { Contract } from 'ethers'
import { ethers, network } from 'hardhat'
import fse from 'fs-extra'

export const getContract = async (contractName: string): Promise<Contract> => {
  const deployments = getDeployments()
  const abis = getAbis()
  const contract = deployments[contractName]

  if (!contract) {
    throw Error('Contract cannot be found on the selected network')
  }

  return ethers.getContractAt(abis[contract.abi], contract.address)
}

export const isTokenSupported = (tokenName: string): boolean => {
  const deployments = getDeployments()
  return deployments[tokenName] != undefined
}

const getDeployments = () => {
  const deployments = fse.readJSONSync(`contracts/deployments/${network.name}.json`, {
    throws: false,
  })

  if (!deployments) {
    return {}
  }

  return deployments
}

const getAbis = () => {
  return fse.readJSONSync(`contracts/abis.json`)
}
