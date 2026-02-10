'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { usePrivy } from '@privy-io/react-auth';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  CheckCircle2, 
  ArrowDownLeft, 
  ExternalLink, 
  Loader2,
  Wallet,
  Clock,
  Store,
  Pencil,
  AlertCircle,
  Globe,
  Lock,
  Copy,
  Check,
  XCircle,
  Timer
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ConnectWalletButton } from '@/components/WalletButton';
import SciFiBackground from '@/components/SciFiBackground';
import { formatAddress, getTransactionUrl } from '@/lib/contracts';
import { getTokenInfo } from '@/lib/tokens';
import { useWithdraw } from '@/hooks/useWithdraw';
import { useUpdateExchangeRate } from '@/hooks/useUpdateExchangeRate';
import { useTranslations } from 'next-intl';

// Types matching the backend API
interface OrderDto {
  order_id: string;
  seller: string;
  token: string;
  total_amount: string;
  remaining_amount: string;
  exchange_rate: string;
  rail: number;
  alipay_id: string;
  alipay_name: string;
  created_at: number;
  is_public: boolean;
  private_code?: string;
  chain_id?: number;
}

interface TradeActivity {
  type: 'trade';
  trade_id: string;
  buyer: string;
  token_amount: string;
  token_amount_formatted: string;
  fee_amount: string;
  fee_amount_formatted: string;
  cny_amount: string;
  cny_amount_formatted: string;
  settlement_tx: string | null;
  settled_at: number;
}

interface PendingTradeActivity {
  type: 'pending_trade';
  trade_id: string;
  buyer: string;
  token_amount: string;
  token_amount_formatted: string;
  cny_amount: string;
  cny_amount_formatted: string;
  created_at: number;
  expires_at: number;
}

interface ExpiredTradeActivity {
  type: 'expired_trade';
  trade_id: string;
  buyer: string;
  token_amount: string;
  token_amount_formatted: string;
  cny_amount: string;
  cny_amount_formatted: string;
  created_at: number;
  expired_at: number;
}

interface WithdrawalActivity {
  type: 'withdrawal';
  amount: string;
  amount_formatted: string;
  remaining_after: string;
  remaining_after_formatted: string;
  tx_hash: string | null;
  created_at: string;
}

type Activity = TradeActivity | PendingTradeActivity | ExpiredTradeActivity | WithdrawalActivity;

interface OrderActivitiesResponse {
  order: OrderDto;
  activities: Activity[];
  token_symbol: string;
  token_decimals: number;
}

export default function OrderDetailPage() {
  const t = useTranslations('account');
  const tOrder = useTranslations('account.orderDetail');
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;
  
  const { address, isConnected } = useAccount();
  const { authenticated, ready } = usePrivy();
  const isFullyConnected = ready && authenticated && isConnected;
  
  const [data, setData] = useState<OrderActivitiesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Withdraw state
  const [withdrawAmount, setWithdrawAmount] = useState('');
  
  // Private code copy state
  const [codeCopied, setCodeCopied] = useState(false);
  const { 
    executeWithdraw, 
    resetState: resetWithdrawState, 
    currentStep: withdrawStep, 
    isWithdrawing, 
    errorCode: withdrawError,
    txHash: withdrawTxHash 
  } = useWithdraw();
  
  // Update rate state
  const [newRate, setNewRate] = useState('');
  const [isEditingRate, setIsEditingRate] = useState(false);
  const {
    executeUpdateRate,
    resetState: resetRateState,
    currentStep: rateStep,
    isUpdating,
    errorCode: rateError,
    txHash: rateTxHash
  } = useUpdateExchangeRate();
  
  
  // Fetch order data
  const fetchOrderActivities = useCallback(async () => {
    if (!orderId) return;
    try {
      setIsLoading(true);
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/orders/${orderId}/activities`);
      if (!response.ok) {
        throw new Error('Failed to fetch order details');
      }
      const result = await response.json();
      setData(result);
      // Initialize exchange rate field with current value
      if (result.order) {
        setNewRate((parseFloat(result.order.exchange_rate) / 100).toFixed(2));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);
  
  useEffect(() => {
    fetchOrderActivities();
  }, [fetchOrderActivities]);
  
  // Refetch after successful withdraw
  useEffect(() => {
    if (withdrawStep === 'success') {
      const timer = setTimeout(() => {
        fetchOrderActivities();
        resetWithdrawState();
        setWithdrawAmount('');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [withdrawStep, fetchOrderActivities, resetWithdrawState]);
  
  // Refetch after successful rate update
  useEffect(() => {
    if (rateStep === 'success') {
      const timer = setTimeout(() => {
        fetchOrderActivities();
        resetRateState();
        setIsEditingRate(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [rateStep, fetchOrderActivities, resetRateState]);
  
  
  // Check if user is the seller
  const isSeller = data?.order && address && 
    data.order.seller.toLowerCase() === address.toLowerCase();
  
  // Format timestamp for display
  const formatTimestamp = (ts: number | string) => {
    const date = typeof ts === 'number' 
      ? new Date(ts * 1000) 
      : new Date(ts);
    return date.toLocaleString();
  };
  
  if (!isFullyConnected) {
    return (
      <div className="min-h-screen relative">
        <SciFiBackground />
        <div className="container mx-auto px-4 py-20 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto text-center"
          >
            <motion.div 
              className="w-20 h-20 mx-auto mb-8 rounded-2xl bg-purple-500/10 border-2 border-purple-300/40 flex items-center justify-center"
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <Wallet className="w-10 h-10 text-purple-500" />
            </motion.div>
            <h1 className="text-3xl md:text-4xl font-bold mb-4 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent">
              {t('connectTitle')}
            </h1>
            <p className="text-base md:text-lg text-slate-600 dark:text-slate-400 mb-10">{t('connectSubtitle')}</p>
            <div className="flex justify-center">
              <ConnectWalletButton />
            </div>
          </motion.div>
        </div>
      </div>
    );
  }
  
  if (isLoading) {
    return (
      <div className="min-h-screen relative">
        <SciFiBackground />
        <div className="container mx-auto px-4 py-20 relative z-10 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
          <span className="ml-3 text-lg text-slate-600 dark:text-slate-400">{tOrder('loading')}</span>
        </div>
      </div>
    );
  }
  
  if (error || !data) {
    return (
      <div className="min-h-screen relative">
        <SciFiBackground />
        <div className="container mx-auto px-4 py-20 relative z-10">
          <Alert variant="destructive" className="max-w-lg mx-auto">
            <AlertDescription>{error || tOrder('orderNotFound')}</AlertDescription>
          </Alert>
          <div className="text-center mt-6">
            <Button onClick={() => router.back()} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {tOrder('goBack')}
            </Button>
          </div>
        </div>
      </div>
    );
  }
  
  const { order, activities, token_symbol, token_decimals } = data;
  const isCompleted = parseFloat(order.remaining_amount) === 0;
  const exchangeRate = parseFloat(order.exchange_rate) / 100;
  
  // Determine display decimals based on token type:
  // - USDC (6): 2 decimals (e.g., 1.23)
  // - WETH (18): 4 decimals (e.g., 0.0016)
  // - cbBTC (8): 6 decimals (e.g., 0.000001)
  const displayDecimals = token_decimals === 6 ? 2 : token_decimals === 8 ? 6 : 4;
  
  // Full precision remaining for Max button and Available display
  const remainingExact = parseFloat(order.remaining_amount) / Math.pow(10, token_decimals);
  const remainingFull = remainingExact.toFixed(token_decimals).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  // Smart display decimals for main display
  const remainingFormatted = remainingExact.toFixed(displayDecimals);
  const totalExact = parseFloat(order.total_amount) / Math.pow(10, token_decimals);
  const totalFormatted = totalExact.toFixed(displayDecimals);
  const paymentRailName = order.rail === 0 ? tOrder('railAlipay') : tOrder('railWeChat');
  
  // Authorization check - only the seller can view this page
  if (!isSeller) {
    return (
      <div className="min-h-screen relative">
        <SciFiBackground />
        <div className="container mx-auto px-4 py-20 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto text-center"
          >
            <motion.div 
              className="w-20 h-20 mx-auto mb-8 rounded-2xl bg-red-500/10 border-2 border-red-300/40 flex items-center justify-center"
            >
              <Lock className="w-10 h-10 text-red-500" />
            </motion.div>
            <h1 className="text-2xl md:text-3xl font-bold mb-4 text-slate-800 dark:text-white">
              {tOrder('notAuthorized')}
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-400 mb-8">
              {tOrder('notAuthorizedDescription')}
            </p>
            <Button onClick={() => router.push('/account')} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {tOrder('backToAccount')}
            </Button>
          </motion.div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen relative">
      <SciFiBackground />
      <div className="container mx-auto px-4 py-6 sm:py-12 max-w-3xl relative z-10">
        {/* Back Button */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="mb-6"
        >
          <Button 
            onClick={() => router.push('/account')} 
            variant="ghost"
            className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {tOrder('backToAccount')}
          </Button>
        </motion.div>
        
        {/* Order Header Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="relative overflow-hidden bg-transparent backdrop-blur-sm border border-emerald-200/15 dark:border-emerald-500/15 shadow-[0_8px_32px_rgba(16,185,129,0.08)] hover:shadow-[0_12px_40px_rgba(16,185,129,0.12)] hover:border-emerald-300/20 dark:hover:border-emerald-400/20 mb-8 rounded-3xl transition-all duration-300">
            {/* Gradient accent line */}
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-400/60 via-teal-400/60 to-emerald-400/60" />
            
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-500/20 dark:to-emerald-500/10 flex items-center justify-center border border-emerald-200/50 dark:border-emerald-400/20">
                    <Store className="w-7 h-7 text-emerald-500" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-mono text-slate-700 dark:text-slate-300">
                      {tOrder('order')} {formatAddress(order.order_id)}
                    </CardTitle>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      {tOrder('created')} {formatTimestamp(order.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Public/Private Badge - Liquid Glass Effect */}
                  {order.is_public ? (
                    <span className="inline-flex items-center text-sm font-medium px-3 py-1.5 rounded-xl bg-transparent backdrop-blur-sm border border-emerald-400/20 text-emerald-600 dark:text-emerald-400 shadow-sm shadow-emerald-500/5">
                      <Globe className="w-4 h-4 mr-1.5" />
                      {tOrder('public')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-sm font-medium px-3 py-1.5 rounded-xl bg-transparent backdrop-blur-sm border border-purple-400/20 text-purple-600 dark:text-purple-400 shadow-sm shadow-purple-500/5">
                      <Lock className="w-4 h-4 mr-1.5" />
                      {tOrder('private')}
                    </span>
                  )}
                  
                  {/* Status Badge - Liquid Glass Effect */}
                  {isCompleted ? (
                    <span className="inline-flex items-center text-sm font-medium px-3 py-1.5 rounded-xl bg-transparent backdrop-blur-sm border border-slate-400/20 text-slate-500 dark:text-slate-400 shadow-sm shadow-slate-500/5">
                      <CheckCircle2 className="w-4 h-4 mr-1.5" />
                      {tOrder('completed')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-sm font-medium px-3 py-1.5 rounded-xl bg-transparent backdrop-blur-sm border border-blue-400/20 text-blue-600 dark:text-blue-400 shadow-sm shadow-blue-500/5">
                      <Clock className="w-4 h-4 mr-1.5" />
                      {tOrder('active')}
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>
            
            {/* Private Code Display (for private orders - seller only) */}
            {isSeller && !order.is_public && order.private_code && (
              <div className="px-6 pb-4">
                <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-50/80 to-purple-50/80 dark:from-indigo-950/30 dark:to-purple-950/30 border border-indigo-200/50 dark:border-indigo-500/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Lock className="h-4 w-4 text-indigo-500" />
                    <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                      {tOrder('privateCode')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl font-mono font-bold tracking-widest text-indigo-600 dark:text-indigo-400">
                      {order.private_code}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(order.private_code!);
                        setCodeCopied(true);
                        setTimeout(() => setCodeCopied(false), 2000);
                      }}
                      className="text-indigo-500 hover:text-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-900/30"
                    >
                      {codeCopied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    {tOrder('privateCodeNote')}
                  </p>
                </div>
              </div>
            )}
            
            <CardContent>
              <div className="space-y-3 p-3 sm:p-4 bg-white/20 dark:bg-slate-800/20 backdrop-blur-sm rounded-2xl border border-slate-200/10 dark:border-slate-600/10">
                {/* Line 1: Order Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{tOrder('totalLocked')}</p>
                    <p className="font-semibold text-sm sm:text-lg break-all">{totalFormatted} <span className="text-xs sm:text-base">{token_symbol}</span></p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{tOrder('remaining')}</p>
                    <p className="font-semibold text-sm sm:text-lg text-emerald-600 dark:text-emerald-400 break-all">
                      {remainingFormatted} <span className="text-xs sm:text-base">{token_symbol}</span>
                    </p>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <p className="text-xs text-slate-500 dark:text-slate-400">{tOrder('exchangeRate')}</p>
                    <p className="font-semibold text-sm sm:text-lg">¥{exchangeRate.toFixed(2)}/{token_symbol}</p>
                  </div>
                </div>
                
                {/* Line 2: Payment Rail */}
                <div className="pt-3 border-t border-slate-200/30 dark:border-slate-600/30">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{tOrder('paymentRail')}</p>
                  <p className="font-semibold text-lg">{paymentRailName}</p>
                </div>
                
                {/* Line 3: Payment ID and Name (seller only) */}
                {isSeller && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{tOrder('paymentId', { rail: paymentRailName })}</p>
                      <p className="font-semibold">{order.alipay_id}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{tOrder('paymentName', { rail: paymentRailName })}</p>
                      <p className="font-semibold">{order.alipay_name}</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
        
        {/* Manage Order Section - Only for seller */}
        {isSeller && !isCompleted && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mb-8"
          >
            <Card className="relative overflow-hidden bg-transparent backdrop-blur-sm border border-purple-200/15 dark:border-purple-500/15 shadow-[0_8px_32px_rgba(168,85,247,0.08)] hover:shadow-[0_12px_40px_rgba(168,85,247,0.12)] hover:border-purple-300/20 dark:hover:border-purple-400/20 rounded-3xl transition-all duration-300">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-400/60 via-pink-400/60 to-purple-400/60" />
              
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2 bg-gradient-to-r from-purple-600 via-purple-500 to-pink-500 bg-clip-text text-transparent">
                  <Pencil className="w-5 h-5 text-purple-500" />
                  {tOrder('manageOrder')}
                </CardTitle>
              </CardHeader>
              
              <CardContent className="space-y-6">
                {/* Success/Error Messages */}
                {withdrawStep === 'success' && (
                  <Alert className="bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-500/30">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <AlertDescription className="text-emerald-700 dark:text-emerald-300">
                      {tOrder('withdrawalSuccess')}{' '}
                      {withdrawTxHash && (
                        <a
                          href={getTransactionUrl(withdrawTxHash, data?.order?.chain_id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline inline-flex items-center"
                        >
                          {tOrder('viewOnExplorer')} <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
                
                {withdrawError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="flex items-center justify-between">
                      <span>{tOrder(`errors.${withdrawError}` as any) || tOrder('errors.unknown')}</span>
                      <Button onClick={resetWithdrawState} size="sm" variant="outline">{tOrder('dismiss')}</Button>
                    </AlertDescription>
                  </Alert>
                )}
                
                {rateStep === 'success' && (
                  <Alert className="bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-500/30">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <AlertDescription className="text-emerald-700 dark:text-emerald-300">
                      {tOrder('rateUpdateSuccess')}{' '}
                      {rateTxHash && (
                        <a
                          href={getTransactionUrl(rateTxHash, data?.order?.chain_id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline inline-flex items-center"
                        >
                          {tOrder('viewOnExplorer')} <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
                
                {rateError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="flex items-center justify-between">
                      <span>{tOrder(`errors.${rateError}` as any) || tOrder('errors.unknown')}</span>
                      <Button onClick={resetRateState} size="sm" variant="outline">{tOrder('dismiss')}</Button>
                    </AlertDescription>
                  </Alert>
                )}
                
                
                {/* Withdraw Section */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">{tOrder('withdrawTokens')}</Label>
                  <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      onWheel={(e) => (e.target as HTMLInputElement).blur()}
                      max={remainingFull}
                      step="any"
                      disabled={isWithdrawing}
                      className="h-11 flex-1 bg-white/30 dark:bg-slate-800/30 backdrop-blur-sm border-slate-200/30 dark:border-slate-600/30"
                    />
                    <Button
                      variant="outline"
                      onClick={() => setWithdrawAmount(remainingFull)}
                      disabled={isWithdrawing}
                      className="h-11 px-4"
                    >
                      {tOrder('max')}
                    </Button>
                    <Button
                      onClick={() => {
                        const tokenInfo = getTokenInfo(order.token);
                        executeWithdraw({
                          orderId: order.order_id,
                          amount: withdrawAmount,
                          tokenAddress: order.token,
                          tokenDecimals: tokenInfo.decimals,
                        });
                      }}
                      disabled={
                        isWithdrawing ||
                        !withdrawAmount ||
                        parseFloat(withdrawAmount) <= 0 ||
                        parseFloat(withdrawAmount) > remainingExact
                      }
                      className="h-11 px-5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded-xl"
                    >
                      {isWithdrawing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {withdrawStep === 'confirming' ? tOrder('confirming') : tOrder('signing')}
                        </>
                      ) : (
                        `${tOrder('withdraw')} ${token_symbol}`
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {tOrder('available')}: {remainingFull} {token_symbol}
                  </p>
                </div>
                
                {/* Update Exchange Rate Section */}
                <div className="space-y-3 pt-4 border-t border-slate-200/50 dark:border-slate-700/50">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">{tOrder('exchangeRate')}</Label>
                    {!isEditingRate && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsEditingRate(true)}
                        className="text-purple-600 hover:text-purple-700"
                      >
                        <Pencil className="w-3 h-3 mr-1" />
                        {tOrder('edit')}
                      </Button>
                    )}
                  </div>
                  
                  {isEditingRate ? (
                    <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">¥</span>
                        <Input
                          type="number"
                          value={newRate}
                          onChange={(e) => setNewRate(e.target.value)}
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          step="0.01"
                          min="0.01"
                          disabled={isUpdating}
                          className="h-11 pl-7 bg-white/30 dark:bg-slate-800/30 backdrop-blur-sm border-slate-200/30 dark:border-slate-600/30"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                          /{token_symbol}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsEditingRate(false);
                          setNewRate(exchangeRate.toFixed(2));
                        }}
                        disabled={isUpdating}
                        className="h-11"
                      >
                        {tOrder('cancel')}
                      </Button>
                      <Button
                        onClick={() => {
                          executeUpdateRate({
                            orderId: order.order_id,
                            newRate: newRate,
                          });
                        }}
                        disabled={
                          isUpdating ||
                          !newRate ||
                          parseFloat(newRate) <= 0 ||
                          parseFloat(newRate) === exchangeRate
                        }
                        className="h-11 px-5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl"
                      >
                        {isUpdating ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {rateStep === 'confirming' ? tOrder('confirming') : tOrder('signing')}
                          </>
                        ) : (
                          tOrder('updateRate')
                        )}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-lg font-semibold">¥{exchangeRate.toFixed(2)}/{token_symbol}</p>
                  )}
                </div>
                
              </CardContent>
            </Card>
          </motion.div>
        )}
        
        {/* Activity Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-4">{tOrder('activityTimeline')}</h2>
          
          {activities.length === 0 ? (
            <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border-slate-200/30 dark:border-slate-500/20 rounded-2xl">
              <CardContent className="py-8 text-center text-slate-500 dark:text-slate-400">
                {tOrder('noActivity')}
              </CardContent>
            </Card>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-6 top-2 bottom-2 w-0.5 bg-gradient-to-b from-emerald-400 via-purple-400 to-slate-200 dark:to-slate-700" />
              
              <div className="space-y-4">
                {activities.map((activity, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="relative pl-14"
                  >
                    {/* Timeline dot */}
                    <div className={`absolute left-4 top-4 w-4 h-4 rounded-full border-2 border-white dark:border-slate-900 shadow-md ${
                      activity.type === 'trade' ? 'bg-emerald-500' :
                      activity.type === 'pending_trade' ? 'bg-amber-500' :
                      activity.type === 'expired_trade' ? 'bg-slate-400' :
                      'bg-purple-500'
                    }`} />
                    
                    <Card className={`relative overflow-hidden bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-slate-200/30 dark:border-slate-500/20 rounded-2xl transition-all hover:shadow-lg ${
                      activity.type === 'trade' ? 'hover:border-emerald-300/50 dark:hover:border-emerald-500/30' :
                      activity.type === 'pending_trade' ? 'hover:border-amber-300/50 dark:hover:border-amber-500/30' :
                      activity.type === 'expired_trade' ? 'hover:border-slate-300/50 dark:hover:border-slate-500/30' :
                      'hover:border-purple-300/50 dark:hover:border-purple-500/30'
                    }`}>
                      {/* Left accent */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                        activity.type === 'trade' ? 'bg-emerald-400' :
                        activity.type === 'pending_trade' ? 'bg-amber-400' :
                        activity.type === 'expired_trade' ? 'bg-slate-400' :
                        'bg-purple-400'
                      }`} />
                      
                      <CardContent className="p-4">
                        {activity.type === 'trade' && (
                          <>
                            {/* Settled Trade Activity */}
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                  {tOrder('tradeSettled')}
                                </span>
                              </div>
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                {formatTimestamp(activity.settled_at)}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm">
                              <div className="flex flex-wrap items-baseline gap-1">
                                <span className="text-slate-500 dark:text-slate-400">{tOrder('tokensSold')}:</span>
                                <span className="font-semibold break-all">{activity.token_amount_formatted} {token_symbol}</span>
                              </div>
                              <div className="flex flex-wrap items-baseline gap-1">
                                <span className="text-slate-500 dark:text-slate-400">{tOrder('platformFee')}:</span>
                                <span className="font-semibold text-orange-600 dark:text-orange-400 break-all">-{activity.fee_amount_formatted} {token_symbol}</span>
                              </div>
                              <div className="flex flex-wrap items-baseline gap-1">
                                <span className="text-slate-500 dark:text-slate-400">{tOrder('cnyReceived')}:</span>
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{activity.cny_amount_formatted}</span>
                              </div>
                              <div className="flex flex-wrap items-baseline gap-1">
                                <span className="text-slate-500 dark:text-slate-400">{tOrder('buyer')}:</span>
                                <span className="font-mono text-xs">{formatAddress(activity.buyer)}</span>
                              </div>
                            </div>
                            {activity.settlement_tx && (
                              <a
                                href={getTransactionUrl(activity.settlement_tx, data?.order?.chain_id)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline mt-2"
                              >
                                <ExternalLink className="w-3 h-3" />
                                {tOrder('viewTransaction')}
                              </a>
                            )}
                          </>
                        )}
                        
                        {activity.type === 'pending_trade' && (
                          <>
                            {/* Pending Trade Activity */}
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <Timer className="w-5 h-5 text-amber-500" />
                                <span className="font-semibold text-amber-700 dark:text-amber-400">
                                  {tOrder('pendingTrade')}
                                </span>
                              </div>
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                {formatTimestamp(activity.created_at)}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm">
                              <div className="flex flex-wrap items-baseline gap-1">
                                <span className="text-slate-500 dark:text-slate-400">{tOrder('tokensLocked')}:</span>
                                <span className="font-semibold break-all">{activity.token_amount_formatted} {token_symbol}</span>
                              </div>
                              <div className="flex flex-wrap items-baseline gap-1">
                                <span className="text-slate-500 dark:text-slate-400">{tOrder('expectedPayment')}:</span>
                                <span className="font-semibold text-amber-600 dark:text-amber-400">{activity.cny_amount_formatted}</span>
                              </div>
                              <div className="flex flex-wrap items-baseline gap-1">
                                <span className="text-slate-500 dark:text-slate-400">{tOrder('buyer')}:</span>
                                <span className="font-mono text-xs">{formatAddress(activity.buyer)}</span>
                              </div>
                              <div className="flex flex-wrap items-baseline gap-1">
                                <span className="text-slate-500 dark:text-slate-400">{tOrder('expiresAt')}:</span>
                                <span className="font-semibold text-amber-600 dark:text-amber-400 text-xs">{formatTimestamp(activity.expires_at)}</span>
                              </div>
                            </div>
                          </>
                        )}
                        
                        {activity.type === 'expired_trade' && (
                          <>
                            {/* Expired Trade Activity */}
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <XCircle className="w-5 h-5 text-slate-400" />
                                <span className="font-semibold text-slate-600 dark:text-slate-400">
                                  {tOrder('expiredTrade')}
                                </span>
                              </div>
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                {formatTimestamp(activity.expired_at)}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm">
                              <div className="flex flex-wrap items-baseline gap-1">
                                <span className="text-slate-500 dark:text-slate-400">{tOrder('tokensReturned')}:</span>
                                <span className="font-semibold break-all">{activity.token_amount_formatted} {token_symbol}</span>
                              </div>
                              <div className="flex flex-wrap items-baseline gap-1">
                                <span className="text-slate-500 dark:text-slate-400">{tOrder('unpaidAmount')}:</span>
                                <span className="font-semibold text-slate-500">{activity.cny_amount_formatted}</span>
                              </div>
                              <div className="flex flex-wrap items-baseline gap-1">
                                <span className="text-slate-500 dark:text-slate-400">{tOrder('buyer')}:</span>
                                <span className="font-mono text-xs">{formatAddress(activity.buyer)}</span>
                              </div>
                            </div>
                          </>
                        )}
                        
                        {activity.type === 'withdrawal' && (
                          <>
                            {/* Withdrawal Activity */}
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <ArrowDownLeft className="w-5 h-5 text-purple-500" />
                                <span className="font-semibold text-purple-700 dark:text-purple-400">
                                  {tOrder('withdrawal')}
                                </span>
                              </div>
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                {formatTimestamp(activity.created_at)}
                              </span>
                            </div>
                            <div className="text-xs sm:text-sm">
                              <div className="flex flex-wrap items-baseline gap-1">
                                <span className="text-slate-500 dark:text-slate-400">{tOrder('amountWithdrawn')}:</span>
                                <span className="font-semibold text-purple-600 dark:text-purple-400 break-all">
                                  {activity.amount_formatted} {token_symbol}
                                </span>
                              </div>
                            </div>
                            {activity.tx_hash && (
                              <a
                                href={getTransactionUrl(activity.tx_hash, data?.order?.chain_id)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline mt-2"
                              >
                                <ExternalLink className="w-3 h-3" />
                                {tOrder('viewTransaction')}
                              </a>
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
