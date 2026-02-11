// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./interfaces/ILyncZVerifier.sol";
import "./interfaces/IFeeCalculator.sol";

/**
 * @title LyncZEscrow
 * @notice Multi-token, multi-rail escrow for P2P fiat-to-crypto swaps
 * @dev Sellers lock crypto and specify payment rail (Alipay, WeChat, etc.)
 *      Buyers select token → payment method → fill orders
 *      Settlement via ZK proof verification of payment receipts
 *
 * Key Features:
 * - Multi-token: Any ERC20 (USDC, USDT, DAI, WETH, etc.) via SafeERC20
 * - Multi-rail: Alipay, WeChat Pay, SEPA (future)
 * - Non-custodial: Funds released only after valid proof
 * - Privacy: Seller payment info stored as hash (accountLinesHash)
 *
 * Anti-Replay & Receipt Validation:
 * - Delegated to the verifier contract (e.g., AlipayVerifier)
 * - txIdHash anti-replay, payment time checks, etc. live in the verifier
 * - ZK proof binding: All fields verified cryptographically via Halo2 proof
 */
contract LyncZEscrow is ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;
    
    // ============ Enums ============
    
    enum PaymentRail {
        ALIPAY,
        WECHAT
        // SEPA, WISE, etc. added later
    }
    
    enum TradeStatus {
        PENDING,    // Trade created, waiting for payment proof
        SETTLED,    // Trade completed, tokens released to buyer
        EXPIRED     // Trade expired, tokens returned to order pool
    }
    
    // ============ Structs ============
    
    /**
     * @notice Sell order created by crypto seller
     * @param orderId Unique order identifier
     * @param seller Address of crypto seller (receives fiat)
     * @param token ERC20 token address
     * @param totalAmount Total tokens locked
     * @param remainingAmount Tokens still available for fills
     * @param exchangeRate Fiat cents per token unit (adjusted for decimals)
     * @param rail Payment rail (Alipay, WeChat, etc.)
     * @param accountLinesHash SHA256 hash of account lines (line 20 + line 21) for privacy
     * @param isPublic Whether order is publicly listed or private (requires code)
     * @param createdAt Timestamp when order was created
     * @param tokenDecimals Cached token decimals
     */
    struct Order {
        bytes32 orderId;
        address seller;
        address token;
        uint256 totalAmount;
        uint256 remainingAmount;
        uint256 exchangeRate;
        PaymentRail rail;
        bytes32 accountLinesHash;
        bool isPublic;
        uint256 createdAt;
        uint8 tokenDecimals;
    }
    
    /**
     * @notice Trade created when buyer fills an order
     * @param tradeId Unique trade identifier
     * @param orderId Associated order ID
     * @param buyer Address of fiat sender (receives crypto)
     * @param tokenAmount Amount of tokens for this trade
     * @param fiatAmount Amount of fiat expected (in cents)
     * @param createdAt Timestamp when trade was created
     * @param expiresAt Timestamp when trade expires
     * @param status Current trade status
     */
    struct Trade {
        bytes32 tradeId;
        bytes32 orderId;
        address buyer;
        uint256 tokenAmount;
        uint256 fiatAmount;
        uint256 createdAt;
        uint256 expiresAt;
        TradeStatus status;
    }
    
    // ============ State Variables ============
    
    /// @notice Mapping of orderId to Order
    mapping(bytes32 => Order) public orders;
    
    /// @notice Mapping of tradeId to Trade
    mapping(bytes32 => Trade) public trades;
    
    /// @notice Mapping of payment rail to verifier contract
    mapping(PaymentRail => ILyncZVerifier) public verifiers;
    
    /// @notice Counter for generating unique IDs
    uint256 private counter;
    
    /// @notice Minimum trade value in fiat cents
    uint256 public minTradeValue;
    
    /// @notice Maximum trade value in fiat cents
    uint256 public maxTradeValue;
    
    /// @notice Payment window in seconds
    uint256 public paymentWindow;
    
    /// @notice Fee calculator contract (upgradeable)
    IFeeCalculator public feeCalculator;
    
    /// @notice Accumulated fees per token (token address => amount)
    mapping(address => uint256) public accumulatedFees;
    
    /// @notice Fee amount per trade (tradeId => fee in tokens)
    mapping(bytes32 => uint256) public tradeFees;
    
    // ============ Events ============
    
    event OrderCreated(
        bytes32 indexed orderId,
        address indexed seller,
        address indexed token,
        uint256 totalAmount,
        uint256 exchangeRate,
        PaymentRail rail,
        bytes32 accountLinesHash,
        bool isPublic
    );
    
    event TradeCreated(
        bytes32 indexed tradeId,
        bytes32 indexed orderId,
        address indexed buyer,
        address token,
        uint256 tokenAmount,
        uint256 feeAmount,      // Fee reserved for this trade
        uint256 fiatAmount,
        uint256 expiresAt
    );
    
    event TradeSettled(
        bytes32 indexed tradeId,
        bytes32 indexed txIdHash
    );
    
    event TradeExpired(
        bytes32 indexed tradeId,
        bytes32 indexed orderId,
        uint256 totalReturned   // tokenAmount + feeAmount returned to seller
    );
    
    event OrderWithdrawn(
        bytes32 indexed orderId,
        uint256 withdrawnAmount,
        uint256 remainingAmount
    );
    
    event ExchangeRateUpdated(
        bytes32 indexed orderId,
        uint256 oldRate,
        uint256 newRate
    );
    
    event AccountLinesHashUpdated(
        bytes32 indexed orderId,
        bytes32 oldHash,
        bytes32 newHash
    );
    
    event VerifierUpdated(
        PaymentRail indexed rail,
        address indexed oldVerifier,
        address indexed newVerifier
    );
    
    event FeeCalculatorUpdated(
        address indexed oldCalculator,
        address indexed newCalculator
    );
    
    event FeesCollected(
        bytes32 indexed tradeId,
        address indexed token,
        uint256 feeAmount
    );
    
    event FeesWithdrawn(
        address indexed token,
        address indexed recipient,
        uint256 amount
    );
    
    // ============ Errors ============
    
    error OrderNotFound();
    error TradeNotFound();
    error TradeNotPending();
    error TradeNotExpired();
    error TradeExpiredError();
    error NotAuthorized();
    error AmountBelowMinimum();
    error AmountAboveMaximum();
    error AmountExceedsAvailable();
    error WithdrawalExceedsAvailable();
    error VerifierNotSet();
    error ProofVerificationFailed();
    error NoFeesToWithdraw();
    error FeeCalculatorNotSet();
    error FiatAmountMustBeWholeYuan();  // fiatAmount must be divisible by 100 (whole yuan, no fen)
    error InvalidAccountLinesHash();  // accountLinesHash cannot be zero
    error InvalidAmount();  // generic invalid amount (e.g., zero exchange rate)
    
    // ============ Constructor ============
    
    /**
     * @notice Initialize the escrow contract
     * @param _minTradeValue Minimum trade value in fiat cents
     * @param _maxTradeValue Maximum trade value in fiat cents
     * @param _paymentWindow Payment window in seconds
     * @param _feeCalculator Address of fee calculator contract
     */
    constructor(
        uint256 _minTradeValue,
        uint256 _maxTradeValue,
        uint256 _paymentWindow,
        address _feeCalculator
    ) Ownable(msg.sender) {
        require(_minTradeValue > 0, "Min must be > 0");
        require(_maxTradeValue >= _minTradeValue, "Max must be >= min");
        require(_paymentWindow > 0, "Window must be > 0");
        require(_feeCalculator != address(0), "Fee calculator required");
        
        minTradeValue = _minTradeValue;
        maxTradeValue = _maxTradeValue;
        paymentWindow = _paymentWindow;
        feeCalculator = IFeeCalculator(_feeCalculator);
    }
    
    // ============ Seller Functions ============
    
    /**
     * @notice Create a sell order and lock tokens
     * @param token ERC20 token address
     * @param totalAmount Amount of tokens to lock
     * @param exchangeRate Fiat cents per token unit
     * @param rail Payment rail (Alipay, WeChat)
     * @param accountLinesHash SHA256 hash of account lines (computed off-chain)
     * @param isPublic Whether order is publicly listed or private
     * @return orderId Unique order identifier
     */
    function createOrder(
        address token,
        uint256 totalAmount,
        uint256 exchangeRate,
        PaymentRail rail,
        bytes32 accountLinesHash,
        bool isPublic
    ) external nonReentrant whenNotPaused returns (bytes32 orderId) {
        // Verify verifier is set for this rail
        if (address(verifiers[rail]) == address(0)) revert VerifierNotSet();
        
        // Validate accountLinesHash is not zero
        if (accountLinesHash == bytes32(0)) revert InvalidAccountLinesHash();
        
        // Get token decimals
        uint8 tokenDecimals = IERC20Metadata(token).decimals();
        
        // Generate unique order ID
        orderId = keccak256(abi.encodePacked(
            msg.sender,
            token,
            totalAmount,
            exchangeRate,
            block.timestamp,
            counter++
        ));
        
        // Create order
        orders[orderId] = Order({
            orderId: orderId,
            seller: msg.sender,
            token: token,
            totalAmount: totalAmount,
            remainingAmount: totalAmount,
            exchangeRate: exchangeRate,
            rail: rail,
            accountLinesHash: accountLinesHash,
            isPublic: isPublic,
            createdAt: block.timestamp,
            tokenDecimals: tokenDecimals
        });
        
        // Transfer tokens from seller (SafeERC20 handles non-standard tokens like USDT)
        IERC20(token).safeTransferFrom(msg.sender, address(this), totalAmount);
        
        emit OrderCreated(
            orderId,
            msg.sender,
            token,
            totalAmount,
            exchangeRate,
            rail,
            accountLinesHash,
            isPublic
        );
    }
    
    /**
     * @notice Withdraw tokens from order
     * @param orderId Order identifier
     * @param amount Amount to withdraw
     */
    function withdrawFromOrder(bytes32 orderId, uint256 amount) external nonReentrant {
        Order storage order = orders[orderId];
        
        if (order.seller == address(0)) revert OrderNotFound();
        if (msg.sender != order.seller) revert NotAuthorized();
        if (amount > order.remainingAmount) revert WithdrawalExceedsAvailable();
        
        order.remainingAmount -= amount;
        
        IERC20(order.token).safeTransfer(order.seller, amount);
        
        emit OrderWithdrawn(orderId, amount, order.remainingAmount);
    }
    
    /**
     * @notice Update exchange rate for an order
     * @dev Only seller can update. Rate cannot be 0.
     * @param orderId Order identifier
     * @param newExchangeRate New exchange rate in fiat cents per token unit
     */
    function updateExchangeRate(bytes32 orderId, uint256 newExchangeRate) external {
        Order storage order = orders[orderId];
        
        if (order.seller == address(0)) revert OrderNotFound();
        if (msg.sender != order.seller) revert NotAuthorized();
        if (newExchangeRate == 0) revert InvalidAmount();
        
        uint256 oldRate = order.exchangeRate;
        order.exchangeRate = newExchangeRate;
        
        emit ExchangeRateUpdated(orderId, oldRate, newExchangeRate);
    }
    
    /**
     * @notice Update account lines hash for an order
     * @dev Only seller can update. Hash cannot be zero.
     *      Seller must recompute hash off-chain when changing payment info.
     * @param orderId Order identifier
     * @param newAccountLinesHash New SHA256 hash of account lines
     */
    function updateAccountLinesHash(
        bytes32 orderId,
        bytes32 newAccountLinesHash
    ) external {
        Order storage order = orders[orderId];
        
        if (order.seller == address(0)) revert OrderNotFound();
        if (msg.sender != order.seller) revert NotAuthorized();
        if (newAccountLinesHash == bytes32(0)) revert InvalidAccountLinesHash();
        
        bytes32 oldHash = order.accountLinesHash;
        order.accountLinesHash = newAccountLinesHash;
        
        emit AccountLinesHashUpdated(orderId, oldHash, newAccountLinesHash);
    }
    
    // ============ Buyer Functions ============
    
    /**
     * @notice Fill a sell order (called by backend after off-chain matching)
     * @dev Fee is calculated via external fee calculator (upgradeable).
     *      Buyer receives tokens calculated from fiat amount, fee is deducted from seller.
     *      Token amount is rounded UP so buyer absorbs any dust.
     * @param orderId Order to fill
     * @param buyer Buyer's address
     * @param fiatAmount Amount of fiat in cents (must be whole yuan, divisible by 100)
     * @return tradeId Unique trade identifier
     */
    function fillOrder(
        bytes32 orderId,
        address buyer,
        uint256 fiatAmount
    ) external nonReentrant whenNotPaused returns (bytes32 tradeId) {
        Order storage order = orders[orderId];
        
        if (order.seller == address(0)) revert OrderNotFound();
        if (address(feeCalculator) == address(0)) revert FeeCalculatorNotSet();
        
        // Enforce integer CNY amounts (must be whole yuan, no fen)
        // fiatAmount is in cents, so must be divisible by 100
        if (fiatAmount % 100 != 0) revert FiatAmountMustBeWholeYuan();
        
        // Calculate token amount from fiat amount
        // tokenAmount = (fiatAmount * 10^decimals) / exchangeRate
        // Round UP so buyer absorbs dust (seller gets slightly more fiat per token)
        uint256 tokenAmount = (fiatAmount * 10**order.tokenDecimals + order.exchangeRate - 1) / order.exchangeRate;
        
        // Calculate fee via external calculator (upgradeable!)
        // Pass isPublic flag for different fee rates on public vs private orders
        uint256 feeTokens = feeCalculator.calculateFee(tokenAmount, fiatAmount, order.token, buyer, order.isPublic);
        
        // Total tokens to reserve from seller: buyer's amount + fee
        uint256 totalReserve = tokenAmount + feeTokens;
        
        // Validate amounts
        if (fiatAmount < minTradeValue) revert AmountBelowMinimum();
        if (fiatAmount > maxTradeValue) revert AmountAboveMaximum();
        if (totalReserve > order.remainingAmount) revert AmountExceedsAvailable();
        
        // Generate trade ID
        tradeId = keccak256(abi.encodePacked(
            orderId,
            buyer,
            fiatAmount,
            block.timestamp,
            counter++
        ));
        
        uint256 expiresAt = block.timestamp + paymentWindow;
        
        // Create trade
        trades[tradeId] = Trade({
            tradeId: tradeId,
            orderId: orderId,
            buyer: buyer,
            tokenAmount: tokenAmount,
            fiatAmount: fiatAmount,
            createdAt: block.timestamp,
            expiresAt: expiresAt,
            status: TradeStatus.PENDING
        });
        
        // Store fee amount for this trade
        tradeFees[tradeId] = feeTokens;
        
        // Reserve tokens (buyer amount + fee)
        order.remainingAmount -= totalReserve;
        
        emit TradeCreated(
            tradeId,
            orderId,
            buyer,
            order.token,
            tokenAmount,
            feeTokens,      // Include fee so backend can sync exactly
            fiatAmount,
            expiresAt
        );
    }
    
    /**
     * @notice Submit payment proof and settle trade
     * @param tradeId Trade identifier
     * @param txIdHash SHA256 hash of transaction ID line: SHA256(25_LE || transactionId)
     *                 This hash is used for anti-replay; the plaintext txId never appears on-chain
     * @param paymentTime Payment timestamp string (format: "YYYY-MM-DD HH:MM:SS")
     * @param userPublicValues Public output from ZK proof (32 bytes)
     * @param accumulator KZG accumulator (384 bytes)
     * @param proof Halo2 proof data (1376 bytes)
     */
    function submitProof(
        bytes32 tradeId,
        bytes32 txIdHash,
        string calldata paymentTime,
        bytes32 userPublicValues,
        bytes calldata accumulator,
        bytes calldata proof
    ) external nonReentrant whenNotPaused {
        // Validate and settle in internal function to avoid stack too deep
        _validateAndSettle(tradeId, txIdHash, paymentTime, userPublicValues, accumulator, proof);
    }
    
    /**
     * @dev Internal function to validate proof and settle trade
     */
    function _validateAndSettle(
        bytes32 tradeId,
        bytes32 txIdHash,
        string calldata paymentTime,
        bytes32 userPublicValues,
        bytes calldata accumulator,
        bytes calldata proof
    ) internal {
        Trade storage trade = trades[tradeId];
        
        // Validate trade state
        if (trade.buyer == address(0)) revert TradeNotFound();
        if (trade.status != TradeStatus.PENDING) revert TradeNotPending();
        if (block.timestamp > trade.expiresAt) revert TradeExpiredError();
        
        // Anti-replay (txIdHash) and receipt validation (payment time) are now
        // handled by the verifier contract (e.g., AlipayVerifier).
        // This keeps the escrow focused on escrow logic only.
        
        // Mark as settled before external call (CEI pattern)
        trade.status = TradeStatus.SETTLED;
        
        // Verify proof, transfer tokens, and collect fee
        _verifyAndTransfer(tradeId, trade, txIdHash, paymentTime, userPublicValues, accumulator, proof);
        
        emit TradeSettled(tradeId, txIdHash);
    }
    
    /**
     * @dev Internal function to verify proof, transfer tokens, and collect fee
     */
    function _verifyAndTransfer(
        bytes32 tradeId,
        Trade storage trade,
        bytes32 txIdHash,
        string calldata paymentTime,
        bytes32 userPublicValues,
        bytes calldata accumulator,
        bytes calldata proof
    ) internal {
        Order storage order = orders[trade.orderId];
        
        // Get verifier for this rail
        ILyncZVerifier verifier = verifiers[order.rail];
        if (address(verifier) == address(0)) revert VerifierNotSet();
        
        // Verify proof using accountLinesHash from storage and txIdHash from caller
        bool valid = verifier.verifyPayment(
            userPublicValues,
            accumulator,
            proof,
            order.accountLinesHash,
            txIdHash,
            trade.fiatAmount,
            paymentTime
        );
        
        if (!valid) revert ProofVerificationFailed();
        
        // Transfer tokens to buyer (SafeERC20 handles non-standard tokens like USDT)
        IERC20(order.token).safeTransfer(trade.buyer, trade.tokenAmount);
        
        // Accumulate fee for this token (seller paid this from their order)
        uint256 feeAmount = tradeFees[tradeId];
        if (feeAmount > 0) {
            accumulatedFees[order.token] += feeAmount;
            emit FeesCollected(tradeId, order.token, feeAmount);
        }
    }
    
    // ============ Trade Management ============
    
    /**
     * @notice Cancel expired trade (anyone can call - DoS protection)
     * @dev Returns both token amount and fee to seller's order balance
     * @param tradeId Trade identifier
     */
    function cancelExpiredTrade(bytes32 tradeId) external nonReentrant {
        Trade storage trade = trades[tradeId];
        Order storage order = orders[trade.orderId];
        
        if (trade.buyer == address(0)) revert TradeNotFound();
        if (trade.status != TradeStatus.PENDING) revert TradeNotPending();
        if (block.timestamp <= trade.expiresAt) revert TradeNotExpired();
        
        trade.status = TradeStatus.EXPIRED;
        
        // Return both token amount and fee to seller's order
        uint256 feeAmount = tradeFees[tradeId];
        uint256 totalReturn = trade.tokenAmount + feeAmount;
        order.remainingAmount += totalReturn;
        
        // Clear the fee record
        delete tradeFees[tradeId];
        
        emit TradeExpired(tradeId, trade.orderId, totalReturn);
    }
    
    // ============ View Functions ============
    
    function getTrade(bytes32 tradeId) external view returns (Trade memory) {
        return trades[tradeId];
    }
    
    function isOrderFillable(bytes32 orderId) external view returns (bool) {
        return orders[orderId].remainingAmount > 0;
    }
    
    function getTradeStatus(bytes32 tradeId) external view returns (uint8) {
        return uint8(trades[tradeId].status);
    }
    
    /**
     * @notice Get fee amount for a trade
     * @param tradeId Trade identifier
     * @return Fee amount in tokens
     */
    function getTradeFee(bytes32 tradeId) external view returns (uint256) {
        return tradeFees[tradeId];
    }
    
    /**
     * @notice Calculate fee for a hypothetical trade
     * @dev Useful for frontend to show fee before trade creation
     * @param tokenAmount Amount of tokens buyer wants
     * @param fiatAmount Amount of fiat in cents (for volume-based tiers)
     * @param token Token address
     * @param buyer Buyer address (can be address(0) for preview)
     * @param isPublic Whether order is public (affects fee rate)
     * @return feeInTokens Fee in token units
     */
    function calculateFee(
        uint256 tokenAmount,
        uint256 fiatAmount,
        address token,
        address buyer,
        bool isPublic
    ) external view returns (uint256 feeInTokens) {
        if (address(feeCalculator) == address(0)) return 0;
        return feeCalculator.calculateFee(tokenAmount, fiatAmount, token, buyer, isPublic);
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Set verifier for a payment rail
     * @param rail Payment rail
     * @param verifier Verifier contract address
     */
    function setVerifier(PaymentRail rail, address verifier) external onlyOwner {
        address oldVerifier = address(verifiers[rail]);
        verifiers[rail] = ILyncZVerifier(verifier);
        emit VerifierUpdated(rail, oldVerifier, verifier);
    }
    
    /**
     * @notice Update fee calculator contract
     * @param _feeCalculator New fee calculator address
     */
    function setFeeCalculator(address _feeCalculator) external onlyOwner {
        require(_feeCalculator != address(0), "Fee calculator required");
        address oldCalculator = address(feeCalculator);
        feeCalculator = IFeeCalculator(_feeCalculator);
        emit FeeCalculatorUpdated(oldCalculator, _feeCalculator);
    }
    
    /**
     * @notice Update trading parameters
     * @param _minTradeValue New minimum trade value (0 = no change)
     * @param _maxTradeValue New maximum trade value (0 = no change)
     * @param _paymentWindow New payment window (0 = no change)
     */
    function updateConfig(
        uint256 _minTradeValue,
        uint256 _maxTradeValue,
        uint256 _paymentWindow
    ) external onlyOwner {
        if (_minTradeValue > 0) minTradeValue = _minTradeValue;
        if (_maxTradeValue > 0) maxTradeValue = _maxTradeValue;
        if (_paymentWindow > 0) paymentWindow = _paymentWindow;
    }
    
    /**
     * @notice Withdraw accumulated fees for a token
     * @dev Only owner can withdraw. Fees go to owner (relay wallet).
     * @param token Token address to withdraw fees for
     */
    function withdrawFees(address token) external onlyOwner nonReentrant {
        uint256 amount = accumulatedFees[token];
        if (amount == 0) revert NoFeesToWithdraw();
        
        accumulatedFees[token] = 0;
        
        IERC20(token).safeTransfer(owner(), amount);
        
        emit FeesWithdrawn(token, owner(), amount);
    }
    
    /**
     * @notice Withdraw accumulated fees for multiple tokens
     * @param tokens Array of token addresses
     */
    function withdrawFeesMultiple(address[] calldata tokens) external onlyOwner nonReentrant {
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            uint256 amount = accumulatedFees[token];
            if (amount > 0) {
                accumulatedFees[token] = 0;
                
                IERC20(token).safeTransfer(owner(), amount);
                
                emit FeesWithdrawn(token, owner(), amount);
            }
        }
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
}
