// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IFeeCalculator.sol";

/**
 * @title BaseFeeCalculator
 * @notice Flat-rate fee calculator for Base Mainnet (chain ID 8453)
 * @dev Fee is a fixed amount per trade, not percentage-based.
 *      Token addresses are hardcoded to Base Mainnet.
 *      
 *      Supported tokens: USDC, WETH, cbBTC
 *      
 *      Business Logic:
 *      - Public orders: configurable USDC flat fee (default 0.02 USDC)
 *      - Private orders: configurable USDC flat fee (default 0.01 USDC)
 */
contract BaseFeeCalculator is IFeeCalculator, Ownable {
    
    // ============ Storage Variables ============
    
    /// @notice Flat fee for PUBLIC orders in USDC units (6 decimals)
    /// @dev 0.02 USDC = 20000 (in 6 decimal units)
    uint256 public publicFeeUsdc;
    
    /// @notice Flat fee for PRIVATE orders in USDC units (6 decimals)
    /// @dev 0.01 USDC = 10000 (in 6 decimal units)
    uint256 public privateFeeUsdc;
    
    /// @notice ETH price in USDC (no oracle)
    /// @dev 1 ETH = 3000 USDC (default)
    uint256 public ethPriceUsdc;
    
    /// @notice BTC price in USDC (no oracle)
    /// @dev 1 BTC = 100000 USDC (default)
    uint256 public btcPriceUsdc;
    
    // ============ Constants ============
    
    /// @notice USDC decimals
    uint256 public constant USDC_DECIMALS = 6;
    
    /// @notice WETH decimals
    uint256 public constant WETH_DECIMALS = 18;
    
    /// @notice cbBTC decimals
    uint256 public constant CBBTC_DECIMALS = 8;
    
    // ============ Supported Token Addresses (Base Mainnet) ============
    
    /// @notice USDC token address on Base
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    
    /// @notice WETH token address on Base
    address public constant WETH = 0x4200000000000000000000000000000000000006;
    
    /// @notice cbBTC token address on Base
    address public constant CBBTC = 0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf;
    
    // ============ Events ============
    
    /// @notice Emitted when an unsupported token is encountered (fee returns 0)
    event UnsupportedToken(address token);
    
    /// @notice Emitted when public fee is updated
    event PublicFeeUpdated(uint256 oldFee, uint256 newFee);
    
    /// @notice Emitted when private fee is updated
    event PrivateFeeUpdated(uint256 oldFee, uint256 newFee);
    
    /// @notice Emitted when ETH price is updated
    event EthPriceUpdated(uint256 oldPrice, uint256 newPrice);
    
    /// @notice Emitted when BTC price is updated
    event BtcPriceUpdated(uint256 oldPrice, uint256 newPrice);
    
    // ============ Constructor ============
    
    /**
     * @notice Initialize the fee calculator with default values
     */
    constructor() Ownable(msg.sender) {
        publicFeeUsdc = 20000;    // 0.02 USDC
        privateFeeUsdc = 10000;   // 0.01 USDC
        ethPriceUsdc = 3000;      // 1 ETH = 3000 USDC
        btcPriceUsdc = 100000;    // 1 BTC = 100000 USDC
    }
    
    // ============ Fee Calculation ============
    
    /**
     * @notice Calculate flat fee for a trade
     * @param tokenAmount Amount of tokens being traded (unused in flat fee model)
     * @param fiatAmount Amount of fiat in cents (unused in flat fee model)
     * @param token Token address - used to determine fee in correct units
     * @param buyer Buyer address (unused in flat fee model)
     * @param isPublic Whether order is public or private
     * @return feeTokens Fee amount in token units
     */
    function calculateFee(
        uint256 tokenAmount,
        uint256 fiatAmount,
        address token,
        address buyer,
        bool isPublic
    ) external view override returns (uint256 feeTokens) {
        // Silence unused variable warnings
        tokenAmount; fiatAmount; buyer;
        
        // Determine base fee in USDC units (6 decimals)
        uint256 feeUsdc = isPublic ? publicFeeUsdc : privateFeeUsdc;
        
        // Convert USDC fee to token units based on token type
        if (token == USDC) {
            // USDC: fee is already in correct units (6 decimals)
            return feeUsdc;
        } else if (token == WETH) {
            // WETH: Convert USDC to ETH
            // feeUsdc is in 6 decimals, WETH is 18 decimals
            // fee_eth = fee_usdc / ethPriceUsdc
            // fee_wei = fee_usdc * 10^18 / (ethPriceUsdc * 10^6)
            // fee_wei = fee_usdc * 10^12 / ethPriceUsdc
            return (feeUsdc * 1e12) / ethPriceUsdc;
        } else if (token == CBBTC) {
            // cbBTC: Convert USDC to BTC
            // feeUsdc is in 6 decimals, cbBTC is 8 decimals
            // fee_btc = fee_usdc / btcPriceUsdc
            // fee_satoshi = fee_usdc * 10^8 / (btcPriceUsdc * 10^6)
            // fee_satoshi = fee_usdc * 10^2 / btcPriceUsdc
            return (feeUsdc * 100) / btcPriceUsdc;
        }
        
        // Unsupported token - return 0 fee (fail-safe)
        // In production, supported tokens should be validated before trade
        return 0;
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Update public order flat fee
     * @param newFee New fee in USDC units (6 decimals), e.g., 20000 = 0.02 USDC
     */
    function setPublicFee(uint256 newFee) external onlyOwner {
        uint256 oldFee = publicFeeUsdc;
        publicFeeUsdc = newFee;
        emit PublicFeeUpdated(oldFee, newFee);
    }
    
    /**
     * @notice Update private order flat fee
     * @param newFee New fee in USDC units (6 decimals), e.g., 10000 = 0.01 USDC
     */
    function setPrivateFee(uint256 newFee) external onlyOwner {
        uint256 oldFee = privateFeeUsdc;
        privateFeeUsdc = newFee;
        emit PrivateFeeUpdated(oldFee, newFee);
    }
    
    /**
     * @notice Update ETH price in USDC (for fee conversion)
     * @param newPrice New price, e.g., 3000 means 1 ETH = 3000 USDC
     */
    function setEthPrice(uint256 newPrice) external onlyOwner {
        require(newPrice > 0, "Price must be > 0");
        uint256 oldPrice = ethPriceUsdc;
        ethPriceUsdc = newPrice;
        emit EthPriceUpdated(oldPrice, newPrice);
    }
    
    /**
     * @notice Update BTC price in USDC (for fee conversion)
     * @param newPrice New price, e.g., 100000 means 1 BTC = 100000 USDC
     */
    function setBtcPrice(uint256 newPrice) external onlyOwner {
        require(newPrice > 0, "Price must be > 0");
        uint256 oldPrice = btcPriceUsdc;
        btcPriceUsdc = newPrice;
        emit BtcPriceUpdated(oldPrice, newPrice);
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get public order flat fee in USDC units
     * @return Flat fee in USDC (6 decimals) - e.g., 20000 = 0.02 USDC
     * @dev Note: This returns USDC units, not basis points like before
     */
    function getFeeRate() external view override returns (uint256) {
        return publicFeeUsdc;
    }
    
    /**
     * @notice Get private order flat fee in USDC units
     * @return Flat fee in USDC (6 decimals) - e.g., 10000 = 0.01 USDC
     * @dev Note: This returns USDC units, not basis points like before
     */
    function getPrivateFeeRate() external view override returns (uint256) {
        return privateFeeUsdc;
    }
    
    /**
     * @notice Get flat fee for a specific token (public orders)
     * @param token Token address
     * @return Fee amount in token units
     */
    function getPublicFee(address token) external view returns (uint256) {
        return this.calculateFee(0, 0, token, address(0), true);
    }
    
    /**
     * @notice Get flat fee for a specific token (private orders)
     * @param token Token address
     * @return Fee amount in token units
     */
    function getPrivateFee(address token) external view returns (uint256) {
        return this.calculateFee(0, 0, token, address(0), false);
    }
    
    /**
     * @notice Check if a token is supported for fee calculation
     * @param token Token address to check
     * @return True if token is supported
     */
    function isTokenSupported(address token) external pure returns (bool) {
        return token == USDC || token == WETH || token == CBBTC;
    }
    
    /**
     * @notice Get USDC price for a token
     * @param token Token address
     * @return Price in USDC (e.g., 3000 for WETH means 1 WETH = 3000 USDC)
     */
    function getTokenPriceUsdc(address token) external view returns (uint256) {
        if (token == USDC) return 1;
        if (token == WETH) return ethPriceUsdc;
        if (token == CBBTC) return btcPriceUsdc;
        return 0;
    }
}
