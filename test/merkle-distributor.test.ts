import { ethers } from 'hardhat'
import { expect } from 'chai'
import { getAccounts } from './utils/helpers'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'

// Copied and modified from: https://github.com/Uniswap/merkle-distributor/blob/master/test/MerkleDistributor.spec.ts
// Most tests have been removed as core functionality has not changed, focus on testing multiple distributions

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000'

describe('MerkleDistributor', () => {
  let accounts: string[]
  let signers: SignerWithAddress[]

  async function fixture() {
    const token = await ethers.deployContract('Token', ['Token', 'TKN', 1000000])
    const distributor = await ethers.deployContract('MerkleDistributor')

    return { distributor, token }
  }

  before(async () => {
    ;({ accounts, signers } = await getAccounts())
  })

  describe('#claim', () => {
    it('fails for empty proof', async () => {
      const { distributor, token } = await loadFixture(fixture)
      await distributor.addDistribution(await token.getAddress(), ZERO_BYTES32, ZERO_BYTES32, 0)
      await expect(
        distributor.connect(signers[1]).claimDistribution(await token.getAddress(), 10, [])
      ).to.be.revertedWithCustomError(distributor, 'InvalidProof()')
    })

    describe('two account tree', () => {
      async function fixture2() {
        const { distributor, token } = await loadFixture(fixture)

        const tree = StandardMerkleTree.of(
          [
            [accounts[1], 100n],
            [accounts[2], 101n],
          ],
          ['address', 'uint256']
        )
        await token.transfer(await distributor.getAddress(), 201n)
        await distributor.addDistribution(await token.getAddress(), tree.root, ZERO_BYTES32, 201n)

        return { distributor, token, tree }
      }

      it('successful claim', async () => {
        const { distributor, token, tree } = await loadFixture(fixture2)

        const proof0 = tree.getProof(0)
        await expect(
          distributor.connect(signers[1]).claimDistribution(await token.getAddress(), 100, proof0)
        )
          .to.emit(distributor, 'Claimed')
          .withArgs(accounts[1], await token.getAddress(), 100)
        const proof1 = tree.getProof(1)
        await expect(
          distributor.connect(signers[2]).claimDistribution(await token.getAddress(), 101, proof1)
        )
          .to.emit(distributor, 'Claimed')
          .withArgs(accounts[2], await token.getAddress(), 101)
      })

      it('transfers the token', async () => {
        const { distributor, token, tree } = await loadFixture(fixture2)

        const proof0 = tree.getProof(0)
        expect(await token.balanceOf(accounts[1])).to.eq(0)
        await distributor
          .connect(signers[1])
          .claimDistribution(await token.getAddress(), 100, proof0)
        expect(await token.balanceOf(accounts[1])).to.eq(100)
      })

      it('increments claimed amount', async () => {
        const { distributor, token, tree } = await loadFixture(fixture2)

        const proof0 = tree.getProof(0)
        expect(await distributor.getClaimed(await token.getAddress(), accounts[1])).to.eq(0)
        expect(await distributor.getClaimed(await token.getAddress(), accounts[2])).to.eq(0)
        await distributor
          .connect(signers[1])
          .claimDistribution(await token.getAddress(), 100, proof0)
        expect(await distributor.getClaimed(await token.getAddress(), accounts[1])).to.eq(100)
        expect(await distributor.getClaimed(await token.getAddress(), accounts[2])).to.eq(0)
      })

      it('cannot allow two claims', async () => {
        const { distributor, token, tree } = await loadFixture(fixture2)

        const proof0 = tree.getProof(0)
        await distributor
          .connect(signers[1])
          .claimDistribution(await token.getAddress(), 100, proof0)
        await expect(
          distributor.connect(signers[1]).claimDistribution(await token.getAddress(), 100, proof0)
        ).to.be.revertedWithCustomError(distributor, 'NothingToClaim()')
      })

      it('cannot claim more than once: 0 and then 1', async () => {
        const { distributor, token, tree } = await loadFixture(fixture2)

        await distributor
          .connect(signers[1])
          .claimDistribution(await token.getAddress(), 100, tree.getProof(0))
        await distributor
          .connect(signers[2])
          .claimDistribution(await token.getAddress(), 101, tree.getProof(1))

        await expect(
          distributor
            .connect(signers[1])
            .claimDistribution(await token.getAddress(), 100, tree.getProof(0))
        ).to.be.revertedWithCustomError(distributor, 'NothingToClaim()')
      })

      it('cannot claim more than once: 1 and then 0', async () => {
        const { distributor, token, tree } = await loadFixture(fixture2)

        await distributor
          .connect(signers[2])
          .claimDistribution(await token.getAddress(), 101, tree.getProof(1))
        await distributor
          .connect(signers[1])
          .claimDistribution(await token.getAddress(), 100, tree.getProof(0))

        await expect(
          distributor
            .connect(signers[2])
            .claimDistribution(await token.getAddress(), 101, tree.getProof(1))
        ).to.be.revertedWithCustomError(distributor, 'NothingToClaim()')
      })

      it('cannot claim for address other than proof', async () => {
        const { distributor, token, tree } = await loadFixture(fixture2)

        const proof0 = tree.getProof(0)
        await expect(
          distributor.connect(signers[2]).claimDistribution(await token.getAddress(), 101, proof0)
        ).to.be.revertedWithCustomError(distributor, 'InvalidProof()')
      })

      it('cannot claim more than proof', async () => {
        const { distributor, token, tree } = await loadFixture(fixture2)

        const proof0 = tree.getProof(0)
        await expect(
          distributor.connect(signers[1]).claimDistribution(await token.getAddress(), 101, proof0)
        ).to.be.revertedWithCustomError(distributor, 'InvalidProof()')
      })

      it('cannot claim distribution that does not exist', async () => {
        const { distributor, tree } = await loadFixture(fixture2)

        const proof0 = tree.getProof(0)
        await expect(
          distributor.connect(signers[1]).claimDistribution(accounts[2], 101, proof0)
        ).to.be.revertedWithCustomError(distributor, 'DistributionNotFound()')
      })

      it('can pause for withdrawal', async () => {
        const { distributor, token } = await loadFixture(fixture2)

        await distributor.pauseForWithdrawal(await token.getAddress())
        expect((await distributor.distributions(await token.getAddress()))[1]).to.eq(true)
      })

      it('can withdraw unclaimed tokens', async () => {
        const { distributor, token, tree } = await loadFixture(fixture2)

        await expect(
          distributor.withdrawUnclaimedTokens(await token.getAddress(), tree.root, ZERO_BYTES32, 0)
        ).to.be.revertedWithCustomError(distributor, 'DistributionNotPaused()')
        await distributor
          .connect(signers[2])
          .claimDistribution(await token.getAddress(), 101, tree.getProof(1))
        await distributor.pauseForWithdrawal(await token.getAddress())
        await distributor.withdrawUnclaimedTokens(
          await token.getAddress(),
          tree.root,
          ZERO_BYTES32,
          101
        )
        let distribution = await distributor.distributions(await token.getAddress())
        expect(distribution[1]).to.eq(false)
        expect(distribution[2]).to.eq(tree.root)
        expect(distribution[3]).to.eq(ZERO_BYTES32)
        expect(await token.balanceOf(await distributor.getAddress())).to.eq(0n)
      })
    })

    describe('multiple distributions', () => {
      async function fixture3() {
        const { distributor, token } = await loadFixture(fixture)

        const token2 = await ethers.deployContract('Token', ['Token', 'TKN', 1000000])
        const token3 = await ethers.deployContract('Token', ['Token', 'TKN', 1000000])

        const tree = StandardMerkleTree.of(
          [
            [accounts[1], 100n],
            [accounts[2], 101n],
          ],
          ['address', 'uint256']
        )

        await token.approve(await distributor.getAddress(), ethers.MaxUint256)
        await token2.approve(await distributor.getAddress(), ethers.MaxUint256)
        await token3.approve(await distributor.getAddress(), ethers.MaxUint256)

        await token.transfer(await distributor.getAddress(), 201n)
        await token2.transfer(await distributor.getAddress(), 201n)
        await token3.transfer(await distributor.getAddress(), 201n)
        await distributor.addDistribution(await token.getAddress(), tree.root, ZERO_BYTES32, 201n)
        await distributor.addDistribution(await token2.getAddress(), tree.root, ZERO_BYTES32, 201n)
        await distributor.addDistribution(await token3.getAddress(), tree.root, ZERO_BYTES32, 201n)

        return { distributor, token, token2, token3, tree }
      }

      it('successful claim', async () => {
        const { distributor, token, token2, token3, tree } = await loadFixture(fixture3)

        const proof0 = tree.getProof(0)
        await expect(
          distributor.connect(signers[1]).claimDistribution(await token.getAddress(), 100, proof0)
        )
          .to.emit(distributor, 'Claimed')
          .withArgs(accounts[1], await token.getAddress(), 100)
        await expect(
          distributor.connect(signers[1]).claimDistribution(await token2.getAddress(), 100, proof0)
        )
          .to.emit(distributor, 'Claimed')
          .withArgs(accounts[1], await token2.getAddress(), 100)
        const proof1 = tree.getProof(1)
        await expect(
          distributor.connect(signers[2]).claimDistribution(await token.getAddress(), 101, proof1)
        )
          .to.emit(distributor, 'Claimed')
          .withArgs(accounts[2], await token.getAddress(), 101)
        await expect(
          distributor.connect(signers[2]).claimDistribution(await token3.getAddress(), 101, proof1)
        )
          .to.emit(distributor, 'Claimed')
          .withArgs(accounts[2], await token3.getAddress(), 101)
      })

      it('transfers the token', async () => {
        const { distributor, token, token2, token3, tree } = await loadFixture(fixture3)

        const proof0 = tree.getProof(0)
        expect(await token.balanceOf(accounts[1])).to.eq(0)
        await distributor
          .connect(signers[1])
          .claimDistribution(await token.getAddress(), 100, proof0)
        expect(await token.balanceOf(accounts[1])).to.eq(100)
        await distributor
          .connect(signers[1])
          .claimDistribution(await token2.getAddress(), 100, proof0)
        expect(await token2.balanceOf(accounts[1])).to.eq(100)
        await distributor
          .connect(signers[1])
          .claimDistribution(await token3.getAddress(), 100, proof0)
        expect(await token3.balanceOf(accounts[1])).to.eq(100)
      })

      it('increments claimed amount', async () => {
        const { distributor, token, token2, tree } = await loadFixture(fixture3)

        const proof0 = tree.getProof(0)
        expect(await distributor.getClaimed(await token.getAddress(), accounts[1])).to.eq(0)
        expect(await distributor.getClaimed(await token.getAddress(), accounts[2])).to.eq(0)
        await distributor
          .connect(signers[1])
          .claimDistribution(await token.getAddress(), 100, proof0)
        expect(await distributor.getClaimed(await token.getAddress(), accounts[1])).to.eq(100)
        expect(await distributor.getClaimed(await token.getAddress(), accounts[2])).to.eq(0)

        expect(await distributor.getClaimed(await token2.getAddress(), accounts[1])).to.eq(0)
        expect(await distributor.getClaimed(await token2.getAddress(), accounts[2])).to.eq(0)
        await distributor
          .connect(signers[1])
          .claimDistribution(await token2.getAddress(), 100, proof0)
        expect(await distributor.getClaimed(await token2.getAddress(), accounts[1])).to.eq(100)
        expect(await distributor.getClaimed(await token2.getAddress(), accounts[2])).to.eq(0)
      })

      it('cannot allow two claims', async () => {
        const { distributor, token, token2, tree } = await loadFixture(fixture3)

        const proof0 = tree.getProof(0)
        await distributor
          .connect(signers[1])
          .claimDistribution(await token.getAddress(), 100, proof0)
        await expect(
          distributor.connect(signers[1]).claimDistribution(await token.getAddress(), 100, proof0)
        ).to.be.revertedWithCustomError(distributor, 'NothingToClaim()')

        await distributor
          .connect(signers[1])
          .claimDistribution(await token2.getAddress(), 100, proof0)
        await expect(
          distributor.connect(signers[1]).claimDistribution(await token2.getAddress(), 100, proof0)
        ).to.be.revertedWithCustomError(distributor, 'NothingToClaim()')
      })

      it('can update distributions', async () => {
        const { distributor, token, token3, tree } = await loadFixture(fixture3)

        const newTree = StandardMerkleTree.of(
          [
            [accounts[1], 200n],
            [accounts[2], 201n],
          ],
          ['address', 'uint256']
        )

        await distributor
          .connect(signers[1])
          .claimDistribution(await token.getAddress(), 100, tree.getProof(0))
        await token.transfer(await distributor.getAddress(), 200n)
        await token3.transfer(await distributor.getAddress(), 200n)
        await distributor.updateDistribution(
          await token.getAddress(),
          newTree.root,
          ZERO_BYTES32,
          401n
        )
        await distributor.updateDistribution(
          await token3.getAddress(),
          newTree.root,
          ZERO_BYTES32,
          401n
        )

        await distributor
          .connect(signers[1])
          .claimDistribution(await token.getAddress(), 200, newTree.getProof(0))
        await distributor
          .connect(signers[2])
          .claimDistribution(await token.getAddress(), 201, newTree.getProof(1))
        await distributor
          .connect(signers[1])
          .claimDistribution(await token3.getAddress(), 200, newTree.getProof(0))
        await distributor
          .connect(signers[2])
          .claimDistribution(await token3.getAddress(), 201, newTree.getProof(1))
        expect(await distributor.getClaimed(await token.getAddress(), accounts[1])).to.eq(200)
        expect(await distributor.getClaimed(await token.getAddress(), accounts[2])).to.eq(201)
        expect(await distributor.getClaimed(await token3.getAddress(), accounts[1])).to.eq(200)
        expect(await distributor.getClaimed(await token3.getAddress(), accounts[2])).to.eq(201)
        expect(await token.balanceOf(accounts[1])).to.eq(200)
        expect(await token.balanceOf(accounts[2])).to.eq(201)
        expect(await token3.balanceOf(accounts[1])).to.eq(200)
        expect(await token3.balanceOf(accounts[2])).to.eq(201)
      })

      it('cannot update distribution that does not exist', async () => {
        const { distributor, token, tree } = await loadFixture(fixture3)

        await token.transfer(await distributor.getAddress(), 201n)
        await expect(
          distributor.updateDistribution(accounts[2], tree.root, ZERO_BYTES32, 201n)
        ).to.be.revertedWithCustomError(distributor, 'DistributionNotFound()')
      })

      it('can claim multiple distributions', async () => {
        const { distributor, token, token3, tree } = await loadFixture(fixture3)

        const proof0 = tree.getProof(0)

        await distributor
          .connect(signers[1])
          .claimDistributions(
            [await token.getAddress(), await token3.getAddress()],
            [100, 100],
            [proof0, proof0]
          )
        expect(await distributor.getClaimed(await token.getAddress(), accounts[1])).to.eq(100)
        expect(await distributor.getClaimed(await token3.getAddress(), accounts[1])).to.eq(100)
      })
    })
  })
})
