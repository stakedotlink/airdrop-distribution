import { ethers } from 'hardhat'
import { expect } from 'chai'
import { getAccounts } from './utils/helpers'
import { loadFixture, time } from '@nomicfoundation/hardhat-toolbox/network-helpers'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'

// Copied and modified from: https://github.com/Uniswap/merkle-distributor/blob/master/test/MerkleDistributor.spec.ts
// Most tests have been removed as core functionality has not changed, focus on testing multiple distributions

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000'

describe('MerkleDistributor', () => {
  let accounts: string[]

  async function fixture() {
    const token = await ethers.deployContract('Token', ['Token', 'TKN', 1000000])
    const distributor = await ethers.deployContract('MerkleDistributor')

    return { distributor, token }
  }

  before(async () => {
    ;({ accounts } = await getAccounts())
  })

  describe('#claim', () => {
    it('fails for empty proof', async () => {
      const { distributor, token } = await loadFixture(fixture)
      await distributor.addDistribution(await token.getAddress(), ZERO_BYTES32, 0, 0)
      await expect(
        distributor.claimDistribution(await token.getAddress(), 0, accounts[1], 10, [])
      ).to.be.revertedWith('MerkleDistributor: Invalid proof')
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
        await distributor.addDistribution(await token.getAddress(), tree.root, 201n, 0)

        return { distributor, token, tree }
      }

      it('successful claim', async () => {
        const { distributor, token, tree } = await loadFixture(fixture2)

        const proof0 = tree.getProof(0)
        await expect(
          distributor.claimDistribution(await token.getAddress(), 0, accounts[1], 100, proof0)
        )
          .to.emit(distributor, 'Claimed')
          .withArgs(await token.getAddress(), 0, accounts[1], 100)
        const proof1 = tree.getProof(1)
        await expect(
          distributor.claimDistribution(await token.getAddress(), 1, accounts[2], 101, proof1)
        )
          .to.emit(distributor, 'Claimed')
          .withArgs(await token.getAddress(), 1, accounts[2], 101)
      })

      it('transfers the token', async () => {
        const { distributor, token, tree } = await loadFixture(fixture2)

        const proof0 = tree.getProof(0)
        expect(await token.balanceOf(accounts[1])).to.eq(0)
        await distributor.claimDistribution(await token.getAddress(), 0, accounts[1], 100, proof0)
        expect(await token.balanceOf(accounts[1])).to.eq(100)
      })

      it('increments claimed amount', async () => {
        const { distributor, token, tree } = await loadFixture(fixture2)

        const proof0 = tree.getProof(0)
        expect(await distributor.getClaimed(await token.getAddress(), accounts[1])).to.eq(0)
        expect(await distributor.getClaimed(await token.getAddress(), accounts[2])).to.eq(0)
        await distributor.claimDistribution(await token.getAddress(), 0, accounts[1], 100, proof0)
        expect(await distributor.getClaimed(await token.getAddress(), accounts[1])).to.eq(100)
        expect(await distributor.getClaimed(await token.getAddress(), accounts[2])).to.eq(0)
      })

      it('cannot allow two claims', async () => {
        const { distributor, token, tree } = await loadFixture(fixture2)

        const proof0 = tree.getProof(0)
        await distributor.claimDistribution(await token.getAddress(), 0, accounts[1], 100, proof0)
        await expect(
          distributor.claimDistribution(await token.getAddress(), 0, accounts[1], 100, proof0)
        ).to.be.revertedWith('MerkleDistributor: No claimable tokens')
      })

      it('cannot claim more than once: 0 and then 1', async () => {
        const { distributor, token, tree } = await loadFixture(fixture2)

        await distributor.claimDistribution(
          await token.getAddress(),
          0,
          accounts[1],
          100,
          tree.getProof(0)
        )
        await distributor.claimDistribution(
          await token.getAddress(),
          1,
          accounts[2],
          101,
          tree.getProof(1)
        )

        await expect(
          distributor.claimDistribution(
            await token.getAddress(),
            0,
            accounts[1],
            100,
            tree.getProof(0)
          )
        ).to.be.revertedWith('MerkleDistributor: No claimable tokens')
      })

      it('cannot claim more than once: 1 and then 0', async () => {
        const { distributor, token, tree } = await loadFixture(fixture2)

        await distributor.claimDistribution(
          await token.getAddress(),
          1,
          accounts[2],
          101,
          tree.getProof(1)
        )
        await distributor.claimDistribution(
          await token.getAddress(),
          0,
          accounts[1],
          100,
          tree.getProof(0)
        )

        await expect(
          distributor.claimDistribution(
            await token.getAddress(),
            1,
            accounts[2],
            101,
            tree.getProof(1)
          )
        ).to.be.revertedWith('MerkleDistributor: No claimable tokens')
      })

      it('cannot claim for address other than proof', async () => {
        const { distributor, token, tree } = await loadFixture(fixture2)

        const proof0 = tree.getProof(0)
        await expect(
          distributor.claimDistribution(await token.getAddress(), 1, accounts[2], 101, proof0)
        ).to.be.revertedWith('MerkleDistributor: Invalid proof')
      })

      it('cannot claim more than proof', async () => {
        const { distributor, token, tree } = await loadFixture(fixture2)

        const proof0 = tree.getProof(0)
        await expect(
          distributor.claimDistribution(await token.getAddress(), 0, accounts[1], 101, proof0)
        ).to.be.revertedWith('MerkleDistributor: Invalid proof')
      })

      it('cannot claim distribution that does not exist', async () => {
        const { distributor, tree } = await loadFixture(fixture2)

        const proof0 = tree.getProof(0)
        await expect(
          distributor.claimDistribution(accounts[2], 0, accounts[1], 101, proof0)
        ).to.be.revertedWith('MerkleDistributor: Distribution does not exist')
      })

      it('can set expiryTimestamp', async () => {
        const { distributor, token } = await loadFixture(fixture2)

        await distributor.setExpiryTimestamp(await token.getAddress(), 100000)
        expect((await distributor.distributions(await token.getAddress()))[2]).to.eq(100000)
        await expect(
          distributor.setExpiryTimestamp(await token.getAddress(), 99999)
        ).to.be.revertedWith('MerkleDistributor: Invalid expiry timestamp')
        await distributor.setExpiryTimestamp(await token.getAddress(), 101000)
        expect((await distributor.distributions(await token.getAddress()))[2]).to.eq(101000)
      })

      it('can pause for withdrawal', async () => {
        const { distributor, token } = await loadFixture(fixture2)

        let ts = (await ethers.provider.getBlock('latest'))?.timestamp || 0
        await distributor.setExpiryTimestamp(await token.getAddress(), ts + 10000)
        await expect(distributor.pauseForWithdrawal(await token.getAddress())).to.be.revertedWith(
          'MerkleDistributor: Expiry timestamp not reached'
        )
        await time.increase(10000)
        await distributor.pauseForWithdrawal(await token.getAddress())
        expect((await distributor.distributions(await token.getAddress()))[1]).to.eq(true)
      })

      it('can withdraw unclaimed tokens', async () => {
        const { distributor, token, tree } = await loadFixture(fixture2)

        await expect(
          distributor.withdrawUnclaimedTokens(await token.getAddress(), tree.root, 0)
        ).to.be.revertedWith('MerkleDistributor: Distribution is not paused')
        await distributor.claimDistribution(
          await token.getAddress(),
          1,
          accounts[2],
          101,
          tree.getProof(1)
        )
        await distributor.pauseForWithdrawal(await token.getAddress())
        await distributor.withdrawUnclaimedTokens(await token.getAddress(), tree.root, 101)
        let distribution = await distributor.distributions(await token.getAddress())
        expect(distribution[1]).to.eq(false)
        expect(distribution[3]).to.eq(tree.root)
        expect(distribution[4]).to.eq(101)
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
        await distributor.addDistributions(
          [await token.getAddress(), await token2.getAddress(), await token3.getAddress()],
          [tree.root, tree.root, tree.root],
          [201n, 201n, 201n],
          [0, 0, 0]
        )

        return { distributor, token, token2, token3, tree }
      }

      it('successful claim', async () => {
        const { distributor, token, token2, token3, tree } = await loadFixture(fixture3)

        const proof0 = tree.getProof(0)
        await expect(
          distributor.claimDistribution(await token.getAddress(), 0, accounts[1], 100, proof0)
        )
          .to.emit(distributor, 'Claimed')
          .withArgs(await token.getAddress(), 0, accounts[1], 100)
        await expect(
          distributor.claimDistribution(await token2.getAddress(), 0, accounts[1], 100, proof0)
        )
          .to.emit(distributor, 'Claimed')
          .withArgs(await token2.getAddress(), 0, accounts[1], 100)
        const proof1 = tree.getProof(1)
        await expect(
          distributor.claimDistribution(await token.getAddress(), 1, accounts[2], 101, proof1)
        )
          .to.emit(distributor, 'Claimed')
          .withArgs(await token.getAddress(), 1, accounts[2], 101)
        await expect(
          distributor.claimDistribution(await token3.getAddress(), 1, accounts[2], 101, proof1)
        )
          .to.emit(distributor, 'Claimed')
          .withArgs(await token3.getAddress(), 1, accounts[2], 101)
      })

      it('transfers the token', async () => {
        const { distributor, token, token2, token3, tree } = await loadFixture(fixture3)

        const proof0 = tree.getProof(0)
        expect(await token.balanceOf(accounts[1])).to.eq(0)
        await distributor.claimDistribution(await token.getAddress(), 0, accounts[1], 100, proof0)
        expect(await token.balanceOf(accounts[1])).to.eq(100)
        await distributor.claimDistribution(await token2.getAddress(), 0, accounts[1], 100, proof0)
        expect(await token2.balanceOf(accounts[1])).to.eq(100)
        await distributor.claimDistribution(await token3.getAddress(), 0, accounts[1], 100, proof0)
        expect(await token3.balanceOf(accounts[1])).to.eq(100)
      })

      it('increments claimed amount', async () => {
        const { distributor, token, token2, tree } = await loadFixture(fixture3)

        const proof0 = tree.getProof(0)
        expect(await distributor.getClaimed(await token.getAddress(), accounts[1])).to.eq(0)
        expect(await distributor.getClaimed(await token.getAddress(), accounts[2])).to.eq(0)
        await distributor.claimDistribution(await token.getAddress(), 0, accounts[1], 100, proof0)
        expect(await distributor.getClaimed(await token.getAddress(), accounts[1])).to.eq(100)
        expect(await distributor.getClaimed(await token.getAddress(), accounts[2])).to.eq(0)

        expect(await distributor.getClaimed(await token2.getAddress(), accounts[1])).to.eq(0)
        expect(await distributor.getClaimed(await token2.getAddress(), accounts[2])).to.eq(0)
        await distributor.claimDistribution(await token2.getAddress(), 0, accounts[1], 100, proof0)
        expect(await distributor.getClaimed(await token2.getAddress(), accounts[1])).to.eq(100)
        expect(await distributor.getClaimed(await token2.getAddress(), accounts[2])).to.eq(0)
      })

      it('cannot allow two claims', async () => {
        const { distributor, token, token2, tree } = await loadFixture(fixture3)

        const proof0 = tree.getProof(0)
        await distributor.claimDistribution(await token.getAddress(), 0, accounts[1], 100, proof0)
        await expect(
          distributor.claimDistribution(await token.getAddress(), 0, accounts[1], 100, proof0)
        ).to.be.revertedWith('MerkleDistributor: No claimable tokens')

        await distributor.claimDistribution(await token2.getAddress(), 0, accounts[1], 100, proof0)
        await expect(
          distributor.claimDistribution(await token2.getAddress(), 0, accounts[1], 100, proof0)
        ).to.be.revertedWith('MerkleDistributor: No claimable tokens')
      })

      it('cannot add distributions of unequal length', async () => {
        const { distributor, token, token2, tree } = await loadFixture(fixture3)

        await expect(
          distributor.addDistributions(
            [await token.getAddress(), await token2.getAddress(), await token2.getAddress()],
            [tree.root, tree.root],
            [201n, 201n],
            [0, 0]
          )
        ).to.be.revertedWith('MerkleDistributor: Array lengths need to match')
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
        let proof0 = tree.getProof(0)

        await distributor.claimDistribution(await token.getAddress(), 0, accounts[1], 100, proof0)
        await token.transfer(await distributor.getAddress(), 200n)
        await token3.transfer(await distributor.getAddress(), 200n)
        await distributor.updateDistributions(
          [await token.getAddress(), await token3.getAddress()],
          [newTree.root, newTree.root],
          [200n, 200n],
          [100, 0]
        )

        expect((await distributor.distributions(await token.getAddress()))[2]).to.eq(100)
        expect((await distributor.distributions(await token.getAddress()))[4]).to.eq(401)

        proof0 = newTree.getProof(0)
        let proof1 = newTree.getProof(1)

        await distributor.claimDistribution(await token.getAddress(), 0, accounts[1], 200, proof0)
        await distributor.claimDistribution(await token.getAddress(), 1, accounts[2], 201, proof1)
        await distributor.claimDistribution(await token3.getAddress(), 0, accounts[1], 200, proof0)
        await distributor.claimDistribution(await token3.getAddress(), 1, accounts[2], 201, proof1)
        expect(await distributor.getClaimed(await token.getAddress(), accounts[1])).to.eq(200)
        expect(await distributor.getClaimed(await token.getAddress(), accounts[2])).to.eq(201)
        expect(await distributor.getClaimed(await token3.getAddress(), accounts[1])).to.eq(200)
        expect(await distributor.getClaimed(await token3.getAddress(), accounts[2])).to.eq(201)
        expect(await token.balanceOf(accounts[1])).to.eq(200)
        expect(await token.balanceOf(accounts[2])).to.eq(201)
        expect(await token3.balanceOf(accounts[1])).to.eq(200)
        expect(await token3.balanceOf(accounts[2])).to.eq(201)
      })

      it('cannot update distributions of unequal length', async () => {
        const { distributor, token, token2, tree } = await loadFixture(fixture3)

        await expect(
          distributor.updateDistributions(
            [await token.getAddress(), await token2.getAddress(), await token2.getAddress()],
            [tree.root, tree.root],
            [201n, 201n],
            [0, 0]
          )
        ).to.be.revertedWith('MerkleDistributor: Array lengths need to match')
      })

      it('cannot update distribution that does not exist', async () => {
        const { distributor, token, tree } = await loadFixture(fixture3)

        await token.transfer(await distributor.getAddress(), 201n)
        await expect(
          distributor.updateDistributions(
            [await token.getAddress(), accounts[2]],
            [tree.root, tree.root],
            [201n, 201n],
            [0, 0]
          )
        ).to.be.revertedWith('MerkleDistributor: Distribution does not exist')
      })

      it('can claim multiple distributions', async () => {
        const { distributor, token, token3, tree } = await loadFixture(fixture3)

        const proof0 = tree.getProof(0)

        await distributor.claimDistributions(
          [await token.getAddress(), await token3.getAddress()],
          [0, 0],
          accounts[1],
          [100, 100],
          [proof0, proof0]
        )
        expect(await distributor.getClaimed(await token.getAddress(), accounts[1])).to.eq(100)
        expect(await distributor.getClaimed(await token3.getAddress(), accounts[1])).to.eq(100)
      })
    })
  })
})
