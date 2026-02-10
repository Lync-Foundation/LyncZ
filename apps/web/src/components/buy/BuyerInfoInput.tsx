'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { usePrivy } from '@privy-io/react-auth';
import { isAddress } from 'viem';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Coins, CreditCard, Wallet, ArrowRight, AlertCircle, Lock, Search, Loader2 } from 'lucide-react';
import { BuyFlowData } from '@/app/buy/page';
import { getTokenInfo, formatTokenAmount, type TokenInfo, getSupportedTokensForChain, getFlatFee, CHAIN_IDS } from '@/lib/tokens';
import { PAYMENT_RAIL } from '@/lib/contracts';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { NetworkBadge } from '@/components/WalletButton';
import { Switch } from '@/components/ui/switch';
import { api, Order } from '@/lib/api';

interface BuyerInfoInputProps {
  flowData: BuyFlowData;
  updateFlowData: (data: Partial<BuyFlowData>) => void;
  goToNextStep: () => void;
  onPrivateOrderFound?: (order: Order) => void;
}

export function BuyerInfoInput({ flowData, updateFlowData, goToNextStep, onPrivateOrderFound }: BuyerInfoInputProps) {
  const { address, isConnected: wagmiConnected } = useAccount();
  const { authenticated, ready } = usePrivy();
  // User is truly connected only if both wagmi AND Privy agree
  const isConnected = wagmiConnected && authenticated && ready;
  const t = useTranslations('buy.buyerInfo');
  
  // Tokens from all supported chains for buyer selection
  const allTokens = [
    ...getSupportedTokensForChain(CHAIN_IDS.BASE_MAINNET),
    ...getSupportedTokensForChain(CHAIN_IDS.ETH_MAINNET),
  ];
  const [selectedToken, setSelectedToken] = useState<string>(flowData.tokenAddress || allTokens[0]);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo>(getTokenInfo(allTokens[0]));
  const [amount, setAmount] = useState(flowData.amount || '');
  const [paymentRail, setPaymentRail] = useState<number>(flowData.paymentRail ?? PAYMENT_RAIL.ALIPAY);
  const [useManualAddress, setUseManualAddress] = useState(!isConnected);
  const [manualAddress, setManualAddress] = useState(flowData.buyerAddress || '');
  const [error, setError] = useState<string | null>(null);
  
  // Private code state
  const [usePrivateCode, setUsePrivateCode] = useState(false);
  const [privateCode, setPrivateCode] = useState('');
  const [privateCodeLoading, setPrivateCodeLoading] = useState(false);
  const [privateCodeError, setPrivateCodeError] = useState<string | null>(null);
  const [privateOrder, setPrivateOrder] = useState<Order | null>(null);
  const [amountExceedsAvailable, setAmountExceedsAvailable] = useState(false);

  // Calculate net purchasable amount for a private order (remaining - fee)
  const getNetPurchasableAmount = (order: Order): bigint => {
    const remaining = BigInt(order.remaining_amount);
    const fee = getFlatFee(order.token, order.is_public);
    const net = remaining > fee ? remaining - fee : BigInt(0);
    return net;
  };

  // Calculate max CNY amount that can be purchased from the private order
  const getMaxCnyAmount = (order: Order): number => {
    const netTokens = getNetPurchasableAmount(order);
    const tokenInfo = getTokenInfo(order.token);
    const exchangeRate = BigInt(order.exchange_rate); // rate in cents per token unit
    // maxCnyCents = (netTokens * exchangeRate) / 10^decimals
    const maxCnyCents = (netTokens * exchangeRate) / BigInt(10 ** tokenInfo.decimals);
    return Number(maxCnyCents) / 100; // Convert cents to yuan
  };

  // Format net purchasable for display
  const formatNetPurchasable = (order: Order): string => {
    const netTokens = getNetPurchasableAmount(order);
    const tokenInfo = getTokenInfo(order.token);
    const displayAmount = Number(netTokens) / Math.pow(10, tokenInfo.decimals);
    // Use appropriate decimals based on token
    const decimals = tokenInfo.decimals <= 6 ? 2 : 6;
    return parseFloat(displayAmount.toFixed(decimals)).toString();
  };

  // Validate amount against available for private order
  const validatePrivateOrderAmount = (cnyAmount: string, order: Order): boolean => {
    if (!cnyAmount || isNaN(parseFloat(cnyAmount))) return true; // Empty is ok
    const amountNum = parseFloat(cnyAmount);
    if (amountNum <= 0) return true;
    
    const maxCny = getMaxCnyAmount(order);
    return amountNum <= maxCny;
  };

  // Update token info when selection changes
  useEffect(() => {
    setTokenInfo(getTokenInfo(selectedToken));
  }, [selectedToken]);

  // Auto-update manual address mode when wallet connects/disconnects
  useEffect(() => {
    if (isConnected && !useManualAddress) {
      setManualAddress('');
    }
  }, [isConnected, useManualAddress]);

  const handleContinue = () => {
    setError(null);

    // Validate amount
    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      setError(t('errors.invalidAmount'));
      return;
    }

    // Determine receive address
    const buyerAddress = (!isConnected || useManualAddress) ? manualAddress : address;

    // Validate address
    if (!buyerAddress) {
      setError(t('errors.noAddress'));
      return;
    }

    if (!isAddress(buyerAddress)) {
      setError(t('errors.invalidAddress'));
      return;
    }

    // All valid - update flow data and proceed
    updateFlowData({
      tokenAddress: selectedToken,
      tokenSymbol: tokenInfo.symbol,
      tokenDecimals: tokenInfo.decimals,
      amount: amount,
      paymentRail: paymentRail,
      buyerAddress: buyerAddress,
    });

    goToNextStep();
  };

  const isFormValid = () => {
    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) return false;
    
    const buyerAddress = (!isConnected || useManualAddress) ? manualAddress : address;
    if (!buyerAddress) return false;
    if (!isAddress(buyerAddress)) return false;
    
    return true;
  };

  // Handle private code lookup
  const handlePrivateCodeLookup = async () => {
    if (privateCode.length !== 6) {
      setPrivateCodeError(t('privateCode.invalid'));
      return;
    }

    setPrivateCodeLoading(true);
    setPrivateCodeError(null);
    setPrivateOrder(null);

    try {
      const order = await api.getOrderByPrivateCode(privateCode);
      setPrivateOrder(order);
      
      // Auto-fill the token and payment rail from the private order
      setSelectedToken(order.token);
      setPaymentRail(order.rail);
    } catch (err) {
      console.error('Private code lookup failed:', err);
      setPrivateCodeError(t('privateCode.notFound'));
    } finally {
      setPrivateCodeLoading(false);
    }
  };

  // Handle continue with private order
  const handleContinueWithPrivateOrder = () => {
    if (!privateOrder) return;
    
    setError(null);

    // Validate amount
    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      setError(t('errors.invalidAmount'));
      return;
    }

    // Determine receive address
    const buyerAddress = (!isConnected || useManualAddress) ? manualAddress : address;

    if (!buyerAddress) {
      setError(t('errors.noAddress'));
      return;
    }

    if (!isAddress(buyerAddress)) {
      setError(t('errors.invalidAddress'));
      return;
    }

    // Update flow data with the private order info
    const orderTokenInfo = getTokenInfo(privateOrder.token);
    updateFlowData({
      tokenAddress: privateOrder.token,
      tokenSymbol: orderTokenInfo.symbol,
      tokenDecimals: orderTokenInfo.decimals,
      amount: amount,
      paymentRail: privateOrder.rail,
      buyerAddress: buyerAddress,
      selectedOrder: privateOrder,
    });

    // If callback provided, call it with the private order
    if (onPrivateOrderFound) {
      onPrivateOrderFound(privateOrder);
    } else {
      goToNextStep();
    }
  };

  return (
    <Card className="relative overflow-hidden bg-transparent backdrop-blur-sm border border-purple-200/15 dark:border-purple-500/10 rounded-3xl">
      {/* Top accent line - whisper thin */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-purple-400/30 to-transparent" />
      <CardHeader className="pt-8">
        <CardTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600">{t('title')}</CardTitle>
        <p className="text-slate-600 dark:text-slate-400">{t('subtitle')}</p>
        
        {/* Base Network Badge with wrong network warning */}
        <NetworkBadge className="mt-3" />
      </CardHeader>
      
      <CardContent className="space-y-8">
        {/* Private Code Toggle - At the very top */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="p-4 bg-transparent rounded-2xl border border-indigo-200/15 dark:border-indigo-500/10"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-500/10 border border-indigo-300/40 rounded-xl flex items-center justify-center">
                <Lock className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-200">
                  {t('privateCode.title')}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t('privateCode.subtitle')}
                </p>
              </div>
            </div>
            
            {/* Liquid Glass Toggle Switch */}
            <Switch
              checked={usePrivateCode}
              onCheckedChange={(checked) => {
                setUsePrivateCode(checked);
                if (!checked) {
                  setPrivateCode('');
                  setPrivateOrder(null);
                  setPrivateCodeError(null);
                }
              }}
              className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-indigo-500 data-[state=checked]:to-purple-500 
                         data-[state=unchecked]:bg-slate-200/80 dark:data-[state=unchecked]:bg-slate-700/50
                         border border-indigo-300/20 shadow-sm shadow-indigo-500/5
                         transition-all duration-300"
            />
          </div>
        </motion.div>

        {/* Section 1: Token Selection OR Private Code Input */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-4 p-6 bg-transparent rounded-2xl border border-blue-200/15 dark:border-blue-500/10"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-500/10 border border-blue-300/40 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">
              1
            </div>
            <div>
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Coins className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                {t('tokenAmount')}
              </h3>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {usePrivateCode ? (
              /* Private Code Mode - Show code input and order preview */
              <motion.div
                key="private-code-mode"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                {/* Code Input */}
                <div className="space-y-2">
                  <Label className="text-slate-700 dark:text-slate-300">{t('privateCode.enterCode')}</Label>
                  <div className="flex gap-3">
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      placeholder={t('privateCode.placeholder')}
                      value={privateCode}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                        setPrivateCode(value);
                        setPrivateCodeError(null);
                        setPrivateOrder(null);
                      }}
                      className="flex-1 h-12 text-center text-2xl font-mono tracking-[0.5em] rounded-xl 
                                 bg-transparent backdrop-blur-sm border border-indigo-300/20 
                                 focus:border-indigo-400/40 focus:ring-1 focus:ring-indigo-300/20
                                 placeholder:text-slate-400 placeholder:tracking-normal placeholder:text-base"
                    />
                    <Button
                      type="button"
                      onClick={handlePrivateCodeLookup}
                      disabled={privateCode.length !== 6 || privateCodeLoading}
                      className="h-12 px-5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 
                                 hover:from-indigo-600 hover:to-purple-600 
                                 disabled:opacity-50 disabled:cursor-not-allowed
                                 shadow-sm shadow-indigo-500/20 transition-all duration-300"
                    >
                      {privateCodeLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Search className="h-5 w-5" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Error Message */}
                {privateCodeError && (
                  <Alert className="bg-red-500/10 border border-red-300/30 text-red-600 dark:text-red-400 rounded-xl">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{privateCodeError}</AlertDescription>
                  </Alert>
                )}

                {/* Found Order Display */}
                {privateOrder && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50/80 to-teal-50/80 
                               dark:from-emerald-950/30 dark:to-teal-950/30 
                               border border-emerald-300/40 dark:border-emerald-500/20"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                      </div>
                      <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                        {t('privateCode.orderFound')}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">{t('privateCode.token')}</span>
                        <p className="font-medium">{getTokenInfo(privateOrder.token).symbol}</p>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">{t('privateCode.rate')}</span>
                        <p className="font-medium">¥{(parseFloat(privateOrder.exchange_rate) / 100).toFixed(2)}</p>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">{t('privateCode.available')}</span>
                        <p className="font-medium text-emerald-600 dark:text-emerald-400">
                          {formatNetPurchasable(privateOrder)} {getTokenInfo(privateOrder.token).symbol}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* CNY Amount Input (shown only after order is found) */}
                {privateOrder && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3 pt-4 border-t border-slate-200/20"
                  >
                    <Label htmlFor="amount" className="text-slate-700 dark:text-slate-300">{t('cnyAmount')}</Label>
                    
                    <div className="flex gap-2 items-center">
                      <span className="text-lg font-medium text-slate-500">¥</span>
                      <Input
                        id="amount-private"
                        type="number"
                        step="1"
                        min="1"
                        placeholder="199"
                        value={amount}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^\d+$/.test(val)) {
                            setAmount(val);
                            // Real-time validation
                            if (privateOrder && val) {
                              const isValid = validatePrivateOrderAmount(val, privateOrder);
                              setAmountExceedsAvailable(!isValid);
                            } else {
                              setAmountExceedsAvailable(false);
                            }
                          }
                        }}
                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                        className={`h-12 text-lg flex-1 rounded-xl ${
                          amountExceedsAvailable ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''
                        }`}
                      />
                      <span className="text-sm text-slate-500">CNY</span>
                    </div>
                    
                    {/* Inline validation error */}
                    {amountExceedsAvailable && (
                      <Alert className="bg-red-500/10 border border-red-300/30 text-red-600 dark:text-red-400 rounded-xl py-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          {t('privateCode.exceedsAvailable', { max: Math.floor(getMaxCnyAmount(privateOrder)) })}
                        </AlertDescription>
                      </Alert>
                    )}
                    
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('cnyAmountNote')}
                    </p>
                  </motion.div>
                )}
              </motion.div>
            ) : (
              /* Normal Mode - Token Selection */
              <motion.div
                key="normal-mode"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                {/* Token Selection */}
                <div className="space-y-2">
                  <Label className="text-slate-700 dark:text-slate-300">{t('selectToken')}</Label>
                  <Select value={selectedToken} onValueChange={setSelectedToken}>
                    <SelectTrigger className="h-12 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allTokens.map((tokenAddr) => {
                        const info = getTokenInfo(tokenAddr);
                        // Determine which chain this token belongs to
                        const isEth = getSupportedTokensForChain(CHAIN_IDS.ETH_MAINNET).includes(tokenAddr);
                        const chainLabel = isEth ? '(ETH)' : '(Base)';
                        return (
                          <SelectItem key={tokenAddr} value={tokenAddr}>
                            {info.symbol} - {info.name} {chainLabel}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {/* CNY Amount Input */}
                <div className="space-y-3">
                  <Label htmlFor="amount" className="text-slate-700 dark:text-slate-300">{t('cnyAmount')}</Label>
                  
                  <div className="flex gap-2 items-center">
                    <span className="text-lg font-medium text-slate-500">¥</span>
                    <Input
                      id="amount"
                      type="number"
                      step="1"
                      min="1"
                      placeholder="199"
                      value={amount}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^\d+$/.test(val)) {
                          setAmount(val);
                        }
                      }}
                      onWheel={(e) => (e.target as HTMLInputElement).blur()}
                      className="h-12 text-lg flex-1 rounded-xl"
                    />
                    <span className="text-sm text-slate-500">CNY</span>
                  </div>
                  
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('cnyAmountNote')}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Section 2: Payment Method */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-4 p-6 bg-transparent rounded-2xl border border-purple-200/15 dark:border-purple-500/10"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-purple-500/10 border border-purple-300/40 rounded-xl flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold">
              2
            </div>
            <div>
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                {t('paymentMethod')}
              </h3>
            </div>
          </div>

          {/* Force light mode for payment icons - logos look better on white */}
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setPaymentRail(PAYMENT_RAIL.ALIPAY)}
              className={`flex-1 h-16 rounded-xl border transition-all duration-200 overflow-hidden bg-transparent ${
                paymentRail === PAYMENT_RAIL.ALIPAY
                  ? 'border-purple-400/50 ring-1 ring-purple-200/30'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="w-full h-full flex items-center justify-center p-2">
                <Image 
                  src="/alipay-logo.svg" 
                  alt="Alipay" 
                  width={140} 
                  height={48}
                  className="object-contain max-h-full"
                />
              </div>
            </button>
            <button
              type="button"
              disabled={true}
              className="flex-1 h-16 rounded-xl border-2 transition-all duration-200 relative opacity-40 cursor-not-allowed border-slate-200 bg-slate-50 overflow-hidden"
            >
              <div className="w-full h-full flex items-center justify-center p-2">
                <Image 
                  src="/wechat-pay-icon.png" 
                  alt="WeChat Pay" 
                  width={140} 
                  height={48}
                  className="object-contain max-h-full"
                />
              </div>
              <span className="absolute top-1 right-1 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs px-2 py-0.5 rounded-full border border-amber-300/40">
                {t('soon')}
              </span>
            </button>
          </div>
        </motion.div>

        {/* Section 3: Receive Address */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-4 p-6 bg-transparent rounded-2xl border border-pink-200/15 dark:border-pink-500/10"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-pink-500/10 border border-pink-300/40 rounded-xl flex items-center justify-center text-pink-600 dark:text-pink-400 font-bold">
              3
            </div>
            <div>
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Wallet className="h-5 w-5 text-pink-600 dark:text-pink-400" />
                {t('receiveAddress')}
              </h3>
            </div>
          </div>

          {isConnected && !useManualAddress ? (
            <div className="space-y-3">
              <div className="p-4 bg-emerald-500/5 rounded-xl border border-emerald-300/40">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-600 dark:text-slate-400">{t('connectedWallet')}</p>
                    <p className="font-mono text-sm font-medium truncate text-slate-800 dark:text-white" title={address}>
                      {address ? `${address.slice(0, 10)}...${address.slice(-6)}` : ''}
                    </p>
                  </div>
                  <span className="text-emerald-600 text-sm font-medium whitespace-nowrap flex-shrink-0">{t('connected')}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUseManualAddress(true)}
                className="text-sm text-purple-600 hover:underline"
              >
                {t('useDifferentAddress')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <Input
                type="text"
                placeholder={t('addressPlaceholder')}
                value={manualAddress}
                onChange={(e) => setManualAddress(e.target.value)}
                className="h-12 font-mono rounded-xl"
              />
              {isConnected && (
                <button
                  type="button"
                  onClick={() => {
                    setUseManualAddress(false);
                    setManualAddress('');
                  }}
                  className="text-sm text-purple-600 hover:underline"
                >
                  {t('useConnectedWallet')}
                </button>
              )}
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t('addressTip')}
              </p>
            </div>
          )}
        </motion.div>

        {/* Error Display */}
        {error && (
          <Alert className="bg-red-500/10 border border-red-300/40 text-red-700 dark:text-red-400 rounded-xl">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Continue Button - Changes based on private code mode */}
        {usePrivateCode && privateOrder ? (
          <Button
            onClick={handleContinueWithPrivateOrder}
            disabled={!amount || parseFloat(amount) <= 0 || amountExceedsAvailable}
            className="w-full h-14 text-lg bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 
                       hover:from-indigo-700 hover:via-purple-700 hover:to-pink-700 
                       shadow-lg hover:shadow-purple-500/25 transition-all duration-300 rounded-xl
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('privateCode.continueWithOrder')}
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        ) : (
          <Button
            onClick={handleContinue}
            disabled={!isFormValid() || usePrivateCode}
            className="w-full h-14 text-lg bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 
                       hover:from-blue-700 hover:via-purple-700 hover:to-pink-700 
                       shadow-lg hover:shadow-purple-500/25 transition-all duration-300 rounded-xl
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('browseOrders')}
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

