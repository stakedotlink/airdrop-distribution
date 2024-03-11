// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Merkle Distributor
 * @notice Handles token airdrops for any number of asset tokens
 * @dev Tree data is stored on IPFS for each token distribution
 */
contract MerkleDistributor is Ownable {
    using SafeERC20 for IERC20;

    struct Distribution {
        address token;
        bool isPaused;
        bytes32 merkleRoot;
        bytes32 ipfsHash;
    }
    address[] private tokens;
    mapping(address => Distribution) private distributions;
    mapping(address => mapping(address => uint256)) private claimed;

    event Claimed(address indexed account, address indexed token, uint256 amount);
    event DistributionUpdated(address indexed token, bytes32 merkleRoot, bytes32 ipfsHash, uint256 totalAmount);
    event WithdrawUnclaimedTokens(address indexed token, bytes32 merkleRoot, bytes32 ipfsHash, uint256 totalAmount);

    error DistributionExists();
    error DistributionNotFound();
    error DistributionPaused();
    error DistributionNotPaused();
    error InvalidLengths();
    error InvalidProof();
    error NothingToClaim();

    constructor() Ownable(msg.sender) {}

    modifier distributionExists(address _token) {
        if (distributions[_token].token == address(0)) revert DistributionNotFound();
        _;
    }

    /**
     * @notice returns a list of all supported tokens
     * @return list of supported tokens
     **/
    function getTokens() external view returns (address[] memory) {
        return tokens;
    }

    /**
     * @notice returns a list of all distributions
     * @return list of distributions
     **/
    function getDistributions() external view returns (Distribution[] memory) {
        Distribution[] memory dists = new Distribution[](tokens.length);

        for (uint256 i = 0; i < dists.length; ++i) {
            dists[i] = distributions[tokens[i]];
        }

        return dists;
    }

    /**
     * @notice returns the total amount that an account has claimed from a distribution
     * @param _token token address
     * @param _account address of the account to return claimed amount for
     **/
    function getClaimed(address _token, address _account) public view returns (uint256) {
        return claimed[_token][_account];
    }

    /**
     * @notice adds a token distribution
     * @param _token token address
     * @param _merkleRoot merkle root for the distribution tree
     * @param _ipfsHash ipfs hash for the distribution tree (CIDv0, no prefix - only hash)
     * @param _totalAmount total distribution amount
     **/
    function addDistribution(address _token, bytes32 _merkleRoot, bytes32 _ipfsHash, uint256 _totalAmount) public onlyOwner {
        if (distributions[_token].token != address(0)) revert DistributionExists();

        tokens.push(_token);
        distributions[_token].token = _token;
        distributions[_token].merkleRoot = _merkleRoot;
        distributions[_token].ipfsHash = _ipfsHash;

        emit DistributionUpdated(_token, _merkleRoot, _ipfsHash, _totalAmount);
    }

    /**
     * @notice updates a token distribution by distributing additional tokens
     * @dev merkle tree should be updated to reflect additional amount - the amount for each
     * account should be incremented by any additional allocation and any new accounts should be added
     * to the tree
     * @param _token token address
     * @param _merkleRoot updated merkle root for the distribution tree
     * @param _ipfsHash ipfs hash for the distribution tree (CIDv0, no prefix - only hash)
     * @param _totalAmount total distribution amount including existing and additional amount
     **/
    function updateDistribution(
        address _token,
        bytes32 _merkleRoot,
        bytes32 _ipfsHash,
        uint256 _totalAmount
    ) public onlyOwner distributionExists(_token) {
        if (distributions[_token].isPaused) revert DistributionPaused();

        distributions[_token].merkleRoot = _merkleRoot;
        distributions[_token].ipfsHash = _ipfsHash;

        emit DistributionUpdated(_token, _merkleRoot, _ipfsHash, _totalAmount);
    }

    /**
     * @notice claims multiple token distributions
     * @param _tokens list of token address
     * @param _amounts list of amounts as recorded in sender's merkle tree entries
     * @param _merkleProofs list of merkle proofs for the token claims
     **/
    function claimDistributions(
        address[] calldata _tokens,
        uint256[] calldata _amounts,
        bytes32[][] calldata _merkleProofs
    ) external {
        if (_tokens.length != _amounts.length || _tokens.length != _merkleProofs.length) revert InvalidLengths();

        for (uint256 i = 0; i < _tokens.length; ++i) {
            claimDistribution(_tokens[i], _amounts[i], _merkleProofs[i]);
        }
    }

    /**
     * @notice claims a token distribution
     * @param _token token address
     * @param _amount amount as recorded in sender's merkle tree entry
     * @param _merkleProof merkle proof for the token claim
     **/
    function claimDistribution(
        address _token,
        uint256 _amount,
        bytes32[] calldata _merkleProof
    ) public distributionExists(_token) {
        if (distributions[_token].isPaused) revert DistributionPaused();
        Distribution storage distribution = distributions[_token];

        bytes32 node = keccak256(bytes.concat(keccak256(abi.encode(msg.sender, _amount))));
        if (!MerkleProof.verify(_merkleProof, distribution.merkleRoot, node)) revert InvalidProof();

        if (getClaimed(_token, msg.sender) >= _amount) revert NothingToClaim();

        uint256 amount = _amount - getClaimed(_token, msg.sender);
        claimed[_token][msg.sender] = _amount;
        IERC20(_token).safeTransfer(msg.sender, amount);

        emit Claimed(msg.sender, _token, amount);
    }

    /**
     * @notice withdraws unclaimed tokens
     * @dev merkle tree should be updated to reflect current state of claims - the amount for each
     * account should be set to equal claimed[account]
     * @param _token token address
     * @param _merkleRoot updated merkle root for the distribution tree
     * @param _ipfsHash updated ipfs hash for the distribution tree (CIDv0, no prefix - only hash)
     * @param _totalAmount updated total amount (should be equal to the total claimed amount across all accounts)
     **/
    function withdrawUnclaimedTokens(
        address _token,
        bytes32 _merkleRoot,
        bytes32 _ipfsHash,
        uint256 _totalAmount
    ) external onlyOwner distributionExists(_token) {
        if (!distributions[_token].isPaused) revert DistributionNotPaused();

        IERC20 token = IERC20(_token);
        uint256 balance = token.balanceOf(address(this));
        if (balance != 0) {
            token.safeTransfer(msg.sender, balance);
        }

        distributions[_token].merkleRoot = _merkleRoot;
        distributions[_token].ipfsHash = _ipfsHash;
        distributions[_token].isPaused = false;

        emit WithdrawUnclaimedTokens(_token, _merkleRoot, _ipfsHash, _totalAmount);
    }

    /**
     * @notice pauses a token distribution for withdrawal of unclaimed tokens
     * @dev must be called before withdrawUnlclaimedTokens to ensure state doesn't change
     * while the new merkle root is calculated
     * @param _token token address
     **/
    function pauseForWithdrawal(address _token) external onlyOwner distributionExists(_token) {
        if (distributions[_token].isPaused) revert DistributionPaused();
        distributions[_token].isPaused = true;
    }
}
