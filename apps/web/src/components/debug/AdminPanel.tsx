'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

// ============ SECURITY NOTE ============
// This panel is READ-ONLY. All admin write endpoints have been removed for security.
// Contract modifications must be done directly via cast/forge with the owner wallet.
// ============================================

interface ContractConfig {
  min_trade_value_cny: string;
  max_trade_value_cny: string;
  payment_window: string;
  fee_rate_bps: string;
  accumulated_fees_usdc: string;
  accumulated_fees_weth?: string;
  accumulated_fees_cbbtc?: string;
  paused: boolean;
  zk_verifier: string;
  public_key_der_hash: string;
  app_exe_commit?: string;
  app_vm_commit?: string;
  public_fee_usdc?: string;
  private_fee_usdc?: string;
  eth_price_usdc?: string;
  btc_price_usdc?: string;
  fee_calculator_address?: string;
}

interface ChainConfigEntry {
  chain_id: number;
  config?: ContractConfig;
  error?: string;
}

type SelectedChain = 'base' | 'ethereum';

export default function AdminPanel() {
  const [configs, setConfigs] = useState<Record<string, ChainConfigEntry>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedChain, setSelectedChain] = useState<SelectedChain>('base');

  const fetchConfig = async (forceRefresh: boolean = false) => {
    try {
      setLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const params = forceRefresh ? '?refresh=true' : '';
      const response = await fetch(`${API_URL}/api/admin/config${params}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setConfigs(data);
      setError('');
    } catch (err: any) {
      setError('Failed to fetch contract config: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const chainKey = selectedChain === 'base' ? 'Base' : 'Ethereum';
  const chainEntry = configs[chainKey];
  const config = chainEntry?.config as ContractConfig | undefined;
  const chainError = chainEntry?.error;

  if (loading && Object.keys(configs).length === 0) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Contract Config (Read-Only)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Loading contract configuration...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Contract Config (Read-Only)</CardTitle>
          <button 
            onClick={() => fetchConfig(true)}
            disabled={loading}
            className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1"
          >
            {loading ? 'Refreshing...' : 'Refresh from blockchain'}
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Security Notice */}
        <Alert className="bg-amber-50 border-amber-200">
          <AlertDescription className="text-amber-800 text-sm">
            <strong>Security Notice:</strong> This panel is read-only. Use <code className="bg-amber-100 px-1 rounded">cast</code> or <code className="bg-amber-100 px-1 rounded">forge</code> to modify contract config.
          </AlertDescription>
        </Alert>

        {/* Chain Toggle */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground mr-2">Chain:</span>
          <button
            onClick={() => setSelectedChain('base')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedChain === 'base'
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
            }`}
          >
            Base (8453)
          </button>
          <button
            onClick={() => setSelectedChain('ethereum')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedChain === 'ethereum'
                ? 'bg-purple-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
            }`}
          >
            Ethereum (1)
          </button>
        </div>

        {/* Error Message */}
        {(error || chainError) && (
          <Alert variant="destructive">
            <AlertDescription>{error || chainError}</AlertDescription>
          </Alert>
        )}

        {/* Available chains indicator */}
        <div className="text-xs text-muted-foreground">
          Configured chains: {Object.keys(configs).join(', ') || 'None'}
        </div>

        {/* Current Configuration */}
        {config ? (
          <div className="bg-muted p-4 rounded-lg space-y-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-lg">
                {chainKey} Configuration
                <span className="ml-2 text-xs font-mono text-muted-foreground">
                  (chain {chainEntry?.chain_id})
                </span>
              </h3>
            </div>
            
            {/* Basic Settings */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Min Trade Value (CNY):</span>
                <p className="font-mono font-semibold">
                  {(parseInt(config.min_trade_value_cny) / 100).toFixed(2)} CNY
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Max Trade Value (CNY):</span>
                <p className="font-mono font-semibold">
                  {(parseInt(config.max_trade_value_cny) / 100).toFixed(2)} CNY
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Payment Window:</span>
                <p className="font-mono font-semibold">{config.payment_window} seconds</p>
              </div>
              <div>
                <span className="text-muted-foreground">Contract Status:</span>
                <p className={`font-mono font-semibold ${config.paused ? 'text-red-600' : 'text-green-600'}`}>
                  {config.paused ? 'PAUSED' : 'ACTIVE'}
                </p>
              </div>
            </div>

            {/* Fee Configuration */}
            <div className="border-t pt-4 space-y-3">
              <h4 className="font-semibold text-sm text-muted-foreground">Fee Configuration (Flat Rate)</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Public Order Fee:</span>
                  <p className="font-mono font-semibold text-lg text-green-600">
                    {(parseInt(config.public_fee_usdc || '20000') / 1e6).toFixed(4)} USDC
                    <span className="text-xs text-muted-foreground ml-2">(flat per trade)</span>
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Private Order Fee:</span>
                  <p className="font-mono font-semibold text-lg text-green-600">
                    {(parseInt(config.private_fee_usdc || '10000') / 1e6).toFixed(4)} USDC
                    <span className="text-xs text-muted-foreground ml-2">(flat per trade)</span>
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">ETH Price (for fee conversion):</span>
                  <p className="font-mono font-semibold text-purple-600">
                    ${parseInt(config.eth_price_usdc || '3000')} USDC
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">BTC Price (for fee conversion):</span>
                  <p className="font-mono font-semibold text-orange-600">
                    ${parseInt(config.btc_price_usdc || '100000')} USDC
                  </p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground text-xs">Fee Calculator:</span>
                  <p className="font-mono text-xs break-all">{config.fee_calculator_address || 'N/A'}</p>
                </div>
                <div className="col-span-2 space-y-2">
                  <span className="text-muted-foreground">Accumulated Fees:</span>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-blue-50 p-2 rounded">
                      <p className="font-mono font-semibold text-blue-600 text-xs break-all">
                        {(() => {
                          const raw = config.accumulated_fees_usdc || '0';
                          const val = BigInt(raw);
                          const whole = val / BigInt(1e6);
                          const frac = val % BigInt(1e6);
                          return `${whole}.${frac.toString().padStart(6, '0')} USDC`;
                        })()}
                      </p>
                    </div>
                    <div className="bg-purple-50 p-2 rounded">
                      <p className="font-mono font-semibold text-purple-600 text-xs break-all">
                        {(() => {
                          const raw = config.accumulated_fees_weth || '0';
                          const val = BigInt(raw);
                          const divisor = BigInt('1000000000000000000');
                          const whole = val / divisor;
                          const frac = val % divisor;
                          return `${whole}.${frac.toString().padStart(18, '0')} WETH`;
                        })()}
                      </p>
                    </div>
                    <div className="bg-orange-50 p-2 rounded">
                      <p className="font-mono font-semibold text-orange-600 text-xs break-all">
                        {(() => {
                          const raw = config.accumulated_fees_cbbtc || '0';
                          const val = BigInt(raw);
                          const divisor = BigInt(1e8);
                          const whole = val / divisor;
                          const frac = val % divisor;
                          return `${whole}.${frac.toString().padStart(8, '0')} cbBTC`;
                        })()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* zkPDF Configuration */}
            <div className="border-t pt-4 space-y-3">
              <h4 className="font-semibold text-sm text-muted-foreground">zkPDF Configuration</h4>
              <div>
                <span className="text-muted-foreground text-xs">Verifier Contract:</span>
                <p className="font-mono text-xs break-all">{config.zk_verifier}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Public Key DER Hash:</span>
                <p className="font-mono text-xs break-all">{config.public_key_der_hash}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Guest Program Commitment:</span>
                <p className="font-mono text-xs break-all">{config.app_exe_commit}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">OpenVM Version Commitment:</span>
                <p className="font-mono text-xs break-all">{config.app_vm_commit}</p>
              </div>
            </div>
          </div>
        ) : !chainError ? (
          <div className="bg-muted p-4 rounded-lg text-center text-muted-foreground">
            No configuration available for {chainKey}. 
            {selectedChain === 'ethereum' && ' ETH chain may not be connected to the backend yet.'}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
