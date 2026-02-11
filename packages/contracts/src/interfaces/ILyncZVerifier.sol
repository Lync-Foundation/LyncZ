// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ILyncZVerifier
 * @notice Interface for payment rail verifiers (Alipay, WeChat, SEPA, etc.)
 * @dev Each verifier handles rail-specific hash computation and proof verification
 *      
 *      Privacy Design:
 *      - accountLinesHash: Pre-computed hash of seller's account info (lines 20, 21)
 *        This is stored on-chain instead of plain text for privacy.
 *      - txIdHash: SHA256 hash of transaction ID (line 25)
 *        Passed as hash to prevent transaction ID from appearing on-chain.
 *      - paymentTime: Passed as plain text for createdAt validation.
 *      - amount: From trade storage, used to compute expected hash.
 */
interface ILyncZVerifier {
    /**
     * @notice Verify a payment proof and check it matches expected values
     * @param userPublicValues The 32-byte hash output from the ZK proof
     * @param accumulator KZG accumulator from proof (384 bytes)
     * @param proof Halo2 proof data (1376 bytes)
     * @param accountLinesHash SHA256 hash of account lines (line 20 + line 21)
     * @param txIdHash SHA256 hash of transaction ID line: SHA256(25_LE || transactionId)
     * @param amountCents Payment amount in cents
     * @param paymentTime Payment timestamp string (format: "YYYY-MM-DD HH:MM:SS")
     * @return valid True if proof is valid and matches expected values
     */
    function verifyPayment(
        bytes32 userPublicValues,
        bytes calldata accumulator,
        bytes calldata proof,
        bytes32 accountLinesHash,
        bytes32 txIdHash,
        uint256 amountCents,
        string calldata paymentTime
    ) external returns (bool valid);
}
