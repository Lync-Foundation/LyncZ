-- ============================================================================
-- Migration 002: Multi-Chain Support
-- Date: 2026-02-10
-- Purpose: Add chain_id to orders/trades, create gas_costs tracking table
-- ============================================================================
-- 
-- Supports: Base Mainnet (8453) and Ethereum Mainnet (1)
-- Default chain_id is 8453 (Base) for backward compatibility with existing data.
--
-- ============================================================================

-- ============================================================================
-- ADD chain_id TO ORDERS
-- ============================================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "chainId" INTEGER NOT NULL DEFAULT 8453;

CREATE INDEX IF NOT EXISTS "idx_orders_chainId" ON orders("chainId");
CREATE INDEX IF NOT EXISTS "idx_orders_chainId_remainingAmount" ON orders("chainId", "remainingAmount");
CREATE INDEX IF NOT EXISTS "idx_orders_chainId_isPublic" ON orders("chainId", "isPublic") WHERE "isPublic" = true;

COMMENT ON COLUMN orders."chainId" IS 'Chain ID: 8453=Base, 1=Ethereum';

-- ============================================================================
-- ADD chain_id TO TRADES
-- ============================================================================
ALTER TABLE trades ADD COLUMN IF NOT EXISTS "chainId" INTEGER NOT NULL DEFAULT 8453;

CREATE INDEX IF NOT EXISTS "idx_trades_chainId" ON trades("chainId");
CREATE INDEX IF NOT EXISTS "idx_trades_chainId_status" ON trades("chainId", "status");

COMMENT ON COLUMN trades."chainId" IS 'Chain ID: 8453=Base, 1=Ethereum';

-- ============================================================================
-- ADD settlement_error TO TRADES (was missing from 001_schema.sql)
-- ============================================================================
ALTER TABLE trades ADD COLUMN IF NOT EXISTS "settlement_error" TEXT;

-- ============================================================================
-- GAS COSTS TABLE (Relay Gas Tracking)
-- ============================================================================
-- Tracks gas costs for every on-chain transaction made by the relay wallet.
-- Used to determine appropriate platform fees per chain.

CREATE TABLE IF NOT EXISTS gas_costs (
    "id" SERIAL PRIMARY KEY,
    "chainId" INTEGER NOT NULL,                          -- Chain ID: 8453=Base, 1=Ethereum
    "operation" VARCHAR(50) NOT NULL,                    -- Operation type: create_trade, settle, cancel
    "tradeId" VARCHAR(66),                               -- Associated trade ID (nullable for non-trade ops)
    "orderId" VARCHAR(66),                               -- Associated order ID (nullable)
    "txHash" VARCHAR(66) NOT NULL,                       -- Transaction hash
    "gasUsed" BIGINT NOT NULL,                           -- Gas units consumed
    "gasPriceGwei" NUMERIC(20,9) NOT NULL,               -- Gas price in Gwei
    "costWei" NUMERIC(78,0) NOT NULL,                    -- Total cost in Wei (gasUsed * gasPrice)
    "costEth" NUMERIC(30,18) NOT NULL,                   -- Total cost in ETH (for display)
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_gas_costs_chainId" ON gas_costs("chainId");
CREATE INDEX IF NOT EXISTS "idx_gas_costs_operation" ON gas_costs("operation");
CREATE INDEX IF NOT EXISTS "idx_gas_costs_tradeId" ON gas_costs("tradeId");
CREATE INDEX IF NOT EXISTS "idx_gas_costs_createdAt" ON gas_costs("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_gas_costs_chainId_operation" ON gas_costs("chainId", "operation");

COMMENT ON TABLE gas_costs IS 'Tracks relay wallet gas costs per chain for fee optimization';
COMMENT ON COLUMN gas_costs."operation" IS 'create_trade, settle, cancel, key_rotation';
COMMENT ON COLUMN gas_costs."costWei" IS 'gasUsed * gasPriceWei - total cost in Wei';
COMMENT ON COLUMN gas_costs."costEth" IS 'costWei / 10^18 - total cost in ETH for display';
