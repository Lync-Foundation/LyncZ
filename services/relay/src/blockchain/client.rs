//! Ethereum blockchain client for LyncZ escrow interactions
//! 
//! Simplified client - only handles:
//! - submit_proof(): Relayer submits ZK proof to settle trades (pays gas)
//! - Read-only queries for validation

use ethers::prelude::*;
use ethers::providers::{Http, Provider};
use ethers::signers::{LocalWallet, Signer};
use std::sync::Arc;
use thiserror::Error;

use super::{LyncZEscrow, AlipayVerifier, SimpleFeeCalculator};
use super::types::ContractConfig;

#[derive(Error, Debug)]
pub enum EthereumClientError {
    #[error("Contract error: {0}")]
    ContractError(String),
    #[error("Provider error: {0}")]
    ProviderError(String),
    #[error("Wallet error: {0}")]
    WalletError(String),
    #[error("Transaction failed: {0}")]
    TransactionFailed(String),
}

pub struct EthereumClient {
    provider: Arc<Provider<Http>>,
    wallet: LocalWallet,
    escrow_contract: LyncZEscrow<SignerMiddleware<Provider<Http>, LocalWallet>>,
    chain_id: u64,
}

// Gas price caps per chain type
// Using fixed legacy gas prices for predictable costs.
//
// Base L2: Very stable ~0.01-0.03 gwei
const BASE_L2_GAS_PRICE_WEI: u64 = 30_000_000; // 0.03 gwei
//
// Ethereum L1: Currently ~0.065 gwei (Jan 2026), can spike during congestion
// Cap at 0.1 gwei - moderate headroom above current 0.065 gwei base fee
// If gas exceeds this cap, transactions will wait until fees drop
const ETH_L1_GAS_PRICE_WEI: u64 = 100_000_000; // 0.1 gwei

impl EthereumClient {
    pub async fn new(
        rpc_url: &str,
        private_key: &str,
        escrow_address: Address,
        chain_id: u64,
    ) -> Result<Self, EthereumClientError> {
        // Create provider
        let provider = Provider::<Http>::try_from(rpc_url)
            .map_err(|e| EthereumClientError::ProviderError(e.to_string()))?;

        // Create wallet
        let wallet: LocalWallet = private_key
            .parse()
            .map_err(|e| EthereumClientError::WalletError(format!("Invalid private key: {}", e)))?;
        let wallet = wallet.with_chain_id(chain_id);

        // Create signer middleware
        let client = SignerMiddleware::new(provider.clone(), wallet.clone());
        let client = Arc::new(client);

        // Create contract instance
        let escrow_contract = LyncZEscrow::new(escrow_address, client.clone());

        Ok(Self {
            provider: Arc::new(provider),
            wallet,
            escrow_contract,
            chain_id,
        })
    }

    /// Get the gas price cap for this chain (in Wei)
    /// All chains use capped legacy gas prices for predictable relay costs.
    fn gas_price_cap(&self) -> u64 {
        match self.chain_id {
            // Base L2: very low gas, 0.03 gwei cap
            8453 | 84531 | 84532 => BASE_L2_GAS_PRICE_WEI,
            // Ethereum L1: moderate gas, 0.5 gwei cap
            1 | 5 | 11155111 => ETH_L1_GAS_PRICE_WEI,
            // Unknown chains: use ETH L1 cap as safe default
            _ => ETH_L1_GAS_PRICE_WEI,
        }
    }
    
    // ============ Core Function: Submit Proof ============

    /// Submit proof to settle a trade
    /// The relayer pays for gas so users don't need ETH
    /// 
    /// Signature: submitProof(tradeId, txIdHash, paymentTime, userPublicValues, accumulator, proof)
    /// 
    /// Privacy: txIdHash is SHA256(25 || transactionId) - the plain text transaction ID
    /// never appears on-chain, only its hash is used for anti-replay.
    pub async fn submit_proof(
        &self,
        trade_id: [u8; 32],
        tx_id_hash: [u8; 32],  // v4: Hash instead of plain text
        payment_time: String,
        user_public_values: [u8; 32],
        accumulator: Vec<u8>,
        proof: Vec<u8>,
    ) -> Result<H256, EthereumClientError> {
        tracing::info!(
            "Calling submitProof: trade_id={}, tx_id_hash={}, payment_time={}, user_public_values={}",
            hex::encode(trade_id),
            hex::encode(tx_id_hash),
            payment_time,
            hex::encode(user_public_values),
        );

        let accumulator_bytes = Bytes::from(accumulator);
        let proof_bytes = Bytes::from(proof);
        
        let mut call = self.escrow_contract.submit_proof(
            trade_id,
            tx_id_hash,
            payment_time,
            user_public_values,
            accumulator_bytes,
            proof_bytes,
        );

        // Estimate gas and configure transaction
        let gas_estimate = call
            .estimate_gas()
            .await
            .map_err(|e| {
                EthereumClientError::ContractError(format!("Gas estimation failed: {}", e))
            })?;
        
        call = call
            .gas(gas_estimate * 120 / 100) // 20% buffer
            .legacy()
            .gas_price(U256::from(self.gas_price_cap()));
        
        let tx = call
            .send()
            .await
            .map_err(|e| {
                EthereumClientError::TransactionFailed(format!("submitProof failed: {}", e))
            })?;

        let tx_hash = tx.tx_hash();
        tracing::info!("submitProof tx sent on chain {}: {:#x}", self.chain_id, tx_hash);

        // Wait for confirmation
        let receipt = tx
            .await
            .map_err(|e| {
                EthereumClientError::TransactionFailed(format!("Transaction receipt error: {}", e))
            })?
            .ok_or_else(|| {
                EthereumClientError::TransactionFailed("No receipt returned".to_string())
            })?;

        if receipt.status != Some(U64::from(1)) {
            return Err(EthereumClientError::TransactionFailed(
                "Transaction reverted".to_string(),
            ));
        }

        tracing::info!("✅ submitProof confirmed: {:#x}", tx_hash);

        Ok(tx_hash)
    }

    // ============ Read-Only Queries ============

    pub fn relayer_address(&self) -> Address {
        self.wallet.address()
    }

    pub fn chain_id(&self) -> u64 {
        self.chain_id
    }

    /// Get current block number
    pub async fn get_block_number(&self) -> Result<u64, EthereumClientError> {
        let block_number = self
            .provider
            .get_block_number()
            .await
            .map_err(|e| EthereumClientError::ProviderError(e.to_string()))?;
        Ok(block_number.as_u64())
    }

    /// Get payment window from contract
    pub async fn get_payment_window(&self) -> Result<U256, EthereumClientError> {
        self.escrow_contract
            .payment_window()
            .call()
            .await
            .map_err(|e| EthereumClientError::ContractError(e.to_string()))
    }

    /// Check if order exists on blockchain
    pub async fn order_exists(&self, order_id: [u8; 32]) -> Result<bool, EthereumClientError> {
        let order = self
            .escrow_contract
            .orders(order_id)
            .call()
            .await
            .map_err(|e| EthereumClientError::ContractError(e.to_string()))?;
        
        // Check if the order has a non-zero remaining amount
        Ok(order.4 > U256::zero()) // order.4 is remainingAmount
    }

    /// Get order's accountLinesHash from blockchain
    /// Used to verify that submitted payment info matches on-chain hash
    pub async fn get_order_hash(&self, order_id: &str) -> Result<[u8; 32], EthereumClientError> {
        use crate::blockchain::types::order_id_to_bytes32;
        
        let order_id_bytes = order_id_to_bytes32(order_id)
            .map_err(|e| EthereumClientError::ContractError(format!("Invalid order ID: {}", e)))?;
        
        let order = self
            .escrow_contract
            .orders(order_id_bytes)
            .call()
            .await
            .map_err(|e| EthereumClientError::ContractError(e.to_string()))?;
        
        // The Order struct (v4):
        // bytes32 orderId (0), address seller (1), address token (2), uint256 totalAmount (3),
        // uint256 remainingAmount (4), uint256 exchangeRate (5), PaymentRail rail (6),
        // bytes32 accountLinesHash (7), bool isPublic (8), uint256 createdAt (9), uint8 tokenDecimals (10)
        // order.7 is accountLinesHash
        Ok(order.7)
    }

    /// Check if trade exists on blockchain
    pub async fn trade_exists(&self, trade_id: [u8; 32]) -> Result<bool, EthereumClientError> {
        let trade = self
            .escrow_contract
            .trades(trade_id)
            .call()
            .await
            .map_err(|e| EthereumClientError::ContractError(e.to_string()))?;
        
        // Check if the trade has a non-zero token amount
        Ok(trade.3 > U256::zero()) // trade.3 is tokenAmount
    }

    /// Get the Alipay verifier address from the escrow contract
    /// PaymentRail::ALIPAY = 0
    pub async fn get_alipay_verifier_address(&self) -> Result<Address, EthereumClientError> {
        // verifiers(PaymentRail rail) returns (ILyncZVerifier)
        // PaymentRail.ALIPAY = 0
        let verifier_address = self
            .escrow_contract
            .verifiers(0) // 0 = ALIPAY
            .call()
            .await
            .map_err(|e| EthereumClientError::ContractError(format!("Failed to get verifier: {}", e)))?;
        
        Ok(verifier_address)
    }

    /// Get the Alipay public key hash from the AlipayVerifier contract
    /// This hash is used to verify PDF signatures
    pub async fn get_alipay_public_key_hash(&self) -> Result<[u8; 32], EthereumClientError> {
        // First get the verifier address
        let verifier_address = self.get_alipay_verifier_address().await?;
        
        if verifier_address == Address::zero() {
            return Err(EthereumClientError::ContractError(
                "AlipayVerifier not set in escrow contract".to_string()
            ));
        }
        
        // Create AlipayVerifier contract instance
        let alipay_verifier = AlipayVerifier::new(
            verifier_address,
            Arc::new(self.provider.clone()),
        );
        
        // Call alipayPublicKeyHash()
        let hash = alipay_verifier
            .alipay_public_key_hash()
            .call()
            .await
            .map_err(|e| EthereumClientError::ContractError(format!("Failed to get public key hash: {}", e)))?;
        
        Ok(hash)
    }

    /// Get fee rate from the external fee calculator contract
    pub async fn get_fee_rate(&self) -> Result<U256, EthereumClientError> {
        // Get fee calculator address from escrow
        let fee_calculator_address = self.escrow_contract
            .fee_calculator()
            .call()
            .await
            .map_err(|e| EthereumClientError::ContractError(format!("Failed to get feeCalculator: {}", e)))?;
        
        if fee_calculator_address == Address::zero() {
            return Err(EthereumClientError::ContractError(
                "FeeCalculator not set in escrow contract".to_string()
            ));
        }
        
        // Create SimpleFeeCalculator contract instance
        let fee_calculator = SimpleFeeCalculator::new(
            fee_calculator_address,
            Arc::new(self.provider.clone()),
        );
        
        // Call getFeeRate() for public orders (default)
        let fee_rate = fee_calculator
            .get_fee_rate()
            .call()
            .await
            .map_err(|e| EthereumClientError::ContractError(format!("Failed to get fee rate: {}", e)))?;
        
        Ok(fee_rate)
    }

    // ============ Contract Configuration ============

    /// Get contract configuration values
    pub async fn get_contract_config(&self) -> Result<ContractConfig, EthereumClientError> {
        let min_trade_value = self.escrow_contract
            .min_trade_value()
            .call()
            .await
            .map_err(|e| EthereumClientError::ContractError(format!("Failed to get minTradeValue: {}", e)))?;

        let max_trade_value = self.escrow_contract
            .max_trade_value()
            .call()
            .await
            .map_err(|e| EthereumClientError::ContractError(format!("Failed to get maxTradeValue: {}", e)))?;

        let payment_window = self.escrow_contract
            .payment_window()
            .call()
            .await
            .map_err(|e| EthereumClientError::ContractError(format!("Failed to get paymentWindow: {}", e)))?;

        let paused = self.escrow_contract
            .paused()
            .call()
            .await
            .map_err(|e| EthereumClientError::ContractError(format!("Failed to get paused: {}", e)))?;

        // Get fee rate (in basis points) - via external fee calculator
        let fee_rate = self.get_fee_rate().await.unwrap_or(U256::from(100)); // Default 1%

        // Get accumulated fees for USDC
        // Token addresses (Base Mainnet)
        let usdc_address: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".parse().unwrap();
        let weth_address: Address = "0x4200000000000000000000000000000000000006".parse().unwrap();
        let cbbtc_address: Address = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf".parse().unwrap();
        
        // Get accumulated fees for all tokens
        let accumulated_usdc = self.escrow_contract
            .accumulated_fees(usdc_address)
            .call()
            .await
            .unwrap_or_default();
        let accumulated_weth = self.escrow_contract
            .accumulated_fees(weth_address)
            .call()
            .await
            .unwrap_or_default();
        let accumulated_cbbtc = self.escrow_contract
            .accumulated_fees(cbbtc_address)
            .call()
            .await
            .unwrap_or_default();

        // Get verifier address
        let verifier_address = self.get_alipay_verifier_address().await.unwrap_or(Address::zero());
        
        // Get public key hash (may fail if verifier not set)
        let public_key_hash = self.get_alipay_public_key_hash().await.unwrap_or([0u8; 32]);
        
        // Get app commitments from AlipayVerifier
        let (app_exe_commit, app_vm_commit) = if verifier_address != Address::zero() {
            let alipay_verifier = AlipayVerifier::new(
                verifier_address,
                Arc::new(self.provider.clone()),
            );
            
            let exe_commit = alipay_verifier
                .app_exe_commit()
                .call()
                .await
                .unwrap_or([0u8; 32]);
            
            let vm_commit = alipay_verifier
                .app_vm_commit()
                .call()
                .await
                .unwrap_or([0u8; 32]);
            
            (exe_commit, vm_commit)
        } else {
            ([0u8; 32], [0u8; 32])
        };

        // Get fee calculator config
        let fee_calculator_address = self.escrow_contract
            .fee_calculator()
            .call()
            .await
            .unwrap_or(Address::zero());
        
        let (public_fee, private_fee, eth_price, btc_price) = if fee_calculator_address != Address::zero() {
            let fee_calc = SimpleFeeCalculator::new(
                fee_calculator_address,
                Arc::new(self.provider.clone()),
            );
            
            let pub_fee = fee_calc.public_fee_usdc().call().await.unwrap_or(U256::from(20000));
            let priv_fee = fee_calc.private_fee_usdc().call().await.unwrap_or(U256::from(10000));
            let eth_p = fee_calc.eth_price_usdc().call().await.unwrap_or(U256::from(3000));
            let btc_p = fee_calc.btc_price_usdc().call().await.unwrap_or(U256::from(100000));
            
            (pub_fee, priv_fee, eth_p, btc_p)
        } else {
            (U256::from(20000), U256::from(10000), U256::from(3000), U256::from(100000))
        };

        Ok(ContractConfig {
            min_trade_value_cny: min_trade_value.to_string(),
            max_trade_value_cny: max_trade_value.to_string(),
            payment_window: payment_window.to_string(),
            fee_rate_bps: fee_rate.to_string(),
            accumulated_fees_usdc: accumulated_usdc.to_string(),
            accumulated_fees_weth: accumulated_weth.to_string(),
            accumulated_fees_cbbtc: accumulated_cbbtc.to_string(),
            paused,
            zk_verifier: format!("{:#x}", verifier_address),
            public_key_der_hash: format!("0x{}", hex::encode(public_key_hash)),
            app_exe_commit: format!("0x{}", hex::encode(app_exe_commit)),
            app_vm_commit: format!("0x{}", hex::encode(app_vm_commit)),
            public_fee_usdc: public_fee.to_string(),
            private_fee_usdc: private_fee.to_string(),
            eth_price_usdc: eth_price.to_string(),
            btc_price_usdc: btc_price.to_string(),
            fee_calculator_address: format!("{:#x}", fee_calculator_address),
        })
    }

    // ============ Admin Write Functions REMOVED for Security ============
    // Most contract modifications must be done directly via cast/forge with the owner wallet.
    // This prevents public API exploitation.
    //
    // To modify contract config manually, use cast:
    // cast send --rpc-url $RPC --private-key $OWNER_KEY $CONTRACT "setMinTradeValue(uint256)" 10000
    // cast send --rpc-url $RPC --private-key $OWNER_KEY $FEE_CALC "setPublicFee(uint256)" 20000
    // cast send --rpc-url $RPC --private-key $OWNER_KEY $CONTRACT "withdrawFees(address)" $TOKEN
    //
    // Removed methods (no API exposure):
    // - update_public_fee, update_private_fee, update_eth_price, update_btc_price
    // - update_config, withdraw_fees
    // ============================================================

    // Note: get_fee_rate is kept as it's read-only

    // ============ Internal Admin Functions (NOT exposed via API) ============
    
    /// Update the Alipay public key hash in the verifier contract
    /// NOTE: This is used internally for optimistic key rotation during settlement.
    /// It is NOT exposed via any public API endpoint.
    pub async fn update_public_key_hash(&self, new_hash: [u8; 32]) -> Result<H256, EthereumClientError> {
        // Get the verifier address
        let verifier_address = self.get_alipay_verifier_address().await?;
        
        if verifier_address == Address::zero() {
            return Err(EthereumClientError::ContractError(
                "AlipayVerifier not set in escrow contract".to_string()
            ));
        }
        
        // Create AlipayVerifier contract instance with signer
        let wallet = self.wallet.clone().with_chain_id(self.chain_id);
        let provider = Provider::<Http>::try_from(
            self.provider.url().to_string()
        ).map_err(|e| EthereumClientError::ProviderError(e.to_string()))?;
        let client = SignerMiddleware::new(provider, wallet);
        let client = Arc::new(client);
        
        let alipay_verifier = AlipayVerifier::new(verifier_address, client);
        
        // Create the call builder
        let call = alipay_verifier.update_public_key_hash(new_hash);
        
        // Estimate gas
        let gas_estimate = call.estimate_gas().await
            .map_err(|e| EthereumClientError::ContractError(format!("Gas estimation failed: {}", e)))?;
        
        // Send with gas buffer and per-chain gas cap
        let mut call = call.gas(gas_estimate * 120 / 100);
        call = call.legacy().gas_price(U256::from(self.gas_price_cap()));
        let tx = call.send().await
            .map_err(|e| EthereumClientError::TransactionFailed(format!("Failed to update public key hash: {}", e)))?;

        let tx_hash = tx.tx_hash();
        tracing::info!("updatePublicKeyHash tx sent: {:#x}", tx_hash);

        // Wait for confirmation
        tx.await.map_err(|e| {
            EthereumClientError::TransactionFailed(format!("Transaction receipt error: {}", e))
        })?;

        Ok(tx_hash)
    }

    // ============ Trade Management ============

    /// Fill a sell order on behalf of a buyer
    /// The relayer pays for gas so users don't need ETH
    /// 
    /// Signature: fillOrder(orderId, buyer, fiatAmount) returns (bytes32 tradeId)
    /// Note: fiatAmount is in cents and must be divisible by 100 (whole yuan only)
    pub async fn fill_order(
        &self,
        order_id: [u8; 32],
        buyer_address: Address,
        fiat_amount: U256,
    ) -> Result<(H256, [u8; 32]), EthereumClientError> {
        tracing::info!(
            "Calling fillOrder: order_id={}, buyer={:#x}, fiat_amount={}",
            hex::encode(order_id),
            buyer_address,
            fiat_amount,
        );

        let mut call = self.escrow_contract.fill_order(order_id, buyer_address, fiat_amount);

        // Estimate gas and configure transaction
        let gas_estimate = call
            .estimate_gas()
            .await
            .map_err(|e| {
                EthereumClientError::ContractError(format!("Gas estimation failed: {}", e))
            })?;
        
        call = call
            .gas(gas_estimate * 120 / 100) // 20% buffer
            .legacy()
            .gas_price(U256::from(self.gas_price_cap()));
        
        let tx = call
            .send()
            .await
            .map_err(|e| {
                EthereumClientError::TransactionFailed(format!("fillOrder failed: {}", e))
            })?;

        let tx_hash = tx.tx_hash();
        tracing::info!("fillOrder tx sent: {:#x}", tx_hash);

        // Wait for confirmation
        let receipt = tx
            .await
            .map_err(|e| {
                EthereumClientError::TransactionFailed(format!("Transaction receipt error: {}", e))
            })?
            .ok_or_else(|| {
                EthereumClientError::TransactionFailed("No receipt returned".to_string())
            })?;

        if receipt.status != Some(U64::from(1)) {
            return Err(EthereumClientError::TransactionFailed(
                "Transaction reverted".to_string(),
            ));
        }

        tracing::info!("✅ fillOrder confirmed: {:#x}", tx_hash);

        // Extract tradeId from the TradeCreated event logs
        // The TradeCreated event is the first log with topic[1] = tradeId
        let trade_id = if let Some(log) = receipt.logs.first() {
            if log.topics.len() > 1 {
                let mut trade_id_bytes = [0u8; 32];
                trade_id_bytes.copy_from_slice(log.topics[1].as_bytes());
                trade_id_bytes
            } else {
                return Err(EthereumClientError::ContractError(
                    "No trade ID in event logs".to_string(),
                ));
            }
        } else {
            return Err(EthereumClientError::ContractError(
                "No event logs in receipt".to_string(),
            ));
        };

        tracing::info!(
            "fillOrder tx confirmed: {:#x}, tradeId={}",
            tx_hash,
            hex::encode(trade_id)
        );

        Ok((tx_hash, trade_id))
    }

    /// Cancel an expired trade and return funds to seller
    /// The relayer pays for gas. Anyone can call this function on-chain.
    /// 
    /// Returns: Transaction hash on success, or error if trade is not expired/not pending
    pub async fn cancel_expired_trade(
        &self,
        trade_id: [u8; 32],
    ) -> Result<(H256, U256), EthereumClientError> {
        tracing::info!(
            "Calling cancelExpiredTrade: trade_id={}",
            hex::encode(trade_id),
        );

        // Configure gas pricing with per-chain cap
        let mut call = self.escrow_contract.cancel_expired_trade(trade_id);
        call = call.legacy().gas_price(U256::from(self.gas_price_cap()));
        let tx = call
            .send()
            .await
            .map_err(|e| {
                EthereumClientError::TransactionFailed(format!("cancelExpiredTrade failed: {}", e))
            })?;

        let tx_hash = tx.tx_hash();
        tracing::info!("cancelExpiredTrade tx sent: {:#x}", tx_hash);

        // Wait for confirmation
        let receipt = tx
            .await
            .map_err(|e| {
                EthereumClientError::TransactionFailed(format!("Transaction receipt error: {}", e))
            })?
            .ok_or_else(|| {
                EthereumClientError::TransactionFailed("No receipt returned".to_string())
            })?;

        if receipt.status != Some(U64::from(1)) {
            return Err(EthereumClientError::TransactionFailed(
                "Transaction reverted".to_string(),
            ));
        }

        // Calculate gas cost for return value
        let gas_used = receipt.gas_used.unwrap_or_default();
        let effective_gas_price = receipt.effective_gas_price.unwrap_or_default();
        let gas_cost = gas_used * effective_gas_price;

        tracing::info!("✅ cancelExpiredTrade confirmed: {:#x}", tx_hash);

        Ok((tx_hash, gas_cost))
    }
}
