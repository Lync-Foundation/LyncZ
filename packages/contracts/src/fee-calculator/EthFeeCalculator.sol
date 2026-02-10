// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IFeeCalculator.sol";

/**
 * @title EthFeeCalculator
 * @notice Flat-rate fee calculator for Ethereum Mainnet (chain ID 1)
 * @dev Fee is a fixed amount per trade, not percentage-based.
 *      Token addresses are hardcoded to Ethereum Mainnet.
 *      
 *      Supported tokens: USDC, USDT, WETH, WBTC
 *      
 *      Business Logic:
 *      - Public orders: configurable USDC flat fee (default 0.20 USDC)
 *      - Private orders: configurable USDC flat fee (default 0.40 USDC)
 *      
 *      Token conversion uses configurable USDC prices:
 *      - USDC/USDT: 1:1 with USDC (both 6 decimals)
 *      - WETH: configurable (default 1 ETH = 3,000 USDC)
 *      - WBTC: configurable (default 1 BTC = 100,000 USDC)
 */
contract EthFeeCalculator is IFeeCalculator, Ownable {
    
    // ============ Storage Variables ============
    
    /// @notice Flat fee for PUBLIC orders in USDC units (6 decimals)
    /// @dev 0.20 USDC = 200000 (in 6 decimal units)
    uint256 public publicFeeUsdc;
    
    /// @notice Flat fee for PRIVATE orders in USDC units (6 decimals)
    /// @dev 0.40 USDC = 400000 (in 6 decimal units)
    uint256 public privateFeeUsdc;
    
    /// @notice ETH price in USDC (no oracle)
    /// @dev 1 ETH = 3000 USDC (default)
    uint256 public ethPriceUsdc;
    
    /// @notice BTC price in USDC (no oracle)
    /// @dev 1 BTC = 100000 USDC (default)
    uint256 public btcPriceUsdc;
    
    // ============ Constants ============
    
    /// @notice USDC/USDT decimals
    uint256 public constant STABLECOIN_DECIMALS = 6;
    
    /// @notice WETH decimals
    uint256 public constant WETH_DECIMALS = 18;
    
    /// @notice WBTC decimals
    uint256 public constant WBTC_DECIMALS = 8;
    
    // ============ Supported Token Addresses (Ethereum Mainnet) ============
    
    /// @notice USDC token address on Ethereum
    address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    
    /// @notice USDT token address on Ethereum
    address public constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
    
    /// @notice WETH token address on Ethereum
    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    
    /// @notice WBTC token address on Ethereum
    address public constant WBTC = 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599;
    
    // ============ Events ============
    
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
     * @notice Initialize with ETH mainnet defaults
     */
    constructor() Ownable(msg.sender) {
        publicFeeUsdc = 200000;   // 0.20 USDC
        privateFeeUsdc = 400000;  // 0.40 USDC
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
        if (token == USDC || token == USDT) {
            // USDC/USDT: fee is already in correct units (6 decimals)
            return feeUsdc;
        } else if (token == WETH) {
            // WETH: Convert USDC to ETH
            // fee_wei = fee_usdc * 10^12 / ethPriceUsdc
            return (feeUsdc * 1e12) / ethPriceUsdc;
        } else if (token == WBTC) {
            // WBTC: Convert USDC to BTC
            // fee_satoshi = fee_usdc * 10^2 / btcPriceUsdc
            return (feeUsdc * 100) / btcPriceUsdc;
        }
        
        // Unsupported token - return 0 fee (fail-safe)
        return 0;
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Update public order flat fee
     * @param newFee New fee in USDC units (6 decimals), e.g., 200000 = 0.20 USDC
     */
    function setPublicFee(uint256 newFee) external onlyOwner {
        uint256 oldFee = publicFeeUsdc;
        publicFeeUsdc = newFee;
        emit PublicFeeUpdated(oldFee, newFee);
    }
    
    /**
     * @notice Update private order flat fee
     * @param newFee New fee in USDC units (6 decimals), e.g., 400000 = 0.40 USDC
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
     * @return Flat fee in USDC (6 decimals)
     */
    function getFeeRate() external view override returns (uint256) {
        return publicFeeUsdc;
    }
    
    /**
     * @notice Get private order flat fee in USDC units
     * @return Flat fee in USDC (6 decimals)
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
        return token == USDC || token == USDT || token == WETH || token == WBTC;
    }
    
    /**
     * @notice Get USDC price for a token
     * @param token Token address
     * @return Price in USDC (e.g., 3000 for WETH means 1 WETH = 3000 USDC)
     */
    function getTokenPriceUsdc(address token) external view returns (uint256) {
        if (token == USDC || token == USDT) return 1;
        if (token == WETH) return ethPriceUsdc;
        if (token == WBTC) return btcPriceUsdc;
        return 0;
    }
}
