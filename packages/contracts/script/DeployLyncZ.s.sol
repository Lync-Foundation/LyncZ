// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/LyncZEscrow.sol";
import "../src/fee-calculator/BaseFeeCalculator.sol";
import "../src/verifiers/AlipayVerifier.sol";
import "../src/mocks/MockUSDC.sol";
import "../src/mocks/MockUSDT.sol";

/**
 * @title DeployLyncZ
 * @notice Deployment script for LyncZ multi-rail escrow system
 * @dev Uses existing Halo2 verifier, deploys: AlipayVerifier → LyncZEscrow
 * 
 * Usage:
 *   forge script script/DeployLyncZ.s.sol:DeployLyncZ --rpc-url $RPC_URL --broadcast
 * 
 * Required environment variables:
 *   DEPLOYER_PRIVATE_KEY    - Private key of the deployer wallet
 *   
 * Optional environment variables:
 *   HALO2_VERIFIER          - Existing Halo2 verifier (default: Base Sepolia deployed)
 *   ALIPAY_PUBLIC_KEY_HASH  - Alipay public key DER hash
 *   APP_EXE_COMMIT          - OpenVM app executable commitment
 *   APP_VM_COMMIT           - OpenVM app VM commitment
 *   MIN_TRADE_VALUE         - Minimum trade value in fiat cents (default: 70000 = 700 CNY)
 *   MAX_TRADE_VALUE         - Maximum trade value in fiat cents (default: 7200000 = 72,000 CNY)
 *   PAYMENT_WINDOW          - Payment window in seconds (default: 900 = 15 min)
 *   (Fees are hardcoded in BaseFeeCalculator: 0.02 USDC public, 0.01 USDC private)
 *   DEPLOY_MOCKS            - "true" to deploy new mock tokens, "false" to use existing
 */
contract DeployLyncZ is Script {
    
    // ============ OpenVM Halo2 Verifiers (per chain) ============
    // CRITICAL: Use the correct verifier for the target chain!
    address constant HALO2_VERIFIER_BASE_MAINNET = 0x0db61FC765A794eD9Fab44b03f57d77dB03e96aB;
    address constant HALO2_VERIFIER_BASE_SEPOLIA = 0xE1859d7071eD3CE7F1AB592c76c3A6D342140A87;
    
    // Mock tokens (Base Sepolia only - not used on mainnet)
    address constant EXISTING_MOCK_USDC = 0xd4B280FFB336e2061cB39347Bd599cB88FF1617A;
    address constant EXISTING_MOCK_USDT = 0x9C607084a30b3E5f222b8f92313c3f75fA12667F;
    address constant EXISTING_MOCK_SOL  = 0x9913854799d1BB4E049CDE227156508bB3bA1AbF;
    address constant EXISTING_MOCK_BTC  = 0x819509cF2A5CD7849399C9A137547731686914ae;
    address constant EXISTING_MOCK_ETH  = 0x9e0cdc73bEE1C6b8D99857fFA18b7C02D8ba162F;
    
    // ============ Default ZK Config (from Axiom) ============
    // Alipay public key hash - NOTE: Alipay rotates certs, may need updating
    bytes32 constant DEFAULT_ALIPAY_PK_HASH = 0x54a056fd6c5f5585cff0fe85ffbe1c17b5217f26360728e1bc3f452383dbda12;
    // v2 circuit: split hashes (account_lines_hash, tx_id_hash, time_amount_hash)
    // Axiom Program: prg_01kg0vdj4w3t147fqft3g32zr5 (lyncz-alipay-v2 / Alipay Verifier V2)
    bytes32 constant DEFAULT_APP_EXE_COMMIT = 0x00076a7c2f45e3e02d9ba36234947801c92d53ebc01fabec11770cfe7c9b466f;
    bytes32 constant DEFAULT_APP_VM_COMMIT = 0x0053b850b281802e42a58b63fe114a0797f8092777f9bbf01df5800fba3c761c;
    
    function run() external {
        // Read required environment variables
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        // Determine Halo2 verifier based on chain ID (can be overridden via env var)
        address defaultHalo2Verifier = block.chainid == 8453 
            ? HALO2_VERIFIER_BASE_MAINNET 
            : HALO2_VERIFIER_BASE_SEPOLIA;
        address halo2Verifier = vm.envOr("HALO2_VERIFIER", defaultHalo2Verifier);
        
        // Read optional environment variables with defaults
        bytes32 alipayPublicKeyHash = vm.envOr("ALIPAY_PUBLIC_KEY_HASH", DEFAULT_ALIPAY_PK_HASH);
        bytes32 appExeCommit = vm.envOr("APP_EXE_COMMIT", DEFAULT_APP_EXE_COMMIT);
        bytes32 appVmCommit = vm.envOr("APP_VM_COMMIT", DEFAULT_APP_VM_COMMIT);
        uint256 minTradeValue = vm.envOr("MIN_TRADE_VALUE", uint256(70000));     // 700 CNY (~$100)
        uint256 maxTradeValue = vm.envOr("MAX_TRADE_VALUE", uint256(7200000));   // 72,000 CNY (~$10k)
        uint256 paymentWindow = vm.envOr("PAYMENT_WINDOW", uint256(900));        // 15 minutes
        // Fee rates are now hardcoded in BaseFeeCalculator (flat rate model)
        // Public: 0.02 USDC, Private: 0.01 USDC
        bool deployMocks = vm.envOr("DEPLOY_MOCKS", false);  // Default: use existing
        
        console.log("");
        console.log("========================================");
        console.log("       LyncZ Deployment Script          ");
        console.log("========================================");
        console.log("");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", deployer);
        console.log("Balance:", deployer.balance / 1e18, "ETH");
        console.log("");
        console.log("Halo2 Verifier:", halo2Verifier);
        console.log("  (Mainnet: 0x0db6..., Sepolia: 0xE185...)");
        console.log("");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // ============ Mock Tokens ============
        address mockUsdc;
        address mockUsdt;
        
        if (deployMocks) {
            console.log("--- Deploying NEW Mock Tokens ---");
            
            MockUSDC usdc = new MockUSDC();
            mockUsdc = address(usdc);
            usdc.mint(deployer, 1_000_000 * 1e6); // 1M USDC
            console.log("MockUSDC:", mockUsdc);
            
            MockUSDT usdt = new MockUSDT();
            mockUsdt = address(usdt);
            usdt.mint(deployer, 1_000_000 * 1e6); // 1M USDT
            console.log("MockUSDT:", mockUsdt);
        } else {
            console.log("--- Using EXISTING Mock Tokens ---");
            mockUsdc = EXISTING_MOCK_USDC;
            mockUsdt = EXISTING_MOCK_USDT;
            console.log("MockUSDC:", mockUsdc);
            console.log("MockUSDT:", mockUsdt);
        }
        console.log("");
        
        // ============ Halo2 Verifier (Already Deployed) ============
        console.log("--- Using EXISTING Halo2 Verifier ---");
        console.log("OpenVmHalo2Verifier:", halo2Verifier);
        console.log("");
        
        // ============ Deploy Alipay Verifier ============
        console.log("--- Deploying AlipayVerifier ---");
        AlipayVerifier alipayVerifier = new AlipayVerifier(
            halo2Verifier,
            appExeCommit,
            appVmCommit,
            alipayPublicKeyHash
        );
        console.log("AlipayVerifier:", address(alipayVerifier));
        console.log("");
        
        // ============ Deploy Fee Calculator ============
        console.log("--- Deploying BaseFeeCalculator ---");
        BaseFeeCalculator feeCalculator = new BaseFeeCalculator();
        console.log("BaseFeeCalculator:", address(feeCalculator));
        console.log("Public flat fee: 0.02 USDC");
        console.log("Private flat fee: 0.01 USDC");
        console.log("");
        
        // ============ Deploy LyncZ Escrow ============
        console.log("--- Deploying LyncZEscrow ---");
        LyncZEscrow escrow = new LyncZEscrow(
            minTradeValue,
            maxTradeValue,
            paymentWindow,
            address(feeCalculator)
        );
        console.log("LyncZEscrow:", address(escrow));
        console.log("");
        
        // ============ Configure Escrow ============
        console.log("--- Configuring Escrow ---");
        escrow.setVerifier(LyncZEscrow.PaymentRail.ALIPAY, address(alipayVerifier));
        console.log("Set ALIPAY verifier");
        console.log("");
        
        vm.stopBroadcast();
        
        // ============ Deployment Summary ============
        console.log("========================================");
        console.log("         DEPLOYMENT COMPLETE            ");
        console.log("========================================");
        console.log("");
        console.log("Contract Addresses:");
        console.log("-------------------");
        console.log("MockUSDC:            ", mockUsdc);
        console.log("MockUSDT:            ", mockUsdt);
        console.log("OpenVmHalo2Verifier: ", halo2Verifier);
        console.log("AlipayVerifier:      ", address(alipayVerifier));
        console.log("LyncZEscrow:         ", address(escrow));
        console.log("");
        console.log("Configuration:");
        console.log("--------------");
        console.log("Min Trade Value:     ", minTradeValue, "cents");
        console.log("Max Trade Value:     ", maxTradeValue, "cents");
        console.log("Payment Window:      ", paymentWindow, "seconds");
        console.log("Fee Model:            Flat rate (0.02 USDC public, 0.01 USDC private)");
        console.log("Owner:               ", escrow.owner());
        console.log("");
        console.log("Next Steps:");
        console.log("-----------");
        console.log("1. Save addresses to Local/contracts/base-sepolia.json");
        console.log("2. Update frontend with new contract addresses");
        console.log("3. Update orderbook backend with new ABI");
        console.log("4. Verify contracts on BaseScan");
        console.log("");
    }
}
