'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowUpDown, Clock, TrendingUp, Check, ArrowLeft } from 'lucide-react';
import { api, Order } from '@/lib/api';
import { formatTokenAmountFloorWithSymbol, getFlatFee, formatFlatFeeDisplay } from '@/lib/tokens';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';

interface OrderSelectorProps {
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  requestedAmount: string; // CNY yuan amount (integer string, e.g., "199")
  paymentRail: number; // 0 = Alipay, 1 = WeChat
  onOrderSelected: (order: Order) => void;
  onBack: () => void;
}

type SortOption = 'rate-asc' | 'rate-desc' | 'created-desc' | 'created-asc';

const ORDERS_PER_PAGE = 5;

export function OrderSelector({
  tokenAddress,
  tokenSymbol,
  tokenDecimals,
  requestedAmount,
  paymentRail,
  onOrderSelected,
  onBack,
}: OrderSelectorProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('rate-asc');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  
  const t = useTranslations('buy.orderSelector');
  const tRail = useTranslations('orderCard.paymentRail');

  // requestedAmount is now CNY yuan (integer string, e.g., "199")
  // Convert to cents for calculations
  const requestedCnyCents = useMemo(() => {
    try {
      const yuanAmount = parseInt(requestedAmount);
      return isNaN(yuanAmount) ? 0 : yuanAmount * 100; // Convert to cents
    } catch {
      return 0;
    }
  }, [requestedAmount]);
  
  // Calculate token amount for a given order based on CNY amount and exchange rate
  // Formula: tokenAmount = (fiatAmount * 10^decimals) / exchangeRate (matching contract)
  const calculateTokenAmountForOrder = (order: Order): bigint => {
    const fiatCents = BigInt(requestedCnyCents);
    const exchangeRate = BigInt(order.exchange_rate);
    const decimals = BigInt(tokenDecimals);
    
    if (exchangeRate === BigInt(0)) return BigInt(0);
    
    // Match contract rounding (round UP so buyer absorbs dust)
    const tokenAmount = (fiatCents * BigInt(10) ** decimals + exchangeRate - BigInt(1)) / exchangeRate;
    return tokenAmount;
  };

  // Fetch orders (fee is now flat rate, no need to fetch from contract)
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const ordersResponse = await api.getActiveOrders();
        console.log('[OrderSelector] API response:', ordersResponse);
        setOrders(ordersResponse);
      } catch (err) {
        setError('Failed to fetch orders');
        console.error('[OrderSelector] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Filter and sort orders
  const filteredOrders = useMemo(() => {
    if (!orders || orders.length === 0) {
      console.log('[OrderSelector] No orders loaded yet');
      return [];
    }
    
    console.log('[OrderSelector] Filtering', orders.length, 'orders');
    console.log('[OrderSelector] Looking for:', {
      tokenAddress: tokenAddress.toLowerCase(),
      paymentRail,
      requestedCnyCents,
    });
    
    return orders
      .filter((order) => {
        // Filter by token
        const tokenMatch = order.token.toLowerCase() === tokenAddress.toLowerCase();
        if (!tokenMatch) {
          console.log('[OrderSelector] Token mismatch:', order.token.toLowerCase(), '!==', tokenAddress.toLowerCase());
          return false;
        }
        
        // Filter by payment rail
        if (order.rail !== paymentRail) {
          console.log('[OrderSelector] Rail mismatch:', order.rail, '!==', paymentRail);
          return false;
        }
        
        // Calculate token amount for this order based on CNY amount and exchange rate
        const tokenAmount = calculateTokenAmountForOrder(order);
        
        // Filter by sufficient remaining amount (including flat fee)
        // The seller's order must have enough to cover: buyer's token amount + flat fee
        const remainingWei = BigInt(order.remaining_amount);
        const flatFee = getFlatFee(tokenAddress, order.is_public);
        const requiredWithFee = tokenAmount + flatFee;
        if (remainingWei < requiredWithFee) {
          console.log('[OrderSelector] Amount insufficient (including flat fee):', 
            remainingWei.toString(), '<', requiredWithFee.toString(),
            '(tokenAmount:', tokenAmount.toString(), '+ flatFee:', flatFee.toString(), ')');
          return false;
        }
        
        console.log('[OrderSelector] Order passed filters!', order.order_id.substring(0, 10));
        return true;
      })
      .sort((a, b) => {
        const rateA = parseInt(a.exchange_rate);
        const rateB = parseInt(b.exchange_rate);
        const createdA = a.created_at;
        const createdB = b.created_at;

        switch (sortBy) {
          case 'rate-asc':
            return rateA - rateB; // Best rate first (lowest CNY per token)
          case 'rate-desc':
            return rateB - rateA;
          case 'created-desc':
            return createdB - createdA; // Newest first
          case 'created-asc':
            return createdA - createdB;
          default:
            return 0;
        }
      });
  }, [orders, tokenAddress, paymentRail, requestedCnyCents, sortBy, calculateTokenAmountForOrder]);

  // Reset to page 1 when sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [sortBy]);

  // Pagination logic
  const totalPages = Math.ceil(filteredOrders.length / ORDERS_PER_PAGE);
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * ORDERS_PER_PAGE;
    return filteredOrders.slice(startIndex, startIndex + ORDERS_PER_PAGE);
  }, [filteredOrders, currentPage]);

  const formatRate = (rateCents: string) => {
    const rate = parseInt(rateCents) / 100;
    return rate.toFixed(2);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  // Get appropriate display decimals based on token type
  // USDC (6): 2-4 decimals, WETH (18): 6-8 decimals, cbBTC (8): 6-8 decimals
  const getDisplayDecimals = (amount: number) => {
    if (tokenDecimals <= 6) {
      // USDC: 2 decimals for normal amounts, 4 for very small
      return amount < 0.01 ? 4 : 2;
    } else if (tokenDecimals === 8) {
      // cbBTC: 6-8 decimals
      return amount < 0.0001 ? 8 : 6;
    } else {
      // WETH/18 decimals: 6-8 decimals for precision on small amounts
      return amount < 0.0001 ? 8 : 6;
    }
  };
  
  // Calculate token amount user will receive for a given order
  const calculateTokenAmountDisplay = (order: Order) => {
    const tokenAmount = calculateTokenAmountForOrder(order);
    const displayAmount = Number(tokenAmount) / Math.pow(10, tokenDecimals);
    const decimals = getDisplayDecimals(displayAmount);
    // Trim trailing zeros for cleaner display
    return parseFloat(displayAmount.toFixed(decimals)).toString();
  };
  
  // Calculate flat fee amount for a given order
  const calculateFeeDisplay = (order: Order) => {
    const feeAmount = getFlatFee(tokenAddress, order.is_public);
    const displayAmount = Number(feeAmount) / Math.pow(10, tokenDecimals);
    const decimals = getDisplayDecimals(displayAmount);
    return parseFloat(displayAmount.toFixed(decimals)).toString();
  };
  
  // Net tokens after flat fee
  const calculateNetTokensDisplay = (order: Order) => {
    const tokenAmount = calculateTokenAmountForOrder(order);
    const feeAmount = getFlatFee(tokenAddress, order.is_public);
    const netAmount = tokenAmount - feeAmount;
    const displayAmount = Number(netAmount) / Math.pow(10, tokenDecimals);
    const decimals = getDisplayDecimals(displayAmount);
    return parseFloat(displayAmount.toFixed(decimals)).toString();
  };

  const getPaymentRailName = (rail: number) => {
    return rail === 0 ? tRail('alipay') : tRail('wechat');
  };

  const getPaymentRailColor = (rail: number) => {
    return rail === 0 ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800';
  };

  const handleConfirmSelection = () => {
    const selectedOrder = filteredOrders.find(o => o.order_id === selectedOrderId);
    if (selectedOrder) {
      onOrderSelected(selectedOrder);
    }
  };

  if (loading) {
    return (
      <Card className="relative overflow-hidden bg-transparent backdrop-blur-sm border border-purple-200/15 dark:border-purple-500/10 rounded-3xl">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
          <span className="ml-3 text-lg text-slate-700 dark:text-slate-300">{t('loading')}</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="relative overflow-hidden bg-transparent backdrop-blur-sm border border-purple-200/15 dark:border-purple-500/10 rounded-3xl">
        <CardContent className="py-12 text-center">
          <p className="text-red-500">{error}</p>
          <Button onClick={onBack} variant="outline" className="mt-4 rounded-xl border-purple-200/50 hover:border-purple-300/70">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('goBack')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="relative overflow-hidden bg-transparent backdrop-blur-sm border border-purple-200/15 dark:border-purple-500/10 rounded-3xl">
      {/* Top accent line - whisper thin */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-purple-400/30 to-transparent" />
      <CardHeader className="space-y-4 pt-6">
        {/* Title and Buying Info */}
        <div>
          <CardTitle className="text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600">{t('title')}</CardTitle>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            {t('paying') || 'Paying'} <span className="font-semibold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">¥{requestedAmount} CNY</span> {t('for') || 'for'} <span className="font-semibold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-pink-600">{tokenSymbol}</span>
          </p>
        </div>

        {/* Sort Options - Full width on mobile */}
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-slate-500 flex-shrink-0" />
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-full md:w-[180px] rounded-xl">
              <SelectValue placeholder={t('sortBy')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rate-asc">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  {t('bestRateFirst')}
                </div>
              </SelectItem>
              <SelectItem value="rate-desc">{t('highestRateFirst')}</SelectItem>
              <SelectItem value="created-desc">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {t('newestFirst')}
                </div>
              </SelectItem>
              <SelectItem value="created-asc">{t('oldestFirst')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {filteredOrders.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-lg text-muted-foreground">
              {t('noOrdersForAmount', { amount: requestedAmount, rail: getPaymentRailName(paymentRail) }) 
                || `No orders available for ¥${requestedAmount} CNY via ${getPaymentRailName(paymentRail)}`}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {t('tryDifferentAmount') || 'Try a different amount or check back later.'}
            </p>
            <Button onClick={onBack} variant="outline" className="mt-6">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('goBack')}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t('ordersAvailable', { count: filteredOrders.length })}
              </p>
              {totalPages > 1 && (
                <p className="text-sm text-muted-foreground">
                  {t('pageOf', { current: currentPage, total: totalPages })}
                </p>
              )}
            </div>
            
            {/* Order List */}
            <div className="space-y-3">
              <AnimatePresence mode="wait">
                {paginatedOrders.map((order, index) => {
                  const isSelected = selectedOrderId === order.order_id;
                  const tokenAmountDisplay = calculateTokenAmountDisplay(order);
                  const globalIndex = (currentPage - 1) * ORDERS_PER_PAGE + index;
                  
                  return (
                    <motion.div
                      key={order.order_id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ delay: index * 0.05 }}
                      className={`
                        p-4 rounded-xl border-2 cursor-pointer transition-all duration-200
                        ${isSelected 
                          ? 'border-purple-400/60 bg-purple-500/5 shadow-lg shadow-purple-500/10' 
                          : 'border-slate-200/50 dark:border-slate-700/50 hover:border-purple-300/50 hover:bg-purple-50/30 dark:hover:bg-purple-900/10'
                        }
                      `}
                      onClick={() => setSelectedOrderId(order.order_id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <span className="font-semibold text-lg text-slate-800 dark:text-white">
                              ¥{formatRate(order.exchange_rate)} / {tokenSymbol}
                            </span>
                            {/* Chain badge */}
                            {order.chain_id === 1 ? (
                              <Badge className="bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-300/40 text-xs px-1.5 py-0">ETH</Badge>
                            ) : (
                              <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-300/40 text-xs px-1.5 py-0">Base</Badge>
                            )}
                            {globalIndex === 0 && sortBy === 'rate-asc' && (
                              <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-300/40">{t('bestRate')}</Badge>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">{t('youReceive') || 'You receive'}: </span>
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{tokenAmountDisplay} {tokenSymbol}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">{t('available')}: </span>
                              <span className="font-medium text-slate-700 dark:text-slate-300">
                                {formatTokenAmountFloorWithSymbol(order.remaining_amount, order.token)}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">{t('seller')}: </span>
                              <span className="font-medium text-slate-700 dark:text-slate-300">{order.account_name || order.alipay_name || '-'}</span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Selection Indicator */}
                        <div className={`
                          w-8 h-8 rounded-full border-2 flex items-center justify-center ml-4 transition-all
                          ${isSelected 
                            ? 'border-purple-400 bg-gradient-to-r from-blue-600 to-purple-600 text-white' 
                            : 'border-slate-300/50 dark:border-slate-600/50'
                          }
                        `}>
                          {isSelected && <Check className="h-5 w-5" />}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 py-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  ← {t('previous')}
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <Button
                      key={page}
                      variant={currentPage === page ? "default" : "ghost"}
                      size="sm"
                      className="w-8 h-8 p-0"
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  {t('next')} →
                </Button>
              </div>
            )}
            
            {/* Action Buttons */}
            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t border-slate-200/50 dark:border-slate-700/50">
              <Button onClick={onBack} variant="outline" className="flex-1 rounded-xl border-purple-200/50 hover:border-purple-300/70 hover:bg-purple-50/50 dark:hover:bg-purple-900/20">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('back')}
              </Button>
              <Button 
                onClick={handleConfirmSelection}
                disabled={!selectedOrderId}
                className="flex-1 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:from-blue-700 hover:via-purple-700 hover:to-pink-700 rounded-xl shadow-lg hover:shadow-purple-500/25"
              >
                <span className="hidden sm:inline">{t('continueWithSelected')}</span>
                <span className="sm:hidden">{t('continue')}</span>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

