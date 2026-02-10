import axios from 'axios';
import { getAuthToken } from '@/hooks/useAuth';

// Default to Railway backend
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://lyncz-web-production.up.railway.app';

// ============ Types ============

export interface Order {
  order_id: string;
  seller: string;
  token: string;
  total_amount: string;
  remaining_amount: string;
  exchange_rate: string;
  rail: number; // 0 = Alipay, 1 = WeChat
  // Payment account info - support both old (alipay_*) and new (account_*) field names
  account_id?: string; // Payment account ID (new)
  account_name?: string; // Payment account name (new)
  alipay_id?: string; // Payment account ID (legacy)
  alipay_name?: string; // Payment account name (legacy)
  created_at: number;
  // Private listing fields
  is_public: boolean;
  private_code?: string;
}

export interface Trade {
  trade_id: string;
  order_id: string;
  buyer: string;
  token_amount: string;
  cny_amount: string;
  transaction_id?: string; // From PDF
  payment_time?: string; // From PDF
  created_at: number;
  expires_at: number;
  status: number; // 0=PENDING, 1=SETTLED, 2=EXPIRED
  escrow_tx_hash?: string;
  settlement_tx_hash?: string;
  pdf_filename?: string;
  pdf_uploaded_at?: string;
  proof_generated_at?: string; // When ZK proof was generated
  settlement_error?: string; // Settlement error code if failed (ALREADY_USED, NOT_PENDING, EXPIRED, VERIFICATION_FAILED)
  token?: string; // Token address (from joined order)
  // Payment account info - support both old (alipay_*) and new (account_*) field names
  account_id?: string; // Seller's account ID (new)
  account_name?: string; // Seller's account name (new)
  alipay_id?: string; // Seller's account ID (legacy)
  alipay_name?: string; // Seller's account name (legacy)
}

// ============ API Client ============

export const api = {
  // === Orders ===
  
  async getActiveOrders(limit?: number): Promise<Order[]> {
    const response = await axios.get(`${API_BASE}/api/orders/active`, {
      params: { limit },
    });
    return response.data.orders || [];
  },

  async getOrdersBySeller(sellerAddress: string): Promise<{ orders: Order[] }> {
    const token = getAuthToken();
    const response = await axios.get(`${API_BASE}/api/orders/active`, {
      params: { seller: sellerAddress.toLowerCase() },
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return response.data;
  },

  async getOrderByPrivateCode(privateCode: string): Promise<Order> {
    const response = await axios.get(`${API_BASE}/api/orders/private/${privateCode}`);
    return response.data;
  },

  async setOrderVisibility(orderId: string, isPublic: boolean): Promise<{
    success: boolean;
    is_public: boolean;
    private_code?: string;
  }> {
    const response = await axios.post(`${API_BASE}/api/orders/${orderId}/visibility`, {
      is_public: isPublic,
    });
    return response.data;
  },

  /**
   * v4: Submit plain text payment info to backend after creating order on-chain.
   * On-chain only stores accountLinesHash for privacy. Plain text is stored
   * in the backend database for buyer display.
   */
  async submitPaymentInfo(orderId: string, accountId: string, accountName: string): Promise<{
    success: boolean;
    message: string;
    computed_hash: string;
  }> {
    const response = await axios.post(`${API_BASE}/api/orders/${orderId}/payment-info`, {
      account_id: accountId,
      account_name: accountName,
    });
    return response.data;
  },

  // === Trades ===
  
  async createTrade(
    orderId: string,
    buyerAddress: string,
    fiatAmount: string // Fiat amount in cents (e.g., "10000" for ¥100), must be divisible by 100
  ): Promise<{
    trade_id: string;
    order_id: string;
    buyer: string;
    tx_hash: string;
    message: string;
  }> {
    const response = await axios.post(`${API_BASE}/api/trades/create`, {
      order_id: orderId,
      buyer_address: buyerAddress,
      fiat_amount: fiatAmount,
    });
    return response.data;
  },

  async getTrade(tradeId: string): Promise<Trade> {
    const response = await axios.get(`${API_BASE}/api/trades/${tradeId}`);
    return response.data;
  },

  async getTradesByBuyer(buyerAddress: string): Promise<{ trades: Trade[] }> {
    const response = await axios.get(`${API_BASE}/api/trades/buyer/${buyerAddress.toLowerCase()}`);
    return response.data;
  },

  async getTradesBySeller(sellerAddress: string): Promise<{ trades: Trade[] }> {
    const response = await axios.get(`${API_BASE}/api/trades/seller/${sellerAddress.toLowerCase()}`);
    return response.data;
  },

  // === Settlement Flow ===
  
  // Step 1: Upload PDF and validate (fast, ~10s)
  async validateTrade(tradeId: string, pdfFile: File): Promise<{
    trade_id: string;
    is_valid: boolean;
    validation_details?: string;
    validation_code?: string; // REPLAY_ATTACK, PAYMENT_TOO_OLD, HASH_MISMATCH, SUCCESS
    filename?: string;
    // Backend sends these fields:
    valid?: boolean;
    message?: string;
    transaction_id?: string;
    payment_time?: string;
  }> {
    const formData = new FormData();
    formData.append('pdf', pdfFile);
    
    const response = await axios.post(`${API_BASE}/api/trades/${tradeId}/validate`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    
    // Map backend field names to frontend expected names
    const data = response.data;
    return {
      ...data,
      is_valid: data.valid ?? data.is_valid ?? false,
      validation_details: data.message ?? data.validation_details,
      validation_code: data.validation_code,
    };
  },

  getPdfUrl(tradeId: string): string {
    return `${API_BASE}/api/trades/${tradeId}/pdf`;
  },

  // === Debug ===
  
  async getDebugData(): Promise<{ orders: Order[]; trades: Trade[] }> {
    const response = await axios.get(`${API_BASE}/api/debug/database`);
    return response.data;
  },

  // === Admin ===
  
  async getContractConfig(forceRefresh: boolean = false): Promise<{
    min_trade_value_cny: string;
    max_trade_value_cny: string;
    payment_window: string;
    fee_rate_bps: string;
    accumulated_fees_usdc: string;
    paused: boolean;
    zk_verifier: string;
    public_key_der_hash: string;
    app_exe_commit?: string;
    app_vm_commit?: string;
  }> {
    const params = forceRefresh ? '?refresh=true' : '';
    const response = await axios.get(`${API_BASE}/api/admin/config${params}`);
    return response.data;
  },

  // ============ Admin Write Endpoints REMOVED for Security ============
  // All contract modifications must be done directly via cast/forge with the owner wallet.
  // This prevents the public API from being exploited to modify contract state.
  //
  // Removed endpoints:
  // - updateConfig (min/max trade, payment window)
  // - updatePublicKeyHash
  // - withdrawFees
  // - updatePublicFee, updatePrivateFee, updateEthPrice, updateBtcPrice
  // - updateVerifier
  // - pauseContract, unpauseContract
  //
  // To modify contract config, use cast directly:
  // cast send --rpc-url $RPC --private-key $OWNER_KEY $CONTRACT "setMinTradeValue(uint256)" 10000
  // ============================================================
};

// Export individual functions for direct import
export const submitPaymentInfo = api.submitPaymentInfo.bind(api);

