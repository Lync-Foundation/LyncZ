'use client';

import { useEffect, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getTransactionUrl } from '@/lib/contracts';
import { formatTokenAmountWithSymbol, getExchangeRateLabel, getTokenSymbol } from '@/lib/tokens';

interface DbOrder {
  order_id: string;
  seller: string;
  token: string;
  total_amount: string;
  remaining_amount: string;
  exchange_rate: string;
  rail: number;
  account_id?: string;
  account_name?: string;
  alipay_id?: string;
  alipay_name?: string;
  created_at: number;
  synced_at: string;
  chain_id: number;
}

interface DbTrade {
  trade_id: string;
  order_id: string;
  buyer: string;
  token_amount: string;
  cny_amount: string;
  token?: string;
  rail: number;
  transaction_id: string | null;
  payment_time: string | null;
  created_at: number;
  expires_at: number;
  status: number;
  synced_at: string;
  escrow_tx_hash: string | null;
  settlement_tx_hash: string | null;
  pdf_filename?: string | null;
  pdf_uploaded_at?: string | null;
  axiom_proof_id?: string | null;
  proof_generated_at?: string | null;
  proof_json?: string | null;
  chain_id: number;
}

interface ChainSummary {
  chain_id: number;
  orders: number;
  trades: number;
  trades_pending: number;
  trades_settled: number;
  gas_costs: Array<{
    operation: string;
    count: number;
    total_cost_wei: string;
    total_cost_eth: string;
    avg_gas_used: number;
    avg_gas_price_gwei: number;
  }> | null;
}

interface TradeGasCost {
  trade_id: string;
  total_cost_eth: string;
  total_gas_used: number;
  operations: number;
}

interface DatabaseDump {
  summary: {
    base: ChainSummary;
    ethereum: ChainSummary;
  };
  orders: DbOrder[];
  trades: DbTrade[];
  trade_gas_costs?: TradeGasCost[];
}

type ChainFilter = 'all' | 'base' | 'ethereum';

function getChainName(chainId: number): string {
  switch (chainId) {
    case 8453: return 'Base';
    case 1: return 'Ethereum';
    default: return `Chain ${chainId}`;
  }
}

function getChainBadge(chainId: number): { label: string; className: string } {
  switch (chainId) {
    case 8453: return { label: 'Base', className: 'bg-blue-100 text-blue-800' };
    case 1: return { label: 'ETH', className: 'bg-purple-100 text-purple-800' };
    default: return { label: `${chainId}`, className: 'bg-gray-100 text-gray-800' };
  }
}

function getExplorerTxUrl(txHash: string, chainId: number): string {
  switch (chainId) {
    case 1: return `https://etherscan.io/tx/${txHash}`;
    case 8453: return `https://basescan.org/tx/${txHash}`;
    default: return getTransactionUrl(txHash);
  }
}

function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatCnyAmount(amount: string): string {
  const num = parseInt(amount) / 100;
  return `¥${num.toFixed(2)}`;
}

function formatExchangeRate(rate: string): string {
  const num = parseInt(rate) / 100;
  return num.toFixed(2);
}

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

function getTradeStatus(status: number): string {
  switch (status) {
    case 0: return 'PENDING';
    case 1: return 'SETTLED';
    case 2: return 'EXPIRED';
    default: return 'UNKNOWN';
  }
}

function getPaymentRail(rail: number): { name: string; color: string } {
  switch (rail) {
    case 0: return { name: 'Alipay', color: 'bg-blue-100 text-blue-800' };
    case 1: return { name: 'WeChat', color: 'bg-green-100 text-green-800' };
    default: return { name: 'Unknown', color: 'bg-gray-100 text-gray-800' };
  }
}

export default function DatabaseViewer() {
  const [data, setData] = useState<DatabaseDump | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [chainFilter, setChainFilter] = useState<ChainFilter>('all');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const response = await fetch(`${API_URL}/api/debug/database`);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        setData(result);
        setError(null);
        setLastUpdate(new Date());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch database');
        console.error('Database fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const filteredOrders = data?.orders.filter(o => {
    if (chainFilter === 'all') return true;
    if (chainFilter === 'base') return o.chain_id === 8453;
    if (chainFilter === 'ethereum') return o.chain_id === 1;
    return true;
  }) ?? [];

  // Build lookup map for gas costs per trade
  const tradeGasCostMap = new Map<string, TradeGasCost>();
  if (data?.trade_gas_costs) {
    for (const gc of data.trade_gas_costs) {
      tradeGasCostMap.set(gc.trade_id, gc);
    }
  }

  const filteredTrades = data?.trades.filter(t => {
    if (chainFilter === 'all') return true;
    if (chainFilter === 'base') return t.chain_id === 8453;
    if (chainFilter === 'ethereum') return t.chain_id === 1;
    return true;
  }) ?? [];

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-lg">Loading database...</div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-lg text-red-500">Error: {error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-lg">No data available</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header with Chain Toggle */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Database Viewer</h1>
        <div className="flex items-center gap-4">
          <div className="text-sm text-muted-foreground">
            Last updated: {lastUpdate.toLocaleTimeString()}
            {error && <span className="ml-2 text-red-500">({error})</span>}
          </div>
        </div>
      </div>

      {/* Chain Filter Toggle */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground mr-2">Chain:</span>
        {(['all', 'base', 'ethereum'] as ChainFilter[]).map((filter) => (
          <button
            key={filter}
            onClick={() => setChainFilter(filter)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              chainFilter === filter
                ? filter === 'base' ? 'bg-blue-600 text-white' :
                  filter === 'ethereum' ? 'bg-purple-600 text-white' :
                  'bg-zinc-700 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
            }`}
          >
            {filter === 'all' ? 'All Chains' : filter === 'base' ? 'Base (8453)' : 'Ethereum (1)'}
          </button>
        ))}
      </div>

      {/* Chain Summary Cards */}
      {data.summary && (
        <div className="grid grid-cols-2 gap-4">
          {[
            { key: 'base' as const, name: 'Base', color: 'blue', data: data.summary.base },
            { key: 'ethereum' as const, name: 'Ethereum', color: 'purple', data: data.summary.ethereum },
          ].map(({ key, name, color, data: chainData }) => (
            <div key={key} className={`bg-zinc-900 border border-zinc-700 rounded-lg p-4 ${
              chainFilter !== 'all' && chainFilter !== key ? 'opacity-40' : ''
            }`}>
              <h3 className={`font-semibold text-${color}-400 mb-2`}>{name} (Chain {chainData.chain_id})</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-zinc-500">Orders:</span>
                  <span className="ml-2 font-mono">{chainData.orders}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Trades:</span>
                  <span className="ml-2 font-mono">{chainData.trades}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Pending:</span>
                  <span className="ml-2 font-mono text-yellow-400">{chainData.trades_pending}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Settled:</span>
                  <span className="ml-2 font-mono text-green-400">{chainData.trades_settled}</span>
                </div>
              </div>
              {chainData.gas_costs && chainData.gas_costs.length > 0 && (
                <div className="mt-3 border-t border-zinc-700 pt-2">
                  <span className="text-xs text-zinc-500">Gas Costs:</span>
                  {chainData.gas_costs.map(gc => (
                    <div key={gc.operation} className="flex justify-between text-xs mt-1">
                      <span className="text-zinc-400">{gc.operation} ({gc.count}x)</span>
                      <span className="font-mono">{parseFloat(gc.total_cost_eth).toFixed(6)} ETH</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Orders Table */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">
          Orders ({filteredOrders.length})
        </h2>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Chain</TableHead>
                <TableHead>Order ID</TableHead>
                <TableHead>Seller</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Remaining</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Rail</TableHead>
                <TableHead>Payment Account</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    No orders found
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrders.map((order) => {
                  const rail = getPaymentRail(order.rail);
                  const chainBadge = getChainBadge(order.chain_id);
                  return (
                  <TableRow key={order.order_id}>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${chainBadge.className}`}>
                        {chainBadge.label}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatAddress(order.order_id)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatAddress(order.seller)}
                    </TableCell>
                    <TableCell>{formatTokenAmountWithSymbol(order.total_amount, order.token)}</TableCell>
                    <TableCell className="font-semibold">
                      {formatTokenAmountWithSymbol(order.remaining_amount, order.token)}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {formatExchangeRate(order.exchange_rate)}
                        <div className="text-xs text-muted-foreground">{getExchangeRateLabel(order.token)}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${rail.color}`}>
                        {rail.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="font-medium">{order.account_name || order.alipay_name || '-'}</div>
                        <div className="text-muted-foreground">{order.account_id || order.alipay_id || '-'}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatTimestamp(order.created_at)}
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Trades Table */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">
          Trades ({filteredTrades.length})
        </h2>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Chain</TableHead>
                <TableHead>Trade ID</TableHead>
                <TableHead>Order ID</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>CNY Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Relay Fee (ETH)</TableHead>
                <TableHead>Transaction ID</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Escrow Tx</TableHead>
                <TableHead>Settlement Tx</TableHead>
                <TableHead>Proof</TableHead>
                <TableHead>PDF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTrades.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center text-muted-foreground">
                    No trades found
                  </TableCell>
                </TableRow>
              ) : (
                filteredTrades.map((trade) => {
                  const order = data.orders.find(o => o.order_id === trade.order_id);
                  const tokenAddress = trade.token || order?.token || '0x0000000000000000000000000000000000000000';
                  const chainBadge = getChainBadge(trade.chain_id);
                  
                  return (
                  <TableRow key={trade.trade_id}>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${chainBadge.className}`}>
                        {chainBadge.label}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatAddress(trade.trade_id)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatAddress(trade.order_id)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatAddress(trade.buyer)}
                    </TableCell>
                    <TableCell>{formatTokenAmountWithSymbol(trade.token_amount, tokenAddress)}</TableCell>
                    <TableCell>{formatCnyAmount(trade.cny_amount)}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                        trade.status === 0 ? 'bg-yellow-100 text-yellow-800' :
                        trade.status === 1 ? 'bg-green-100 text-green-800' :
                        trade.status === 2 ? 'bg-gray-100 text-gray-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {getTradeStatus(trade.status)}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {(() => {
                        const gc = tradeGasCostMap.get(trade.trade_id);
                        if (!gc) return <span className="text-gray-400">—</span>;
                        const eth = parseFloat(gc.total_cost_eth);
                        return (
                          <span title={`${gc.operations} ops, ${gc.total_gas_used.toLocaleString()} gas`}>
                            {eth < 0.0001 ? eth.toExponential(2) : eth.toFixed(6)}
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {trade.transaction_id ? (
                        <span title={trade.transaction_id}>
                          {trade.transaction_id.slice(0, 12)}...
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatTimestamp(trade.expires_at)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {trade.escrow_tx_hash ? (
                        <a
                          href={getExplorerTxUrl(trade.escrow_tx_hash, trade.chain_id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1"
                        >
                          {formatAddress(trade.escrow_tx_hash)}
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {trade.settlement_tx_hash ? (
                        <a
                          href={getExplorerTxUrl(trade.settlement_tx_hash, trade.chain_id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1"
                        >
                          {formatAddress(trade.settlement_tx_hash)}
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {trade.proof_json ? (
                        <span className="text-xs text-green-500">Yes</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {trade.pdf_filename ? (
                        <a
                          href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/trades/${trade.trade_id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline text-xs"
                        >
                          View PDF
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
