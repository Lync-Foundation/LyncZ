# LyncZ Backend Security Audit

**Date:** January 25, 2026  
**Scope:** Backend API endpoints, authentication, authorization, data access controls

---

## Executive Summary

The LyncZ backend (Rust relay service) exposes all API endpoints **without any authentication or authorization**. While the frontend uses Privy for wallet-based login, the backend does not verify any of these credentials. This means anyone with knowledge of the API can access, modify, or enumerate sensitive user data by calling the endpoints directly.

Settlement operations are partially protected at the **blockchain level** (invalid ZK proofs are rejected by the smart contract), but all data-access and account-management endpoints are completely open.

---

## Architecture Overview

- **Frontend:** Next.js with Privy wallet authentication
- **Backend:** Rust (Axum) relay service with PostgreSQL
- **Authentication gap:** Frontend authenticates users via wallet signatures, but the backend accepts all requests without verification
- **CORS:** Allows all origins (`*`)
- **Rate limiting:** None

---

## API Endpoint Inventory

### Public Market Data (OK to keep public)

| Endpoint | Purpose | Used By |
|----------|---------|---------|
| `GET /api/orders/active` | Browse marketplace sell orders | `OrderSelector`, `OrderList`, `MyOrders` |
| `GET /api/orders/private/:code` | Lookup private order by 6-digit code | `BuyerInfoInput` |

**Notes:**
- Active orders are marketplace listings — public by nature.
- Private order codes are 6-digit numeric only (~1M combinations), vulnerable to brute-force without rate limiting.

### Trade Data (NEEDS authentication)

| Endpoint | Purpose | Used By | Risk |
|----------|---------|---------|------|
| `GET /api/trades/:trade_id` | Get trade details | `ExecuteTrade`, `PaymentInstructions` (polling) | Anyone with a trade ID can see full trade details including Alipay account info |
| `GET /api/trades/buyer/:address` | List buyer's trades | `MyTrades`, `AccountPage`, `Navigation` | **Anyone can query any wallet's purchase history** |
| `GET /api/trades/seller/:address` | List seller's trades | `SellerTrades` | **Anyone can query any wallet's trade history** |
| `GET /api/trades/:trade_id/pdf` | Download uploaded payment receipt | `DatabaseViewer` (debug only) | **Anyone can download any user's Alipay payment receipt PDF** — contains names, account numbers, transaction amounts |

### Account Settings (NEEDS authentication)

| Endpoint | Purpose | Used By | Risk |
|----------|---------|---------|------|
| `POST /api/account/email` | Set notification email for a wallet | `NotificationSettings` | **Anyone can set/overwrite email for any wallet** — enables notification hijacking |
| `GET /api/account/email` | Get email for a wallet | `NotificationSettings` | **Anyone can check if a wallet has email configured** |
| `DELETE /api/account/email` | Remove email for a wallet | `NotificationSettings` | **Anyone can silently disable another user's notifications** |
| `POST /api/account/email/toggle` | Toggle notifications on/off | `NotificationSettings` | **Anyone can toggle any wallet's notification preferences** |

### Settlement Actions (Partially protected by blockchain)

| Endpoint | Purpose | Used By | Risk |
|----------|---------|---------|------|
| `POST /api/trades/create` | Create trade (relay pays gas) | `ExecuteTrade` | Anyone can create trades against valid orders |
| `POST /api/trades/:trade_id/validate` | Upload PDF receipt for validation | `PaymentInstructions` | Anyone can attempt validation, but PDF content is verified against trade parameters |

### Debug / Admin (MUST NOT exist in production)

| Endpoint | Purpose | Used By | Risk |
|----------|---------|---------|------|
| `GET /api/debug/database` | Full database dump | `DatabaseViewer` | **Exposes ALL orders, ALL trades, ALL data to anyone** |
| `GET /api/admin/config` | Contract configuration | `AdminPanel` | Exposes internal configuration |

### Dead Code (Removed)

| Endpoint | Status |
|----------|--------|
| `GET /api/orders/:order_id` | Defined but never called from frontend — **removed** |
| `POST /api/trades/:trade_id/settle` | Defined but never called from frontend (settlement is automatic after validation) — **removed** |

---

## Critical Findings

### 1. No Authentication (CRITICAL)

The backend has no authentication middleware. It does not verify:
- Wallet signatures (SIWE)
- Session tokens or JWTs
- API keys
- Authorization headers of any kind

### 2. No Authorization / User Isolation (CRITICAL)

No ownership checks exist. User A can freely access User B's data:
- Query User B's trades via `/api/trades/buyer/{B's address}`
- Download User B's PDF receipts via `/api/trades/{id}/pdf`
- Modify User B's email settings via `/api/account/email`

### 3. Debug Endpoint in Production (CRITICAL)

`GET /api/debug/database` returns the entire database contents. If this is accessible in production, it's a complete data breach vector.

### 4. Unrestricted CORS (HIGH)

CORS is set to `allow_origin(Any)`, meaning any website can make requests to the API on behalf of a user's browser.

### 5. No Rate Limiting (HIGH)

No rate limiting on any endpoint. Enables:
- Brute-forcing private order codes (6-digit, ~1M combinations)
- Enumeration of wallet addresses and their trade history
- DoS attacks

### 6. Sensitive Data in API Responses (HIGH)

Trade responses include Alipay account IDs, real names, and transaction amounts — all accessible without authentication.

---

## Recommended Fixes (Priority Order)

### Immediate (Before Production)

1. **Remove debug/admin endpoints** from production builds, or gate them behind admin authentication
2. **Implement SIWE (Sign-In With Ethereum) authentication** — require wallet signature verification for all authenticated endpoints
3. **Add authorization middleware** — verify the requesting wallet owns the data it's accessing
4. **Restrict CORS** to the production frontend domain only

### Short-Term

5. **Add rate limiting** — especially on private code lookups and trade enumeration endpoints
6. **Strengthen private order codes** — use longer alphanumeric codes or UUIDs
7. **Audit API responses** — ensure sensitive fields (Alipay IDs, real names) are only returned to authorized parties
8. **Add request logging** — track access patterns for anomaly detection

### Long-Term

9. **Implement role-based access control** — separate buyer/seller/admin permissions
10. **Add API versioning** — for safe iteration on security improvements
11. **Security testing** — automated penetration testing in CI/CD
12. **Audit logging** — immutable logs for all sensitive operations

---

## What IS Secure Today

- **On-chain settlement:** Invalid ZK proofs are rejected by the smart contract (`LyncZEscrow.sol`)
- **Payment info integrity:** Payment info submission verifies hash against blockchain storage
- **Trade creation:** Requires a valid on-chain order with sufficient balance
- **PDF validation:** Backend verifies PDF content matches expected trade parameters before triggering proof generation

The blockchain layer provides strong guarantees for financial settlement. The gap is in **data privacy and account security** at the API layer.
