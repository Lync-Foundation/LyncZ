'use client';

import { useState } from 'react';
import { BuyerInfoInput } from '@/components/buy/BuyerInfoInput';
import { OrderSelector } from '@/components/buy/OrderSelector';
import { ExecuteTrade } from '@/components/buy/ExecuteTrade';
import { PaymentInstructions } from '@/components/buy/PaymentInstructions';
import { BuyProgress, BuyStep as ProgressStep } from '@/components/buy/BuyProgress';
import { Order } from '@/lib/api';
import { getTransactionUrl } from '@/lib/contracts';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import SciFiBackground from '@/components/SciFiBackground';

export type BuyStep = 'info' | 'select' | 'execute' | 'payment' | 'settled';

export interface Trade {
  trade_id: string;
  order_id: string;
  tx_hash: string;
  alipay_id: string;
  alipay_name: string;
  cny_amount: string;
  expires_at: number;
}

export interface BuyFlowData {
  tokenAddress?: string;
  tokenSymbol?: string;
  tokenDecimals?: number;
  amount: string;
  paymentRail?: number;
  buyerAddress?: string;
  selectedOrder?: Order;
  tradeIds?: string[];
  trades?: Trade[];
}

export default function BuyPage() {
  const t = useTranslations('buy');
  const [currentStep, setCurrentStep] = useState<BuyStep>('info');
  const [flowData, setFlowData] = useState<BuyFlowData>({ amount: '' });

  const updateFlowData = (data: Partial<BuyFlowData>) => {
    setFlowData((prev) => ({ ...prev, ...data }));
  };

  const goToStep = (step: BuyStep) => {
    setCurrentStep(step);
    // Scroll to top when changing steps
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen relative">
      <SciFiBackground />
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="container mx-auto px-4 py-12 md:py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-4xl mx-auto"
          >
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 dark:from-blue-400 dark:via-purple-400 dark:to-pink-400">
                {t('title')}
              </span>
            </h1>

            <p className="text-lg md:text-xl text-gray-600 dark:text-gray-300 mb-4">
              {t('subtitle')}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="space-y-6">
              {/* Progress Bar */}
              <BuyProgress currentStep={currentStep as ProgressStep} />

              {/* Step Content */}
              <div className="mt-8">
                {currentStep === 'info' && (
                  <BuyerInfoInput
                    flowData={flowData}
                    updateFlowData={updateFlowData}
                    goToNextStep={() => goToStep('select')}
                    onPrivateOrderFound={(order) => {
                      // Skip order selection step and go directly to execute
                      goToStep('execute');
                    }}
                  />
                )}

                {currentStep === 'select' && flowData.tokenAddress && (
                  <OrderSelector
                    tokenAddress={flowData.tokenAddress}
                    tokenSymbol={flowData.tokenSymbol || 'USDC'}
                    tokenDecimals={flowData.tokenDecimals || 6}
                    requestedAmount={flowData.amount}
                    paymentRail={flowData.paymentRail || 0}
                    onOrderSelected={(order) => {
                      updateFlowData({ selectedOrder: order });
                      goToStep('execute');
                    }}
                    onBack={() => goToStep('info')}
                  />
                )}

                {currentStep === 'execute' && (
                  <ExecuteTrade
                    flowData={flowData}
                    updateFlowData={updateFlowData}
                    goBack={() => goToStep('select')}
                    goToNextStep={() => goToStep('payment')}
                  />
                )}

                {currentStep === 'payment' && flowData.trades && (
                  <PaymentInstructions
                    trades={flowData.trades}
                    onAllSettled={() => goToStep('settled')}
                  />
                )}

                {currentStep === 'settled' && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative overflow-hidden bg-gradient-to-br from-white/70 via-emerald-50/30 to-white/60 dark:from-slate-900/70 dark:via-emerald-900/10 dark:to-slate-900/60 backdrop-blur-2xl border border-emerald-200/40 dark:border-emerald-500/20 shadow-xl rounded-3xl p-8"
                  >
                    {/* Top accent line */}
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400/60 via-green-500/60 to-teal-400/60" />
                    
                    <div className="text-center py-8 space-y-6">
                      <div className="w-24 h-24 mx-auto rounded-full bg-emerald-500/10 border border-emerald-300/40 flex items-center justify-center">
                        <span className="text-5xl">🎉</span>
                      </div>
                      <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600">{t('settled.title')}</h2>
                      <p className="text-slate-600 dark:text-slate-400">
                        {t('settled.subtitle')}
                      </p>
                      
                      {flowData.trades && (
                        <div className="mt-6 space-y-2">
                          <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold">{t('settled.settlementTx')}</p>
                          {flowData.trades.map((trade) => {
                            const tradeStatus = (window as any).tradeStatuses?.get(trade.trade_id);
                            const settlementTxHash = tradeStatus?.settlement_tx_hash;
                            
                            if (settlementTxHash) {
                              return (
                                <a
                                  key={trade.trade_id}
                                  href={getTransactionUrl(settlementTxHash, flowData.selectedOrder?.chain_id)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block text-purple-600 hover:underline flex items-center justify-center gap-2"
                                >
                                  {t('settled.viewTx')}
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </a>
                              );
                            }
                            return null;
                          })}
                        </div>
                      )}
                      
                      <button
                        onClick={() => {
                          setCurrentStep('info');
                          setFlowData({ amount: '' });
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="mt-6 px-8 py-4 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:from-blue-700 hover:via-purple-700 hover:to-pink-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-purple-500/25 transition-all duration-300"
                      >
                        {t('settled.newPurchase')}
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
