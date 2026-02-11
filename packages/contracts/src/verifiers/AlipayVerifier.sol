// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../IOpenVmHalo2Verifier.sol";
import "../interfaces/ILyncZVerifier.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AlipayVerifier
 * @notice Verifies Alipay payment receipts using ZK proofs
 * @dev Self-contained verifier that:
 *      1. Takes pre-computed accountLinesHash from storage
 *      2. Takes txIdHash from caller (transaction ID never on-chain)
 *      3. Computes timeAmountHash from paymentTime + formatted amount
 *      4. Combines to form expected hash and compares with proof output
 *      5. Verifies Halo2 cryptographic proof
 * 
 * Privacy Design:
 *   - Seller's account info (name, masked ID) is NOT stored on-chain as plain text
 *     Only the hash of account lines (20, 21) is stored: accountLinesHash
 *   - Transaction ID is NOT stored on-chain as plain text
 *     Only the hash of line 25 is passed: txIdHash
 *   - Payment time and amount ARE visible (time for createdAt check, amount from storage)
 * 
 * Hash Structure (matches ZK circuit output):
 *   accountLinesHash = SHA256(20 || line20 || 21 || line21)
 *   txIdHash = SHA256(25 || line25)
 *   timeAmountHash = SHA256(27 || line27 || 29 || line29)
 *   output = SHA256(0x01 || publicKeyHash || accountLinesHash || txIdHash || timeAmountHash)
 * 
 * Note: alipayPublicKeyHash is MUTABLE because Alipay rotates their
 *       PDF signing certificate approximately every 24 hours.
 */
contract AlipayVerifier is ILyncZVerifier, Ownable {
    // ============ Errors ============
    error ProofVerificationFailed();
    error HashMismatch(bytes32 expected, bytes32 actual);
    error TransactionIdAlreadyUsed();

    // ============ Immutables ============
    IOpenVmHalo2Verifier public immutable halo2Verifier;
    bytes32 public immutable appExeCommit;
    bytes32 public immutable appVmCommit;

    // ============ Mutable State ============
    /// @notice Alipay's PDF signing certificate public key hash
    /// @dev Updated when Alipay rotates their certificate (~24 hours)
    bytes32 public alipayPublicKeyHash;
    
    /// @notice Mapping of used txIdHash values (anti-replay)
    /// @dev txIdHash = SHA256(25_LE || transactionId) - plaintext txId never stored on-chain
    ///      Moved here from LyncZEscrow so receipt validation is fully in the verifier
    mapping(bytes32 => bool) public usedTransactionIds;

    // ============ Events ============
    event PublicKeyHashUpdated(bytes32 indexed oldHash, bytes32 indexed newHash);

    // ============ Constructor ============
    constructor(
        address _halo2Verifier,
        bytes32 _appExeCommit,
        bytes32 _appVmCommit,
        bytes32 _alipayPublicKeyHash
    ) Ownable(msg.sender) {
        halo2Verifier = IOpenVmHalo2Verifier(_halo2Verifier);
        appExeCommit = _appExeCommit;
        appVmCommit = _appVmCommit;
        alipayPublicKeyHash = _alipayPublicKeyHash;
    }

    // ============ Admin Functions ============

    /**
     * @notice Update Alipay's public key hash
     * @dev Called when Alipay rotates their PDF signing certificate
     * @param _newHash New SHA256 hash of Alipay's DER-encoded public key
     */
    function updatePublicKeyHash(bytes32 _newHash) external onlyOwner {
        bytes32 oldHash = alipayPublicKeyHash;
        alipayPublicKeyHash = _newHash;
        emit PublicKeyHashUpdated(oldHash, _newHash);
    }

    // ============ ILyncZVerifier Implementation ============

    /// @inheritdoc ILyncZVerifier
    function verifyPayment(
        bytes32 userPublicValues,
        bytes calldata accumulator,
        bytes calldata proof,
        bytes32 accountLinesHash,
        bytes32 txIdHash,
        uint256 amountCents,
        string calldata paymentTime
    ) external override returns (bool) {
        // Step 0: Anti-replay — check txIdHash not already used
        // txIdHash = SHA256(25_LE || transactionId) computed off-chain
        if (usedTransactionIds[txIdHash]) revert TransactionIdAlreadyUsed();
        usedTransactionIds[txIdHash] = true;
        
        // Note: Payment time validation (old receipt attack prevention) is
        // temporarily disabled. The paymentTime is still used for hash computation
        // but not checked against trade.createdAt. This will be re-enabled once
        // we have a reliable way to pass createdAt to the verifier.
        
        // Step 1: Compute expected hash from accountLinesHash + txIdHash + time/amount
        bytes32 expectedHash = _computeExpectedHash(
            accountLinesHash,
            txIdHash,
            amountCents,
            paymentTime
        );

        // Step 2: Compare hashes (fail fast before expensive proof verification)
        if (userPublicValues != expectedHash) {
            revert HashMismatch(expectedHash, userPublicValues);
        }

        // Step 3: Verify Halo2 cryptographic proof
        bytes memory publicValuesBytes = abi.encodePacked(userPublicValues);
        bytes memory proofData = abi.encodePacked(accumulator, proof);

        try halo2Verifier.verify(
            publicValuesBytes,
            proofData,
            appExeCommit,
            appVmCommit
        ) {
            return true;
        } catch {
            revert ProofVerificationFailed();
        }
    }

    // ============ Hash Computation ============

    /**
     * @notice Compute expected output hash for Alipay receipts
     * @dev Mirrors the Rust guest program logic:
     *      txIdHash = SHA256(25 || line25) - passed from caller
     *      timeAmountHash = SHA256(27 || line27 || 29 || line29) - computed here
     *      output = SHA256(0x01 || publicKeyHash || accountLinesHash || txIdHash || timeAmountHash)
     * 
     *      accountLinesHash is pre-computed and stored on-chain (for privacy).
     *      txIdHash is passed from caller (transaction ID never on-chain).
     *      Only timeAmountHash is computed here from time + formatted amount.
     */
    function _computeExpectedHash(
        bytes32 accountLinesHash,
        bytes32 txIdHash,
        uint256 amountCents,
        string calldata paymentTime
    ) internal view returns (bytes32) {
        // Format CNY amount (e.g., 200 cents -> "2.00")
        string memory cnyFormatted = _formatCnyAmount(amountCents);
        
        // Build time and amount line texts (lines 27, 29)
        bytes memory line27 = bytes(paymentTime);
        bytes memory line29 = abi.encodePacked(unicode"小写：", cnyFormatted);
        
        // Compute timeAmountHash: SHA256(27 || line27 || 29 || line29)
        bytes memory timeAmountData = abi.encodePacked(
            _uint32LE(27), line27,
            _uint32LE(29), line29
        );
        bytes32 timeAmountHash = sha256(timeAmountData);
        
        // Compute final hash: SHA256(0x01 || publicKeyHash || accountLinesHash || txIdHash || timeAmountHash)
        return sha256(abi.encodePacked(
            bytes1(0x01),
            alipayPublicKeyHash,
            accountLinesHash,
            txIdHash,
            timeAmountHash
        ));
    }

    // ============ Helper Functions ============

    /**
     * @notice Format CNY amount from cents to string (e.g., 200 -> "2.00")
     */
    function _formatCnyAmount(uint256 cents) internal pure returns (string memory) {
        uint256 yuan = cents / 100;
        uint256 fen = cents % 100;
        string memory yuanStr = _toString(yuan);
        string memory fenStr = fen < 10 
            ? string(abi.encodePacked("0", _toString(fen)))
            : _toString(fen);
        return string(abi.encodePacked(yuanStr, ".", fenStr));
    }

    /**
     * @notice Convert uint32 to 4 bytes in little-endian format
     */
    function _uint32LE(uint32 v) internal pure returns (bytes4) {
        return bytes4(uint32(
            (v & 0xFF) << 24 |
            ((v >> 8) & 0xFF) << 16 |
            ((v >> 16) & 0xFF) << 8 |
            (v >> 24)
        ));
    }

    /**
     * @notice Convert uint256 to decimal string
     */
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
