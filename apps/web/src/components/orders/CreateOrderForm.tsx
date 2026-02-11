'use client';

import { useState, useEffect } from 'react';
import { useBalance } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { useChainGuard } from '@/hooks/useChainGuard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2, AlertCircle, ExternalLink, Coins, TrendingUp, Wallet, Globe, Lock, Copy, Check, Info } from 'lucide-react';
import { useCreateOrder, CreateOrderParams } from '@/hooks/useCreateOrder';
import { getTokenInfo, type TokenInfo, getSupportedTokensForChain, getFeeDisplayWithEquivalent, CHAIN_IDS } from '@/lib/tokens';
import { PAYMENT_RAIL, PaymentRail, getTransactionUrl, getChainName, getEscrowAddress } from '@/lib/contracts';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { CreditCard, Network } from 'lucide-react';
import { NetworkBadge } from '@/components/WalletButton';
import { ConnectWalletButton } from '@/components/WalletButton';
import { api } from '@/lib/api';

interface CreateOrderFormProps {
  onSwitchToManage?: () => void;
}

export function CreateOrderForm({ onSwitchToManage }: CreateOrderFormProps = {}) {
  const { 
    address, 
    isConnected, 
    isWrongChain, 
    canInteract, 
    chainId: walletChainId,
    switchToChain,
    isSwitching,
  } = useChainGuard();
  const t = useTranslations('sell.createOrder');
  
  // Chain selection - default to Base
  const [selectedChainId, setSelectedChainId] = useState<number>(CHAIN_IDS.BASE_MAINNET);
  const chainTokens = getSupportedTokensForChain(selectedChainId);
  
  const [selectedToken, setSelectedToken] = useState<string>(chainTokens[0]);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo>(getTokenInfo(chainTokens[0]));
  
  // When chain changes, reset token to first token of new chain
  useEffect(() => {
    const newTokens = getSupportedTokensForChain(selectedChainId);
    setSelectedToken(newTokens[0]);
    setTokenInfo(getTokenInfo(newTokens[0]));
    setAmount('');
  }, [selectedChainId]);
  
  // Check if wallet is on the selected chain
  const isOnSelectedChain = walletChainId === selectedChainId;
  
  const { data: tokenBalance } = useBalance({
    address: address,
    token: selectedToken as `0x${string}`,
    chainId: selectedChainId,
  });

  const [amount, setAmount] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [paymentRail, setPaymentRail] = useState<PaymentRail>(PAYMENT_RAIL.ALIPAY);
  const [accountId, setAccountId] = useState('');
  const [accountName, setAccountName] = useState('');
  const [orderParams, setOrderParams] = useState<CreateOrderParams | null>(null);
  
  // Private listing mode
  const [isPublicListing, setIsPublicListing] = useState(true);
  const [privateCode, setPrivateCode] = useState<string | null>(null);
  const [isSettingVisibility, setIsSettingVisibility] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  
  // Fee info tooltip
  const [showFeeInfo, setShowFeeInfo] = useState(false);

  const {
    executeCreateOrder,
    handleCreateSuccess,
    resetState,
    currentStep,
    isApproving,
    isCreating,
    errorCode,
    orderId,
    approveHash,
    createHash,
    isApproveSuccess,
    isCreateSuccess,
  } = useCreateOrder();

  // Update token info when token selection changes
  useEffect(() => {
    setTokenInfo(getTokenInfo(selectedToken));
  }, [selectedToken]);

  // NOTE: Approval success → create order transition is handled internally
  // by the useCreateOrder hook (including USDT two-step approval).

  // Handle create success
  useEffect(() => {
    if (isCreateSuccess && currentStep === 'creating') {
      handleCreateSuccess();
    }
  }, [isCreateSuccess, currentStep, handleCreateSuccess]);

  // Scroll to top when order is successfully created
  useEffect(() => {
    if (currentStep === 'success') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentStep]);

  // Set visibility AFTER orderId is available (separate effect to handle race condition)
  // This also triggers the order creation email on the backend
  useEffect(() => {
    if (orderId && currentStep === 'success') {
      setIsSettingVisibility(true);
      
      // Helper function to attempt setting visibility with retries
      const setVisibilityWithRetry = async (retriesLeft: number, delayMs: number) => {
        try {
          // Always call setOrderVisibility - this also sends the order creation email
          const response = await api.setOrderVisibility(orderId, isPublicListing);
          if (response.private_code) {
            setPrivateCode(response.private_code);
          }
          setIsSettingVisibility(false);
        } catch (err) {
          console.error(`Failed to set order visibility (${retriesLeft} retries left):`, err);
          if (retriesLeft > 0) {
            // Wait and retry - order might not be synced to DB yet
            setTimeout(() => setVisibilityWithRetry(retriesLeft - 1, delayMs * 1.5), delayMs);
          } else {
            console.error('All retries exhausted for setting visibility');
            setIsSettingVisibility(false);
          }
        }
      };
      
      // Wait 2 seconds for backend to sync the order, then try up to 3 times
      setTimeout(() => setVisibilityWithRetry(3, 2000), 2000);
    }
  }, [orderId, isPublicListing, currentStep]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Block submission if wallet not on selected chain
    if (!isOnSelectedChain) {
      console.warn('Wallet not on selected chain. Switching...');
      switchToChain(selectedChainId);
      return;
    }
    
    // Block submission if on unsupported network
    if (isWrongChain || !canInteract) {
      console.warn('Cannot submit: wrong network or not connected.');
      switchToChain(selectedChainId);
      return;
    }
    
    if (!amount || !exchangeRate || !accountId || !accountName) {
      return;
    }

    // Convert exchange rate from human format (7.30) to cents (730)
    const rateInCents = Math.round(parseFloat(exchangeRate) * 100).toString();

    const params: CreateOrderParams = {
      tokenAddress: selectedToken,
      tokenDecimals: tokenInfo.decimals,
      amount,
      exchangeRate: rateInCents,
      rail: paymentRail,
      accountId,
      accountName,
      isPublic: isPublicListing,  // v4: public/private flag
      chainId: selectedChainId,   // multi-chain support
    };

    setOrderParams(params);
    await executeCreateOrder(params);
  };

  const calculateCnyAmount = () => {
    if (!amount || !exchangeRate) return { gross: '0.00' };
    const tokenAmount = parseFloat(amount);
    const rate = parseFloat(exchangeRate);
    const gross = tokenAmount * rate;
    return {
      gross: gross.toFixed(2),
    };
  };

  const isFormValid = () => {
    // Block form if not on correct chain or wallet not on selected chain
    if (!canInteract || !isOnSelectedChain) return false;
    if (!amount || !exchangeRate || !accountId || !accountName) return false;
    if (parseFloat(amount) <= 0 || parseFloat(exchangeRate) <= 0) return false;
    if (tokenBalance && parseUnits(amount, tokenInfo.decimals) > tokenBalance.value) return false;
    return true;
  };

  if (!isConnected) {
    return (
      <Card className="relative overflow-hidden bg-transparent backdrop-blur-sm border border-purple-200/15 dark:border-purple-500/10 rounded-3xl">
        {/* Top accent line - whisper thin */}
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-purple-400/30 to-transparent" />
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 w-16 h-16 md:w-20 md:h-20 bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-500/20 dark:to-purple-500/10 rounded-2xl flex items-center justify-center border-2 border-purple-200/50 dark:border-purple-400/30">
            <Wallet className="h-8 w-8 md:h-10 md:w-10 text-purple-500" />
          </div>
          <CardTitle className="text-xl md:text-2xl bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent">{t('connectWallet.title')}</CardTitle>
          <CardDescription className="text-sm md:text-base text-slate-600 dark:text-slate-400">
            {t('connectWallet.subtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center">
          {/* Prominent Connect Button */}
          <div className="w-full flex justify-center">
            <ConnectWalletButton />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (currentStep === 'success') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="relative overflow-hidden bg-transparent backdrop-blur-sm border border-emerald-200/15 dark:border-emerald-500/10 rounded-3xl">
          {/* Top accent line - whisper thin */}
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent" />
          <CardContent className="pt-12 pb-12 text-center space-y-6">
            {/* Success Icon */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="mx-auto w-20 h-20 bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-500/20 dark:to-emerald-500/10 rounded-full flex items-center justify-center border-2 border-emerald-200/50 dark:border-emerald-400/30"
            >
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            </motion.div>

            {/* Success Message */}
            <div>
              <h2 className="text-3xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 dark:from-emerald-400 dark:via-green-400 dark:to-teal-400">
                {t('success.title')}
              </h2>
              <p className="text-slate-600 dark:text-slate-400">
                {isPublicListing ? t('success.subtitle') : t('success.subtitlePrivate')}
              </p>
            </div>

            {/* Private Code Display */}
            {!isPublicListing && (privateCode || isSettingVisibility) && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-gradient-to-r from-indigo-50/80 to-purple-50/80 dark:from-indigo-950/30 dark:to-purple-950/30 rounded-2xl p-6 border border-indigo-200/50 dark:border-indigo-500/30"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Lock className="h-5 w-5 text-indigo-500" />
                  <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                    {t('success.privateCode')}
                  </span>
                </div>
                {isSettingVisibility ? (
                  <div className="flex items-center gap-2 text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t('success.generatingCode')}</span>
                  </div>
                ) : privateCode ? (
                  <>
                    <div className="flex items-center gap-3 justify-center mb-3">
                      <span className="text-4xl font-mono font-bold tracking-widest text-indigo-600 dark:text-indigo-400">
                        {privateCode}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(privateCode);
                          setCodeCopied(true);
                          setTimeout(() => setCodeCopied(false), 2000);
                        }}
                        className="text-indigo-500 hover:text-indigo-600"
                      >
                        {codeCopied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                      </Button>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
                      {t('success.privateCodeNote')}
                    </p>
                  </>
                ) : null}
              </motion.div>
            )}

            {/* Order Details */}
            <div className="bg-white/5 dark:bg-slate-800/10 backdrop-blur-sm rounded-2xl p-6 border border-purple-200/15 dark:border-purple-500/10">
              <div className="space-y-3 text-left">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600 dark:text-slate-400">{t('success.amount')}</span>
                  <span className="font-semibold text-slate-800 dark:text-white">
                    {amount} {tokenInfo.symbol}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600 dark:text-slate-400">{t('success.rate')}</span>
                  <span className="font-semibold text-slate-800 dark:text-white">
                    ¥{exchangeRate}/{tokenInfo.symbol}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600 dark:text-slate-400">{t('success.totalValue')}</span>
                  <span className="font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    ¥{calculateCnyAmount().gross} {t('success.cny') || 'CNY'}
                  </span>
                </div>
              </div>
            </div>

            {/* Transaction Hash */}
            {createHash && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('success.txHash')}</p>
                <div className="bg-slate-100/80 dark:bg-slate-800/80 rounded-xl p-3 border border-slate-200/50 dark:border-slate-700/50">
                  <p className="text-xs font-mono break-all text-slate-600 dark:text-slate-400">{createHash}</p>
                </div>
                <Button
                  variant="outline"
                  className="w-full border-purple-200/50 hover:border-purple-300/70 hover:bg-purple-50/50 dark:border-purple-500/30 dark:hover:border-purple-400/50 dark:hover:bg-purple-900/20 rounded-xl"
                  onClick={() => window.open(getTransactionUrl(createHash, selectedChainId), '_blank')}
                >
                  <ExternalLink className="mr-2 h-4 w-4 text-purple-500" />
                  {t('success.viewOnBaseScan')}
                </Button>
              </div>
            )}

            {/* Info Alert */}
            <Alert className="border-purple-200/15 dark:border-purple-700/10 bg-transparent rounded-2xl">
              <AlertDescription className="text-sm text-center text-slate-600 dark:text-slate-400">
                {t('success.info')}
                <br />
                <strong className="text-purple-600 dark:text-purple-400">{t('success.infoTime')}</strong>
              </AlertDescription>
            </Alert>

            {/* Action Buttons - stack on mobile, side by side on desktop */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button
                variant="outline"
                className="flex-1 border-purple-200/50 hover:border-purple-300/70 hover:bg-purple-50/50 dark:border-purple-500/30 dark:hover:border-purple-400/50 dark:hover:bg-purple-900/20 rounded-xl"
                onClick={() => onSwitchToManage && onSwitchToManage()}
              >
                {t('success.viewMyOrders')}
              </Button>
              <Button
                className="flex-1 bg-gradient-to-r from-blue-400/80 via-purple-400/80 to-pink-400/80 hover:from-blue-500/85 hover:via-purple-500/85 hover:to-pink-500/85 text-sm sm:text-base font-medium rounded-xl shadow-md shadow-purple-400/10 hover:shadow-purple-400/20 transition-all duration-300"
                onClick={() => {
                  resetState();
                  setAmount('');
                  setExchangeRate('');
                  setPaymentRail(PAYMENT_RAIL.ALIPAY);
                  setAccountId('');
                  setAccountName('');
                  setOrderParams(null);
                  setIsPublicListing(true);
                  setPrivateCode(null);
                  setCodeCopied(false);
                  setSelectedChainId(CHAIN_IDS.BASE_MAINNET);
                }}
              >
                {t('success.createAnother')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <Card className="relative overflow-hidden bg-transparent backdrop-blur-sm border border-purple-200/15 dark:border-purple-500/10 rounded-3xl">
      {/* Top accent line - whisper thin */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-purple-400/30 to-transparent" />
      <CardHeader className="pb-6">
        <CardTitle className="text-2xl bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent">{t('title')}</CardTitle>
        <CardDescription className="text-base text-slate-600 dark:text-slate-400">
          {t('subtitle')}
        </CardDescription>
        
        {/* Network Badge with wrong network warning */}
        <NetworkBadge className="mt-3" />
      </CardHeader>
      
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Section 0: Select Network */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="relative space-y-4 p-6 bg-transparent rounded-2xl border border-cyan-200/15 dark:border-cyan-500/10"
          >
            {/* Left accent bar */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-cyan-400/60 via-cyan-300/40 to-cyan-400/60 rounded-l-2xl" />
            <div className="flex items-center gap-3 mb-4 pl-2">
              <div className="w-10 h-10 bg-gradient-to-br from-cyan-100 to-cyan-50 dark:from-cyan-500/20 dark:to-cyan-500/10 rounded-xl flex items-center justify-center border border-cyan-200/50 dark:border-cyan-400/30">
                <Network className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
              </div>
              <div>
                <h3 className="font-semibold text-lg flex items-center gap-2 text-slate-800 dark:text-white">
                  {t('section0.title') || 'Select Network'}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">{t('section0.subtitle') || 'Choose which blockchain to create your order on'}</p>
              </div>
            </div>

            <div className="flex gap-3 pl-2">
              <button
                type="button"
                onClick={() => setSelectedChainId(CHAIN_IDS.BASE_MAINNET)}
                disabled={currentStep !== 'idle'}
                className={`flex-1 p-4 rounded-xl border-2 transition-all duration-200 ${
                  selectedChainId === CHAIN_IDS.BASE_MAINNET
                    ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-500/10 ring-2 ring-blue-200/50 dark:ring-blue-500/30'
                    : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500/50'
                }`}
              >
                <div className="flex items-center gap-3 justify-center">
                  <div className={`w-3 h-3 rounded-full ${selectedChainId === CHAIN_IDS.BASE_MAINNET ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                  <div className="text-left">
                    <p className={`font-semibold ${selectedChainId === CHAIN_IDS.BASE_MAINNET ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300'}`}>
                      {t('section0.base')}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('section0.baseSub')}</p>
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setSelectedChainId(CHAIN_IDS.ETH_MAINNET)}
                disabled={currentStep !== 'idle'}
                className={`flex-1 p-4 rounded-xl border-2 transition-all duration-200 ${
                  selectedChainId === CHAIN_IDS.ETH_MAINNET
                    ? 'border-purple-400 bg-purple-50/50 dark:bg-purple-500/10 ring-2 ring-purple-200/50 dark:ring-purple-500/30'
                    : 'border-slate-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-500/50'
                }`}
              >
                <div className="flex items-center gap-3 justify-center">
                  <div className={`w-3 h-3 rounded-full ${selectedChainId === CHAIN_IDS.ETH_MAINNET ? 'bg-purple-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                  <div className="text-left">
                    <p className={`font-semibold ${selectedChainId === CHAIN_IDS.ETH_MAINNET ? 'text-purple-700 dark:text-purple-300' : 'text-slate-700 dark:text-slate-300'}`}>
                      {t('section0.eth')}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('section0.ethSub')}</p>
                  </div>
                </div>
              </button>
            </div>

            {/* Prompt to switch wallet if on wrong chain */}
            {isConnected && !isOnSelectedChain && (
              <Alert className="border-amber-200/50 dark:border-amber-700/50 bg-gradient-to-r from-amber-50/80 to-orange-50/80 dark:from-amber-950/30 dark:to-orange-950/30 rounded-xl ml-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <AlertDescription className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
                  {t('section0.switchNetwork')}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => switchToChain(selectedChainId)}
                    disabled={isSwitching}
                    className="ml-2 border-amber-300 hover:bg-amber-100 dark:border-amber-600 dark:hover:bg-amber-900/30 text-xs"
                  >
                    {isSwitching ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    {t('section0.switch')}
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </motion.div>

          {/* Section 1: What are you selling? */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="relative space-y-4 p-6 bg-transparent rounded-2xl border border-blue-200/15 dark:border-blue-500/10"
          >
            {/* Left accent bar */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-400/60 via-blue-300/40 to-blue-400/60 rounded-l-2xl" />
            <div className="flex items-center gap-3 mb-4 pl-2">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-500/20 dark:to-blue-500/10 rounded-xl flex items-center justify-center border border-blue-200/50 dark:border-blue-400/30">
                <span className="text-blue-600 dark:text-blue-400 font-bold">1</span>
              </div>
              <div>
                <h3 className="font-semibold text-lg flex items-center gap-2 text-slate-800 dark:text-white">
                  <Coins className="h-5 w-5 text-blue-500" />
                  {t('section1.title')}
                </h3>
              </div>
            </div>

            {/* Token Selection */}
            <div className="space-y-2 pl-2">
              <Label htmlFor="token" className="text-slate-700 dark:text-slate-300">{t('section1.selectToken')}</Label>
              <Select
                value={selectedToken}
                onValueChange={(value) => {
                  setSelectedToken(value);
                  setAmount('');
                }}
                disabled={currentStep !== 'idle'}
              >
                <SelectTrigger id="token" className="h-12 rounded-xl border-slate-200 dark:border-slate-700 focus:border-blue-300 focus:ring-blue-200/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {chainTokens.map((tokenAddr) => {
                    const info = getTokenInfo(tokenAddr);
                    return (
                      <SelectItem key={tokenAddr} value={tokenAddr}>
                        {info.symbol} - {info.name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Amount Input */}
            <div className="space-y-2 pl-2">
              <Label htmlFor="amount" className="text-slate-700 dark:text-slate-300">{tokenInfo.symbol} {t('section1.amount')}</Label>
              <Input
                id="amount"
                type="number"
                step="any"
                placeholder="100.00"
                value={amount}
                onChange={(e) => {
                  const value = e.target.value;
                  // Allow clearing the field
                  if (value === '') {
                    setAmount('');
                    return;
                  }
                  // Parse the input value
                  const numValue = parseFloat(value);
                  // Prevent negative numbers
                  if (numValue < 0) return;
                  // Cap at max balance if it exceeds
                  if (tokenBalance && numValue > 0) {
                    try {
                      const inputUnits = parseUnits(value, tokenInfo.decimals);
                      if (inputUnits > tokenBalance.value) {
                        // Cap to max balance
                        setAmount(formatUnits(tokenBalance.value, tokenInfo.decimals));
                        return;
                      }
                    } catch {
                      // If parsing fails, still set the value for UX
                    }
                  }
                  setAmount(value);
                }}
                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                disabled={currentStep !== 'idle'}
                className="h-12 text-lg rounded-xl border-slate-200 dark:border-slate-700 focus:border-blue-300 focus:ring-blue-200/50"
              />
              {tokenBalance && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t('section1.balance')} <strong className="text-slate-700 dark:text-slate-300">{formatUnits(tokenBalance.value, tokenInfo.decimals)} {tokenInfo.symbol}</strong>
                </p>
              )}
            </div>
          </motion.div>

          {/* Section 2: Your exchange rate */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="relative space-y-4 p-6 bg-transparent rounded-2xl border border-purple-200/15 dark:border-purple-500/10"
          >
            {/* Left accent bar */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-purple-400/60 via-purple-300/40 to-purple-400/60 rounded-l-2xl" />
            <div className="flex items-center gap-3 mb-4 pl-2">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-500/20 dark:to-purple-500/10 rounded-xl flex items-center justify-center border border-purple-200/50 dark:border-purple-400/30">
                <span className="text-purple-600 dark:text-purple-400 font-bold">2</span>
              </div>
              <div>
                <h3 className="font-semibold text-lg flex items-center gap-2 text-slate-800 dark:text-white">
                  <TrendingUp className="h-5 w-5 text-purple-500" />
                  {t('section2.title')}
                </h3>
              </div>
            </div>

            <div className="space-y-2 pl-2">
              <Label htmlFor="exchangeRate" className="text-slate-700 dark:text-slate-300">{t('section2.exchangeRate', { symbol: tokenInfo.symbol })}</Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-purple-500 text-lg font-semibold">¥</span>
                <Input
                  id="exchangeRate"
                  type="number"
                  step="0.01"
                  placeholder="7.30"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  onWheel={(e) => (e.target as HTMLInputElement).blur()}
                  disabled={currentStep !== 'idle'}
                  className="h-12 text-lg pl-9 rounded-xl border-slate-200 dark:border-slate-700 focus:border-purple-300 focus:ring-purple-200/50"
                />
              </div>
              {amount && exchangeRate && (() => {
                const amounts = calculateCnyAmount();
                // Get flat fee display with USDC equivalent
                const feeInfo = getFeeDisplayWithEquivalent(selectedToken, isPublicListing, selectedChainId);
                return (
                  <div className="mt-3 p-4 bg-gradient-to-br from-white/80 via-emerald-50/50 to-white/60 dark:from-slate-800/50 dark:via-emerald-900/20 dark:to-slate-800/40 rounded-xl border border-emerald-200/40 dark:border-emerald-500/20 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600 dark:text-slate-400">{t('section2.totalValue')}</span>
                      <span className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent">
                        ¥{amounts.gross} <span className="text-base font-normal">{t('section2.cny')}</span>
                      </span>
                    </div>
                    <div className="border-t border-emerald-200/40 dark:border-emerald-500/20 pt-2">
                      <div className="flex justify-between items-center text-sm relative">
                        <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1">
                          {t('section2.platformFeeFlat')}
                          <button
                            type="button"
                            onClick={() => setShowFeeInfo(!showFeeInfo)}
                            className="text-slate-400 hover:text-purple-500 transition-colors"
                          >
                            <Info className="h-4 w-4" />
                          </button>
                        </span>
                        <span className="font-medium text-amber-600 dark:text-amber-400">
                          {feeInfo.isUsdc ? (
                            <>{feeInfo.feeAmount} USDC</>
                          ) : (
                            <>{feeInfo.feeAmount} {feeInfo.feeSymbol} ≈ {feeInfo.usdcEquivalent} USDC</>
                          )}
                        </span>
                      </div>
                      {/* Fee info tooltip */}
                      {showFeeInfo && (
                        <div className="mt-2 p-3 bg-slate-100/80 dark:bg-slate-800/80 rounded-lg text-xs text-slate-600 dark:text-slate-400 space-y-1">
                          <p>{t('section2.feeExplanation1')}</p>
                          <p>{t('section2.feeExplanation2')}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </motion.div>

          {/* Section 3: How buyers will pay you */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="relative space-y-4 p-6 bg-transparent rounded-2xl border border-pink-200/15 dark:border-pink-500/10"
          >
            {/* Left accent bar */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-pink-400/60 via-pink-300/40 to-pink-400/60 rounded-l-2xl" />
            <div className="flex items-center gap-3 mb-4 pl-2">
              <div className="w-10 h-10 bg-gradient-to-br from-pink-100 to-pink-50 dark:from-pink-500/20 dark:to-pink-500/10 rounded-xl flex items-center justify-center border border-pink-200/50 dark:border-pink-400/30">
                <span className="text-pink-600 dark:text-pink-400 font-bold">3</span>
              </div>
              <div>
                <h3 className="font-semibold text-lg flex items-center gap-2 text-slate-800 dark:text-white">
                  <CreditCard className="h-5 w-5 text-pink-500" />
                  {t('section3.title')}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">{t('section3.subtitle')}</p>
              </div>
            </div>

            {/* Payment Rail Selection */}
            <div className="space-y-2 pl-2">
              <Label className="text-slate-700 dark:text-slate-300">{t('section3.paymentRail')}</Label>
              <div className="flex gap-3">
                {/* Force light mode for payment icons - logos look better on white */}
                <button
                  type="button"
                  onClick={() => setPaymentRail(PAYMENT_RAIL.ALIPAY)}
                  disabled={currentStep !== 'idle'}
                  className={`flex-1 h-20 rounded-xl border-2 transition-all duration-300 overflow-hidden bg-white ${
                    paymentRail === PAYMENT_RAIL.ALIPAY
                      ? 'border-purple-400 ring-2 ring-purple-200/50 shadow-lg shadow-purple-500/10'
                      : 'border-slate-200 hover:border-purple-300 hover:shadow-md'
                  }`}
                >
                  <div className="w-full h-full flex items-center justify-center p-3">
                    <img 
                      src="/alipay-logo.svg" 
                      alt="Alipay" 
                      className="h-full w-auto object-contain max-h-12"
                    />
                  </div>
                </button>
                <button
                  type="button"
                  disabled={true}
                  className="flex-1 h-20 rounded-xl border-2 transition-all duration-200 border-slate-200 bg-white cursor-not-allowed relative overflow-hidden"
                >
                  <div className="w-full h-full flex items-center justify-center p-3 opacity-50">
                    <img 
                      src="/wechat-pay-icon.png" 
                      alt="WeChat Pay" 
                      className="h-full w-auto object-contain max-h-12"
                    />
                  </div>
                  <span className="absolute top-1 right-1 px-2 py-0.5 text-xs font-semibold bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700 rounded-full border border-amber-200/50">
                    {t('section3.comingSoon')}
                  </span>
                </button>
              </div>
            </div>

            {/* Account ID - Alipay specific */}
            <div className="space-y-2 pl-2">
              <Label htmlFor="accountId" className="text-slate-700 dark:text-slate-300">{t('section3.alipayId')}</Label>
              <Input
                id="accountId"
                type="text"
                placeholder={t('section3.alipayIdPlaceholder')}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                disabled={currentStep !== 'idle'}
                className="h-12 rounded-xl border-slate-200 dark:border-slate-700 focus:border-pink-300 focus:ring-pink-200/50"
              />
            </div>

            {/* Recipient Name - Alipay specific */}
            <div className="space-y-2 pl-2">
              <Label htmlFor="accountName" className="text-slate-700 dark:text-slate-300">{t('section3.alipayRecipientName')}</Label>
              <Input
                id="accountName"
                type="text"
                placeholder={t('section3.alipayRecipientNamePlaceholder')}
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                disabled={currentStep !== 'idle'}
                className="h-12 rounded-xl border-slate-200 dark:border-slate-700 focus:border-pink-300 focus:ring-pink-200/50"
              />
            </div>
          </motion.div>

          {/* Section 4: Listing Mode */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="relative space-y-4 p-6 bg-transparent rounded-2xl border border-indigo-200/15 dark:border-indigo-500/10"
          >
            {/* Left accent bar */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-400/60 via-indigo-300/40 to-indigo-400/60 rounded-l-2xl" />
            <div className="flex items-center gap-3 mb-4 pl-2">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-100 to-indigo-50 dark:from-indigo-500/20 dark:to-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-200/50 dark:border-indigo-400/30">
                <span className="text-indigo-600 dark:text-indigo-400 font-bold">4</span>
              </div>
              <div>
                <h3 className="font-semibold text-lg flex items-center gap-2 text-slate-800 dark:text-white">
                  {isPublicListing ? <Globe className="h-5 w-5 text-indigo-500" /> : <Lock className="h-5 w-5 text-indigo-500" />}
                  {t('section4.title')}
                </h3>
              </div>
            </div>

            {/* Listing Mode Toggle */}
            <div className="space-y-3 pl-2">
              <Label className="text-slate-700 dark:text-slate-300">{t('section4.listingMode')}</Label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsPublicListing(true)}
                  disabled={currentStep !== 'idle'}
                  className={`flex-1 p-4 rounded-xl border-2 transition-all duration-200 ${
                    isPublicListing
                      ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-500/10 ring-2 ring-indigo-200/50 dark:ring-indigo-500/30'
                      : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Globe className={`h-6 w-6 ${isPublicListing ? 'text-indigo-500' : 'text-slate-400'}`} />
                    <div className="text-left">
                      <p className={`font-medium ${isPublicListing ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'}`}>
                        {t('section4.public')}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t('section4.publicDesc')}
                      </p>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPublicListing(false)}
                  disabled={currentStep !== 'idle'}
                  className={`flex-1 p-4 rounded-xl border-2 transition-all duration-200 ${
                    !isPublicListing
                      ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-500/10 ring-2 ring-indigo-200/50 dark:ring-indigo-500/30'
                      : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Lock className={`h-6 w-6 ${!isPublicListing ? 'text-indigo-500' : 'text-slate-400'}`} />
                    <div className="text-left">
                      <p className={`font-medium ${!isPublicListing ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'}`}>
                        {t('section4.private')}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t('section4.privateDesc')}
                      </p>
                    </div>
                  </div>
                </button>
              </div>
              {!isPublicListing && (
                <Alert className="border-indigo-200/50 dark:border-indigo-700/50 bg-gradient-to-r from-indigo-50/80 to-purple-50/80 dark:from-indigo-950/30 dark:to-purple-950/30 rounded-xl">
                  <Lock className="h-4 w-4 text-indigo-500" />
                  <AlertDescription className="text-sm text-slate-600 dark:text-slate-400">
                    {t('section4.privateNote')}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </motion.div>

          {/* Error Display */}
          {errorCode && (
            <Alert variant="destructive" className="rounded-xl border-red-200/50 dark:border-red-700/50 bg-gradient-to-r from-red-50/80 to-pink-50/80 dark:from-red-950/30 dark:to-pink-950/30">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <AlertDescription className="text-red-700 dark:text-red-400">
                {t(`errors.${errorCode}` as any) || t('errors.unknown')}
              </AlertDescription>
            </Alert>
          )}

          {/* Transaction Status */}
          {currentStep === 'approving' && (
            <Alert className="border-purple-200/50 dark:border-purple-700/50 bg-gradient-to-r from-purple-50/80 to-blue-50/80 dark:from-purple-950/30 dark:to-blue-950/30 rounded-xl">
              <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
              <AlertDescription className="text-slate-700 dark:text-slate-300">
                {t.rich('steps.approving', {
                  symbol: tokenInfo.symbol,
                  strong: (chunks) => <strong className="font-semibold text-purple-600 dark:text-purple-400">{chunks}</strong>
                })}
                {approveHash && (
                  <span className="text-xs mt-1 font-mono block text-slate-500">{t('steps.transaction')} {approveHash.slice(0, 10)}...</span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {currentStep === 'creating' && (
            <Alert className="border-purple-200/50 dark:border-purple-700/50 bg-gradient-to-r from-purple-50/80 to-blue-50/80 dark:from-purple-950/30 dark:to-blue-950/30 rounded-xl">
              <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
              <AlertDescription className="text-slate-700 dark:text-slate-300">
                {t.rich('steps.creating', {
                  strong: (chunks) => <strong className="font-semibold text-purple-600 dark:text-purple-400">{chunks}</strong>
                })}
                {createHash && (
                  <span className="text-xs mt-1 font-mono block text-slate-500">{t('steps.transaction')} {createHash.slice(0, 10)}...</span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full h-14 text-lg font-medium bg-gradient-to-r from-blue-400/80 via-purple-400/80 to-pink-400/80 hover:from-blue-500/85 hover:via-purple-500/85 hover:to-pink-500/85 shadow-md shadow-purple-400/10 hover:shadow-purple-400/20 transition-all duration-300 rounded-xl"
            disabled={!isFormValid() || currentStep !== 'idle'}
          >
            {currentStep === 'idle' && t('buttons.createOrder')}
            {currentStep === 'approving' && (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {t('buttons.approving', { symbol: tokenInfo.symbol })}
              </>
            )}
            {currentStep === 'creating' && (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {t('buttons.creating')}
              </>
            )}
          </Button>

          {/* Info Box */}
          <Alert className="border-slate-200/50 dark:border-slate-700/50 bg-gradient-to-r from-slate-50/80 to-purple-50/30 dark:from-slate-800/30 dark:to-purple-900/10 rounded-xl">
            <AlertDescription className="text-sm text-slate-600 dark:text-slate-400">
              <strong className="text-slate-700 dark:text-slate-300">{t('note.title')}</strong> {t('note.description')}
              <ol className="list-decimal list-inside mt-2 space-y-1 ml-2">
                <li>{t('note.step1', { symbol: tokenInfo.symbol })}</li>
                <li>{t('note.step2')}</li>
              </ol>
            </AlertDescription>
          </Alert>
        </form>
      </CardContent>
    </Card>
  );
}
