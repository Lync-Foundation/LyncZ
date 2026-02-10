'use client';

import { useBuyerTrades } from '@/hooks/useBuyerTrades';
import { formatAddress, getTransactionUrl } from '@/lib/contracts';
import { formatTokenAmountWithSymbol, getTokenSymbol } from '@/lib/tokens';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2, Loader2, Clock, ExternalLink, Upload, Filter } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState, useEffect } from 'react';
import { Trade } from '@/lib/api';
import { useTranslations } from 'next-intl';
import { PaymentInstructions } from '@/components/buy/PaymentInstructions';

type TradeView = 'pending' | 'completed';

interface MyTradesProps {
  unseenTradeIds?: Set<string>;
  onTradesSeen?: (tradeIds: string[]) => void;
}

// Format countdown time
function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function MyTrades({ unseenTradeIds = new Set(), onTradesSeen }: MyTradesProps) {
  const { data: tradesData, isLoading, error: fetchError, refetch } = useBuyerTrades();
  const [view, setView] = useState<TradeView>('pending');
  const [resumingTradeId, setResumingTradeId] = useState<string | null>(null);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const t = useTranslations('buy.myTrades');

  // Update countdown every second
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Mark trades as seen when switching to completed view
  useEffect(() => {
    if (view === 'completed' && unseenTradeIds.size > 0 && onTradesSeen) {
      // Small delay to allow user to see the highlight before marking as seen
      const timer = setTimeout(() => {
        onTradesSeen([...unseenTradeIds]);
      }, 3000); // Mark as seen after 3 seconds of viewing
      return () => clearTimeout(timer);
    }
  }, [view, unseenTradeIds, onTradesSeen]);

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

  const trades = tradesData?.trades || [];

  // If resuming a trade, show the PaymentInstructions
  if (resumingTradeId) {
    const resumingTrade = trades.find((t: Trade) => t.trade_id === resumingTradeId);
    if (resumingTrade) {
      // Convert to the format expected by PaymentInstructions
      const tradeForPayment = {
        trade_id: resumingTrade.trade_id,
        order_id: resumingTrade.order_id,
        buyer: resumingTrade.buyer,
        token_amount: resumingTrade.token_amount,
        cny_amount: resumingTrade.cny_amount,
        created_at: resumingTrade.created_at,
        expires_at: resumingTrade.expires_at,
        alipay_id: resumingTrade.account_id || resumingTrade.alipay_id || '',
        alipay_name: resumingTrade.account_name || resumingTrade.alipay_name || '',
        escrow_tx_hash: resumingTrade.escrow_tx_hash,
      };

      return (
        <div className="space-y-4">
          <Button
            variant="outline"
            onClick={() => {
              setResumingTradeId(null);
              refetch(); // Refresh trades list when going back
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="mb-4"
          >
            ← {t('backToTrades')}
          </Button>
          <PaymentInstructions 
            trades={[tradeForPayment]} 
            onAllSettled={() => {
              setResumingTradeId(null);
              refetch();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }} 
          />
        </div>
      );
    }
  }

  // Separate pending and completed trades
  // Status: 0=PENDING, 1=SETTLED, 2=EXPIRED
  // Only show pending (status=0) in pending tab
  // Only show settled (status=1) in completed tab - hide expired trades
  const pendingTrades = trades.filter((trade: Trade) => trade.status === 0);
  const completedTrades = trades.filter((trade: Trade) => trade.status === 1); // Only settled, not expired
  
  // Trades that need action: pending AND no PDF uploaded
  const tradesNeedingAction = pendingTrades.filter((trade: Trade) => !trade.pdf_uploaded_at);
  // Trades awaiting proof: pending AND PDF uploaded (backend is generating proof)
  const tradesAwaitingProof = pendingTrades.filter((trade: Trade) => !!trade.pdf_uploaded_at);
  
  const displayedTrades = view === 'pending' ? pendingTrades : completedTrades;

  if (trades.length === 0) {
    return (
      <Card className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-gray-200/50 dark:border-gray-800/50 shadow-lg">
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            {t('noTrades')}
          </p>
        </CardContent>
      </Card>
    );
  }

  const getStatusBadge = (status: number) => {
    switch (status) {
      case 0:
        return (
          <div className="flex items-center text-sm font-semibold text-yellow-700 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30 px-3 py-1.5 rounded-xl border border-yellow-300 dark:border-yellow-700">
            <Clock className="h-4 w-4 mr-1.5" />
            {t('pendingPayment')}
          </div>
        );
      case 1:
        return (
          <div className="flex items-center text-sm font-semibold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-3 py-1.5 rounded-xl border border-green-300 dark:border-green-700">
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            {t('settled')}
          </div>
        );
      case 2:
        return (
          <div className="flex items-center text-sm font-semibold text-gray-700 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700">
            <AlertCircle className="h-4 w-4 mr-1.5" />
            {t('expired')}
          </div>
        );
      default:
        return null;
    }
  };

  const renderTradeCard = (trade: Trade, isCompleted: boolean) => {
    const tokenAddress = trade.token || '0x0000000000000000000000000000000000000000'; // Fallback for old trades
    const tokenAmount = formatTokenAmountWithSymbol(trade.token_amount, tokenAddress);
    const tokenSymbol = getTokenSymbol(tokenAddress);
    const cnyAmount = (parseFloat(trade.cny_amount) / 100).toFixed(2);
    const isExpired = trade.status === 2;
    const isSettled = trade.status === 1;
    const isPending = trade.status === 0;
    const isUnseen = unseenTradeIds.has(trade.trade_id);

    // Check if expired but not marked as such yet
    const isActuallyExpired = isPending && Date.now() / 1000 > trade.expires_at;

    return (
      <Card 
        key={trade.trade_id} 
        className={`bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-gray-200/50 dark:border-gray-800/50 shadow-lg transition-all hover:shadow-xl ${isCompleted && !isUnseen ? 'opacity-70' : ''} ${isUnseen ? 'ring-2 ring-green-500 ring-offset-2 animate-pulse' : ''}`}
      >
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-mono text-gray-700 dark:text-gray-300">
                  {t('trade')} {formatAddress(trade.trade_id)}
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
              <CardDescription className="text-xs mt-1">
                {t('created')} {new Date(trade.created_at * 1000).toLocaleString()}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {isUnseen && isSettled && (
                <span className="px-2 py-1 text-xs font-bold bg-green-500 text-white rounded-full animate-bounce flex items-center gap-1">
                  ✨ {t('newlySettled')}
                </span>
              )}
              {getStatusBadge(trade.status)}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Trade Info - Apple Style Grid */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl">
            <div className="space-y-1">
              <p className="text-gray-600 dark:text-gray-400 text-xs font-medium">{isPending ? t('tokenToReceive') : t('tokenReceived')}</p>
              <p className="font-bold text-base text-gray-900 dark:text-gray-100">{tokenAmount}</p>
            </div>
            <div className="space-y-1">
              <p className="text-gray-600 dark:text-gray-400 text-xs font-medium">{isPending ? t('cnyToPay') : t('cnyPaid')}</p>
              <p className="font-bold text-base text-green-600 dark:text-green-400">¥{cnyAmount}</p>
            </div>
            <div className="space-y-1">
              <p className="text-gray-600 dark:text-gray-400 text-xs font-medium">
                {isPending ? t('timeLeft') : isSettled ? t('settledAt') : t('expiredAt')}
              </p>
              {isPending && !isActuallyExpired ? (
                <p className={`text-sm font-bold ${trade.expires_at - now < 300 ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'}`}>
                  ⏱️ {formatCountdown(trade.expires_at - now)}
                </p>
              ) : (
                <p className="text-xs text-gray-700 dark:text-gray-300">
                  {new Date(trade.expires_at * 1000).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          {/* Action Button for Pending Trades */}
          {isPending && !isActuallyExpired && (
            trade.pdf_uploaded_at ? (
              // PDF uploaded - proof is generating, no action needed
              <div className="w-full p-3 bg-emerald-500/8 dark:bg-emerald-500/10 rounded-2xl text-center">
                <div className="flex items-center justify-center gap-2 text-green-700 dark:text-green-400 font-medium">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('proofGenerating')}
                </div>
                <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                  {t('proofGeneratingHint')}
                </p>
              </div>
            ) : (
              // No PDF uploaded - action required
              <Button
                onClick={() => {
                  setResumingTradeId(trade.trade_id);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="w-full bg-purple-500/8 hover:bg-purple-500/15 text-purple-600 dark:text-purple-400 rounded-xl transition-all duration-500 shadow-sm shadow-purple-500/10 hover:shadow-purple-500/20"
              >
                <Upload className="h-4 w-4 mr-2" />
                {t('continuePayment')}
              </Button>
            )
          )}

          {/* Transaction Links - Modern Style */}
          {(trade.escrow_tx_hash || trade.settlement_tx_hash) && (
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
              {trade.escrow_tx_hash && (
                <a
                  href={getTransactionUrl(trade.escrow_tx_hash, trade.chain_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t('viewCreationTx')}
                </a>
              )}
              {trade.settlement_tx_hash && (
                <a
                  href={getTransactionUrl(trade.settlement_tx_hash, trade.chain_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t('viewSettlementTx')}
                </a>
              )}
            </div>
          )}

          {/* Warning for expired pending trades */}
          {isActuallyExpired && isPending && (
            <Alert variant="destructive" className="border-red-300 dark:border-red-700">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {t('expiredWarning')}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Toggle Buttons - Apple Style */}
      <div className="flex gap-2">
        <Button
          variant="ghost"
          onClick={() => setView('pending')}
          className={view === 'pending'
            ? "flex-1 text-xs md:text-sm py-3 bg-purple-500/8 text-purple-600 dark:text-purple-400 rounded-xl transition-all duration-500 shadow-sm shadow-purple-500/10"
            : "flex-1 text-xs md:text-sm py-3 text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-500/5 rounded-xl transition-all duration-500"
          }
        >
          <span className="hidden md:inline">{t('pendingPurchases')}</span>
          <span className="md:hidden">{t('pending')}</span>
          <span className={`ml-1 md:ml-2 px-1.5 md:px-2 py-0.5 text-xs rounded-full font-semibold ${view === 'pending' ? 'bg-white/20' : 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'}`}>
            {pendingTrades.length}
          </span>
        </Button>
        <Button
          variant="ghost"
          onClick={() => setView('completed')}
          className={view === 'completed'
            ? "flex-1 text-xs md:text-sm py-3 bg-purple-500/8 text-purple-600 dark:text-purple-400 rounded-xl transition-all duration-500 shadow-sm shadow-purple-500/10"
            : "flex-1 text-xs md:text-sm py-3 text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-500/5 rounded-xl transition-all duration-500"
          }
        >
          <span className="hidden md:inline">{t('completedPurchases')}</span>
          <span className="md:hidden">{t('completed')}</span>
          <span className={`ml-1 md:ml-2 px-1.5 md:px-2 py-0.5 text-xs rounded-full font-semibold ${view === 'completed' ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
            {completedTrades.length}
          </span>
        </Button>
      </div>

      {/* Trades Display */}
      <div className="space-y-4">
        {displayedTrades.length === 0 ? (
          <Alert className="border-gray-200 dark:border-gray-700">
            <AlertDescription>
              {view === 'pending' ? t('noPending') : t('noCompleted')}
            </AlertDescription>
          </Alert>
        ) : (
          displayedTrades.map((trade: Trade) => renderTradeCard(trade, view === 'completed'))
        )}
      </div>
    </div>
  );
}

