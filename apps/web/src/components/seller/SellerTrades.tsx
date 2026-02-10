'use client';

import { useUserTrades } from '@/hooks/useUserTrades';
import { formatAddress, getTransactionUrl } from '@/lib/contracts';
import { getTokenInfo, formatTokenAmount, getDefaultTokenAddress } from '@/lib/tokens';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2, ExternalLink, CheckCircle2, Clock, Filter } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState } from 'react';
import { Trade } from '@/lib/api';
import { useTranslations } from 'next-intl';

type TradeView = 'pending' | 'completed';

export function SellerTrades() {
  const t = useTranslations('sell.myTrades');
  const { data: trades, isLoading, error: fetchError } = useUserTrades();
  const [view, setView] = useState<TradeView>('pending');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">{t('loading')}</span>
      </div>
    );
  }

  if (fetchError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{t('error')}</AlertDescription>
      </Alert>
    );
  }

  // Separate pending and completed trades
  // Status: 0=PENDING, 1=SETTLED, 2=EXPIRED
  const pendingTrades = trades?.filter((trade: Trade) => trade.status === 0) || [];
  const completedTrades = trades?.filter((trade: Trade) => trade.status !== 0) || [];
  
  const displayedTrades = view === 'pending' ? pendingTrades : completedTrades;

  if (!trades || trades.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            {t('empty')}
          </p>
        </CardContent>
      </Card>
    );
  }

  const getStatusBadge = (status: number) => {
    switch (status) {
      case 1: // SETTLED
        return (
          <div className="flex items-center text-sm text-green-600 dark:text-green-400 font-semibold">
            <CheckCircle2 className="h-4 w-4 mr-1" />
            {t('settled')}
          </div>
        );
      case 2: // EXPIRED
        return (
          <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 font-semibold">
            <Clock className="h-4 w-4 mr-1" />
            {t('expired')}
          </div>
        );
      default: // PENDING
        return (
          <div className="flex items-center text-sm text-blue-600 dark:text-blue-400 font-semibold">
            <Clock className="h-4 w-4 mr-1 animate-pulse" />
            {t('pending')}
          </div>
        );
    }
  };

  const renderTradeCard = (trade: Trade) => {
    const tokenAddress = trade.token || getDefaultTokenAddress();
    const tokenInfo = getTokenInfo(tokenAddress);
    const tokenAmount = formatTokenAmount(trade.token_amount, tokenAddress);
    const cnyAmount = parseFloat(trade.cny_amount) / 100;
    const isCompleted = trade.status !== 0;

    return (
      <Card 
        key={trade.trade_id} 
        className={`bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-gray-200/50 dark:border-gray-800/50 shadow-lg transition-all hover:shadow-xl ${isCompleted ? 'opacity-80' : ''}`}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-mono text-gray-700 dark:text-gray-300">
                  {t('tradePrefix')} {formatAddress(trade.trade_id)}
                </CardTitle>
                {/* Chain Badge */}
                {trade.chain_id === 1 ? (
                  <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-lg bg-purple-500/10 border border-purple-400/20 text-purple-600 dark:text-purple-400">
                    ETH
                  </span>
                ) : (
                  <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-lg bg-blue-500/10 border border-blue-400/20 text-blue-600 dark:text-blue-400">
                    Base
                  </span>
                )}
              </div>
              <CardDescription>
                {t('created')} {new Date(trade.created_at * 1000).toLocaleString()}
              </CardDescription>
            </div>
            {getStatusBadge(trade.status)}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Trade Info */}
          <div className="grid grid-cols-2 gap-4 text-sm p-3 bg-gradient-to-br from-gray-50 to-blue-50/30 dark:from-gray-800/50 dark:to-blue-900/10 rounded-xl border border-gray-200/50 dark:border-gray-700/50">
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-xs">{t('tokenReceived')}</p>
              <p className="font-semibold text-base">{tokenAmount} {tokenInfo.symbol}</p>
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-xs">{t('cnyPaid')}</p>
              <p className="font-semibold text-base text-green-600 dark:text-green-400">
                ¥{cnyAmount.toFixed(2)}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-gray-600 dark:text-gray-400 text-xs">{t('orderRef')}</p>
              <p className="font-mono text-sm">{formatAddress(trade.order_id)}</p>
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-xs">{t('buyer')}</p>
              <p className="font-mono text-sm">{formatAddress(trade.buyer)}</p>
            </div>
            {isCompleted && (
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-xs">
                  {trade.status === 1 ? t('settledAt') : t('expiredAt')}
                </p>
                <p className="text-sm">
                  {trade.status === 1 && trade.settlement_tx_hash
                    ? new Date(trade.created_at * 1000).toLocaleString()
                    : new Date(trade.expires_at * 1000).toLocaleString()}
                </p>
              </div>
            )}
          </div>

          {/* Transaction Links (chain-aware) */}
          <div className="flex flex-wrap gap-2 text-sm">
            {trade.escrow_tx_hash && (
              <a
                href={getTransactionUrl(trade.escrow_tx_hash, trade.chain_id)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                {t('viewCreationTx')}
              </a>
            )}
            {trade.settlement_tx_hash && (
              <a
                href={getTransactionUrl(trade.settlement_tx_hash, trade.chain_id)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                {t('viewSettlementTx')}
              </a>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Status Filter - Compact Dropdown */}
      <div className="flex items-center justify-end gap-2 mb-2">
        <Filter className="h-4 w-4 text-gray-500" />
        <Select value={view} onValueChange={(v) => setView(v as TradeView)}>
          <SelectTrigger className="w-[160px] h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">
              {t('pendingTrades')} ({pendingTrades.length})
            </SelectItem>
            <SelectItem value="completed">
              {t('completedTrades')} ({completedTrades.length})
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Trades Display */}
      <div className="space-y-4">
        {displayedTrades.length === 0 ? (
          <Alert>
            <AlertDescription>
              {view === 'pending' 
                ? t('noPendingTrades')
                : t('noCompletedTrades')}
            </AlertDescription>
          </Alert>
        ) : (
          displayedTrades.map((trade: Trade) => renderTradeCard(trade))
        )}
      </div>
    </div>
  );
}

