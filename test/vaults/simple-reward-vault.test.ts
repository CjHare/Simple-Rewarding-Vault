// Start - Support direct Mocha run & debug
import 'hardhat'
import '@nomiclabs/hardhat-ethers'
// End - Support direct Mocha run & debug

import {IERC20, SimpleRewardVault} from '../../typechain-types'
import chai, {expect} from 'chai'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {solidity} from 'ethereum-waffle'
import {BigNumber} from 'ethers'
import {mine} from '../utils/mining'
import {deploy, signer} from '../utils/contract'

// Wires up Waffle with Chai
chai.use(solidity)

const ZERO = BigNumber.from(0)
const SIXTEEN_DECIMAL_PLACES = BigNumber.from(10).pow(16)
const EIGHTEEN_DECIMAL_PLACES = BigNumber.from(10).pow(18)
const ONE_HUNDRED_TOKENS = BigNumber.from(100).mul(EIGHTEEN_DECIMAL_PLACES)
const TWO_HUNDRED_TOKENS = BigNumber.from(200).mul(EIGHTEEN_DECIMAL_PLACES)
const ONE_MILLION_TOKENS = BigNumber.from(10e5).mul(EIGHTEEN_DECIMAL_PLACES)

// Manual mining is on; mine() must be called to produce blocks!
describe('Staking Pool Tests', () => {
    before(async () => {
        userOne = await signer(1)
        userTwo = await signer(2)
        userThree = await signer(3)
    })

    beforeEach(async () => {
        const promiseStakingContract = deploy(
            'TestERC20',
            'StakingToken',
            'STK',
            ONE_MILLION_TOKENS
        )
        const promisedRewardContract = deploy(
            'TestERC20',
            'RewardToken',
            'RTK',
            ONE_MILLION_TOKENS
        )

        await mine()

        assets = <IERC20>await promiseStakingContract
        rewards = <IERC20>await promisedRewardContract

        const promisedVaultContract = deploy(
            'SimpleRewardVault',
            rewards.address,
            assets.address,
            'VaultToken',
            'VTK'
        )
        await mine()
        vault = <SimpleRewardVault>await promisedVaultContract
    })

    it('should calculate rewards for staggered stakes and withdrawal', async () => {
        // Owner deposits 1,000,000 reward tokens (in rewards decimal)
        await rewards.transfer(vault.address, ONE_MILLION_TOKENS)

        // Give the users with their staking funds
        await assets.transfer(userOne.address, ONE_HUNDRED_TOKENS)
        await assets.transfer(userTwo.address, TWO_HUNDRED_TOKENS)
        await assets.transfer(userThree.address, ONE_HUNDRED_TOKENS)

        await mine()

        // 1 token per a block - hardcoded in contract

        // User 1 deposits 100 token A into Vault, receiving 100 Vault tokens
        await assets.connect(userOne).approve(vault.address, ONE_HUNDRED_TOKENS)
        await vault
            .connect(userOne)
            .deposit(ONE_HUNDRED_TOKENS, userOne.address)

        // User 2 deposits 200 token A into Vault, receiving 200 Vault tokens
        await assets.connect(userTwo).approve(vault.address, TWO_HUNDRED_TOKENS)
        await vault
            .connect(userTwo)
            .deposit(TWO_HUNDRED_TOKENS, userTwo.address)

        // Pass 100 blocks - 100 blocks of reward time
        await mine(100)

        // User 1 withdraws 100 tokens (burning the vault tokens) and receives 33.33 reward tokens
        await vault
            .connect(userOne)
            .withdraw(ONE_HUNDRED_TOKENS, userOne.address, userOne.address)

        // Mine User One's withdrawal
        await mine()

        // User 2 keeps balance (has earned 66.66 reward tokens to date)
        expect(
            await vault.previewHarvestRewards(userTwo.address),
            'User Two rewards'
        ).to.be.closeTo(rewardsTwoDp(66.66), SIXTEEN_DECIMAL_PLACES)

        // Pass another 100 blocks - 100 blocks of reward time
        await mine(100)

        // User 2 keeps balance (has earned 166.66 vault tokens)
        expect(
            await vault.previewHarvestRewards(userTwo.address),
            'User Two previewed rewards'
        ).to.be.closeTo(rewardsTwoDp(166.66), SIXTEEN_DECIMAL_PLACES)

        // User 3 deposits 100 token A into Vault, receiving 100 Vault tokens
        await assets
            .connect(userThree)
            .approve(vault.address, ONE_HUNDRED_TOKENS)
        await vault
            .connect(userThree)
            .deposit(ONE_HUNDRED_TOKENS, userThree.address)

        // Mine User Three's deposit
        await mine()

        // Pass 100 blocks - 100 blocks of reward time
        await mine(100)

        // User One withdrew and harvested rewards
        expect(await vault.balanceOf(userOne.address), 'User One vault').equals(
            ZERO
        )
        expect(
            await assets.balanceOf(userOne.address),
            'User One assets'
        ).equals(ONE_HUNDRED_TOKENS)
        expect(
            await rewards.balanceOf(userOne.address),
            'User One rewards'
        ).to.be.closeTo(rewardsTwoDp(33.33), SIXTEEN_DECIMAL_PLACES)

        // User Two is still staking
        expect(await vault.balanceOf(userTwo.address), 'User Two vault').equals(
            TWO_HUNDRED_TOKENS
        )
        expect(
            await assets.balanceOf(userTwo.address),
            'User Two assets'
        ).equals(ZERO)
        expect(
            await rewards.balanceOf(userTwo.address),
            'User Two rewards'
        ).equals(ZERO)
        expect(
            await vault.previewHarvestRewards(userTwo.address),
            'User Two previewed rewards'
        ).to.be.closeTo(rewardsTwoDp(234.33), SIXTEEN_DECIMAL_PLACES)

        // User Three is still staking
        expect(
            await vault.balanceOf(userThree.address),
            'User Three vault'
        ).equals(ONE_HUNDRED_TOKENS)
        expect(
            await assets.balanceOf(userThree.address),
            'User Three assets'
        ).equals(ZERO)
        expect(
            await rewards.balanceOf(userThree.address),
            'User Three rewards'
        ).equals(ZERO)
        expect(
            await vault.previewHarvestRewards(userThree.address),
            'User Three previewed rewards'
        ).to.be.closeTo(rewardsTwoDp(33.33), SIXTEEN_DECIMAL_PLACES)
    })

    it('should allow emergency withdrawal of vaults assets, with rewards owed', async () => {
        // two depoists
        // pass 100 blocks
        // verify rewards owed to both & their existing balances & reward balances
        // emergency exit
        // verify rewards owed to both & their existing balances & reward balances
        // TODO code
    })

    it('should allow emergency withdrawal of last of vaults assets', async () => {
        await assets.transfer(userOne.address, TWO_HUNDRED_TOKENS)

        await mine()

        await assets.connect(userOne).approve(vault.address, TWO_HUNDRED_TOKENS)
        await vault
            .connect(userOne)
            .deposit(TWO_HUNDRED_TOKENS, userOne.address)

        await mine()

        // Accrue ten blocks of rewards owed
        await mine(10)

        expect(
            await vault.balanceOf(userOne.address),
            'User One share amount'
        ).to.be.closeTo(TWO_HUNDRED_TOKENS, SIXTEEN_DECIMAL_PLACES)

        expect(
            await vault.previewHarvestRewards(userOne.address),
            'User One owed rewards'
        ).to.be.closeTo(rewardsTwoDp(10), SIXTEEN_DECIMAL_PLACES)

        await vault.connect(userOne).emergencyWithdraw(userTwo.address)

        await mine()

        // No shares, assets or owed rewards should remain, with the assets transferred to user two
        expect(
            await vault.balanceOf(userOne.address),
            'User One share amount after emergency withdraw'
        ).to.equal(0)

        expect(
            await vault.previewHarvestRewards(userOne.address),
            'User One owed rewards after emergency withdraw'
        ).to.equal(0)

        expect(
            await vault.totalSupply(),
            'Vault has supply of shares is zero after emergency withdraw'
        ).to.equal(0)

        expect(
            await vault.totalAssets(),
            'Vault holds zero assets after emergency withdraw'
        ).to.equal(0)

        expect(
            await assets.balanceOf(userTwo.address),
            'User Two assets received from emergency withdraw'
        ).to.equal(TWO_HUNDRED_TOKENS)
    })

    function rewardsTwoDp(twoDecimalPlaceAmount: number): BigNumber {
        return BigNumber.from(Math.round(twoDecimalPlaceAmount * 100)).mul(
            SIXTEEN_DECIMAL_PLACES
        )
    }

    let vault: SimpleRewardVault
    let assets: IERC20
    let rewards: IERC20
    let userOne: SignerWithAddress
    let userTwo: SignerWithAddress
    let userThree: SignerWithAddress
})
