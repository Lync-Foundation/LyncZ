'use client';

import { useRouter } from 'next/navigation';
import { useSellerOrders } from '@/hooks/useSellerOrders';
import { formatAddress } from '@/lib/contracts';
import { getTokenInfo, formatTokenAmount, formatTokenAmountFloor, getExactTokenAmount } from '@/lib/tokens';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2, ChevronRight, Globe, Lock } from 'lucide-react';
import { useState } from 'react';
import { Order } from '@/lib/api';
import { useTranslations } from 'next-intl';

type OrderView = 'active' | 'completed';

export function MyOrders() {
  const t = useTranslations('sell.myOrders');
  const router = useRouter();
  const { data: orders, isLoading, error: fetchError } = useSellerOrders();
  
  const [view, setView] = useState<OrderView>('active');

  // Navigate to order detail page
  const handleOrderClick = (orderId: string) => {
    router.push(`/account/order/${orderId}`);
  };

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

  // Separate active and completed orders
  const activeOrders = orders?.filter((order: Order) => {
    const remaining = parseFloat(formatTokenAmount(order.remaining_amount, order.token));
    return remaining > 0;
  }) || [];
  
  const completedOrders = orders?.filter((order: Order) => {
    const remaining = parseFloat(formatTokenAmount(order.remaining_amount, order.token));
    return remaining === 0;
  }) || [];
  
  const displayedOrders = view === 'active' ? activeOrders : completedOrders;

  if (!orders || orders.length === 0) {
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

  const renderOrderCard = (order: Order) => {
    const tokenInfo = getTokenInfo(order.token);
    const remainingAmountDisplay = formatTokenAmountFloor(order.remaining_amount, order.token);
    const remainingAmountExact = getExactTokenAmount(order.remaining_amount, order.token);
    const totalAmount = formatTokenAmount(order.total_amount, order.token);
    const exchangeRate = parseFloat(order.exchange_rate) / 100;
    const estimatedCNY = parseFloat(remainingAmountExact) * exchangeRate;
    const isCompleted = view === 'completed';

    return (
      <Card 
        key={order.order_id} 
        className={`bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-gray-200/50 dark:border-gray-800/50 shadow-lg transition-all hover:shadow-xl cursor-pointer hover:border-emerald-300/50 dark:hover:border-emerald-500/30 ${isCompleted ? 'opacity-70' : ''}`}
        onClick={() => handleOrderClick(order.order_id)}
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-sm font-mono text-gray-700 dark:text-gray-300">
                  {t('orderPrefix')} {formatAddress(order.order_id)}
                </CardTitle>
                {/* Chain Badge */}
                {order.chain_id === 1 ? (
                  <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-lg bg-purple-500/10 border border-purple-400/20 text-purple-600 dark:text-purple-400">
                    ETH
                  </span>
                ) : (
                  <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-lg bg-blue-500/10 border border-blue-400/20 text-blue-600 dark:text-blue-400">
                    Base
                  </span>
                )}
                {/* Public/Private Badge - Liquid Glass Effect */}
                {order.is_public ? (
                  <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-xl bg-transparent backdrop-blur-sm border border-emerald-400/20 text-emerald-600 dark:text-emerald-400 shadow-sm shadow-emerald-500/5">
                    <Globe className="h-3 w-3 mr-1.5" />
                    {t('public')}
                  </span>
                ) : (
                  <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-xl bg-transparent backdrop-blur-sm border border-purple-400/20 text-purple-600 dark:text-purple-400 shadow-sm shadow-purple-500/5">
                    <Lock className="h-3 w-3 mr-1.5" />
                    {t('private')}
                  </span>
                )}
              </div>
              <CardDescription>
                {t('created')} {new Date(order.created_at * 1000).toLocaleString()}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <ChevronRight className="h-5 w-5 text-slate-400" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Order Info */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 text-sm p-3 sm:p-4 bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl">
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-xs">{t('totalLocked')}</p>
              <p className="font-semibold text-sm sm:text-base break-all">{totalAmount} <span className="text-xs sm:text-sm">{tokenInfo.symbol}</span></p>
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-xs">{t('remaining')}</p>
              <p className="font-semibold text-sm sm:text-base text-green-600 dark:text-green-400 break-all">
                {remainingAmountDisplay} <span className="text-xs sm:text-sm">{tokenInfo.symbol}</span>
              </p>
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-xs">{t('exchangeRate')}</p>
              <p className="font-semibold text-sm sm:text-base">¥{exchangeRate.toFixed(2)}/{tokenInfo.symbol}</p>
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-xs">{t('estValue')}</p>
              <p className="font-semibold text-sm sm:text-base">¥{estimatedCNY.toFixed(2)}</p>
            </div>
          </div>

          {/* Click to manage hint */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
              {t('clickToManage')}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Toggle Buttons - Active / Completed */}
      <div className="flex gap-2">
        <Button
          variant="ghost"
          onClick={() => setView('active')}
          className={view === 'active'
            ? "flex-1 text-xs md:text-sm py-3 bg-emerald-500/8 text-emerald-600 dark:text-emerald-400 rounded-xl transition-all duration-500 shadow-sm shadow-emerald-500/10"
            : "flex-1 text-xs md:text-sm py-3 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-500/5 rounded-xl transition-all duration-500"
          }
        >
          <span className="hidden md:inline">{t('activeOrders')}</span>
          <span className="md:hidden">{t('active')}</span>
          <span className={`ml-1 md:ml-2 px-1.5 md:px-2 py-0.5 text-xs rounded-full font-semibold ${view === 'active' ? 'bg-white/20' : 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'}`}>
            {activeOrders.length}
          </span>
        </Button>
        <Button
          variant="ghost"
          onClick={() => setView('completed')}
          className={view === 'completed'
            ? "flex-1 text-xs md:text-sm py-3 bg-emerald-500/8 text-emerald-600 dark:text-emerald-400 rounded-xl transition-all duration-500 shadow-sm shadow-emerald-500/10"
            : "flex-1 text-xs md:text-sm py-3 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-500/5 rounded-xl transition-all duration-500"
          }
        >
          <span className="hidden md:inline">{t('completedOrders')}</span>
          <span className="md:hidden">{t('completed')}</span>
          <span className={`ml-1 md:ml-2 px-1.5 md:px-2 py-0.5 text-xs rounded-full font-semibold ${view === 'completed' ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
            {completedOrders.length}
          </span>
        </Button>
      </div>

      {/* Orders Display */}
      <div className="space-y-4">
        {displayedOrders.length === 0 ? (
          <Alert>
            <AlertDescription>
              {view === 'active' 
                ? t('noActiveOrders')
                : t('noCompletedOrders')}
            </AlertDescription>
          </Alert>
        ) : (
          displayedOrders.map((order: Order) => renderOrderCard(order))
        )}
      </div>
    </div>
  );
}
