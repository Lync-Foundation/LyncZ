'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  CheckCircle2, 
  ChevronRight,
  ChevronLeft,
  X,
  AlertTriangle
} from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { Copy, Check } from 'lucide-react';
import Image from 'next/image';

interface ReceiptTutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  sellerName: string;
}

// Extract last name: for Chinese names (first char), for English names (first word)
function getLastName(name: string): string {
  if (!name) return '';
  // Check if name contains mostly ASCII (likely English/romaji)
  const isAscii = /^[\x00-\x7F\s]*$/.test(name);
  if (isAscii && name.includes(' ')) {
    // English format: "lastname firstname" - take first word
    return name.split(' ')[0];
  }
  // Chinese format: first character is last name
  return name.charAt(0);
}

export function ReceiptTutorialModal({ 
  isOpen, 
  onClose, 
  sellerName 
}: ReceiptTutorialModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const t = useTranslations('buy.paymentInstructions.receiptTutorial');
  const locale = useLocale();
  const isEnglish = locale === 'en';
  const lastName = getLastName(sellerName);

  // Use English images when locale is English
  const receiptImages = isEnglish
    ? [
        '/tutorial/receipt eng 1.jpg',
        '/tutorial/receipt eng 2.jpg',
        '/tutorial/receipt eng 3.jpg',
        '/tutorial/receipt eng 4.jpg',
        '/tutorial/receipt eng 5.jpg',
        '/tutorial/receipt eng 6.jpg',
        '/tutorial/receipt eng 7.jpg',
      ]
    : [
        '/tutorial/receipt 1.jpg',
        '/tutorial/receipt 2.jpg',
        '/tutorial/receipt 3.jpg',
        '/tutorial/receipt 4.jpg',
        '/tutorial/receipt 5.jpg',
        '/tutorial/receipt 6.jpg',
        '/tutorial/receipt 7.jpg',
      ];

  const copyLastName = async () => {
    try {
      await navigator.clipboard.writeText(lastName);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const steps = [
    {
      title: t('step1.title'),
      description: t('step1.description'),
      image: receiptImages[0],
      content: (
        <div className="bg-gradient-to-br from-blue-50/80 to-purple-50/80 dark:from-blue-950/30 dark:to-purple-950/30 border border-blue-200/30 dark:border-blue-500/20 rounded-2xl p-5">
          <p className="text-sm text-slate-700 dark:text-slate-200">{t('step1.instruction')}</p>
        </div>
      )
    },
    {
      title: t('step2.title'),
      description: t('step2.description', { name: sellerName }),
      image: receiptImages[1],
      content: (
        <div className="bg-gradient-to-br from-purple-50/80 to-pink-50/80 dark:from-purple-950/30 dark:to-pink-950/30 border border-purple-200/30 dark:border-purple-500/20 rounded-2xl p-5">
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('step2.lookFor')}</p>
          <p className="text-lg font-bold text-slate-800 dark:text-white mt-1">{sellerName}</p>
        </div>
      )
    },
    {
      title: t('step3.title'),
      description: t('step3.description'),
      image: receiptImages[2],
      content: (
        <div className="space-y-4">
          {/* Critical warning */}
          <div className="bg-gradient-to-br from-red-50/90 to-orange-50/90 dark:from-red-950/40 dark:to-orange-950/40 border-2 border-red-300/50 dark:border-red-500/30 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">{t('step3.warningText')}</p>
            </div>
          </div>
          
          {/* Correct vs Wrong */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-300/50 dark:border-emerald-500/30 rounded-xl p-3 text-center">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-1" />
              <p className="font-bold text-emerald-800 dark:text-emerald-200 text-xs">{t('step3.correct')}</p>
              <p className="text-emerald-700 dark:text-emerald-300 font-mono text-xs mt-1">{isEnglish ? 'Apply for e-receipt' : '申请电子回单'}</p>
            </div>
            <div className="bg-red-50/80 dark:bg-red-950/30 border border-red-300/50 dark:border-red-500/30 rounded-xl p-3 text-center">
              <X className="h-6 w-6 text-red-600 dark:text-red-400 mx-auto mb-1" />
              <p className="font-bold text-red-800 dark:text-red-200 text-xs">{t('step3.wrong')}</p>
              <p className="text-red-700 dark:text-red-300 font-mono text-xs mt-1">{isEnglish ? 'Proof of Account Transactions' : '转账凭证'}</p>
            </div>
          </div>
        </div>
      )
    },
    {
      title: t('step4.title'),
      description: t('step4.description'),
      image: receiptImages[3],
      content: (
        <div className="bg-gradient-to-br from-blue-50/80 to-purple-50/80 dark:from-blue-950/30 dark:to-purple-950/30 border border-blue-200/30 dark:border-blue-500/20 rounded-2xl p-5">
          <p className="text-sm text-slate-700 dark:text-slate-200 mb-3">{t('step4.instruction')}</p>
          <div className="bg-blue-600 text-white font-bold py-2 px-6 rounded-xl text-center shadow-lg text-sm">
            {isEnglish ? 'Submit' : '申请'}
          </div>
        </div>
      )
    },
    {
      title: t('step5.title'),
      description: t('step5.description'),
      image: receiptImages[4],
      content: (
        <div className="bg-gradient-to-br from-purple-50/80 to-pink-50/80 dark:from-purple-950/30 dark:to-pink-950/30 border border-purple-200/30 dark:border-purple-500/20 rounded-2xl p-5">
          <p className="text-sm text-slate-700 dark:text-slate-200">{t('step5.instruction')}</p>
        </div>
      )
    },
    {
      title: t('step6.title'),
      description: t('step6.description'),
      image: receiptImages[5],
      content: (
        <div className="bg-gradient-to-br from-amber-50/80 to-orange-50/80 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200/30 dark:border-amber-500/20 rounded-2xl p-5">
          <p className="text-sm text-slate-700 dark:text-slate-200 mb-3">{t('step6.instruction')}</p>
          <div className="bg-white/60 dark:bg-slate-800/40 backdrop-blur-sm rounded-xl p-3 border border-slate-200/30 dark:border-slate-700/20">
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('step6.enterName')}</p>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xl font-bold text-slate-800 dark:text-white">{lastName}</p>
              <button
                onClick={copyLastName}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-100/50 dark:hover:bg-purple-900/30 rounded-lg transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">{t('copied') || 'Copied!'}</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>{t('copy') || 'Copy'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )
    },
    {
      title: t('step7.title'),
      description: t('step7.description'),
      image: receiptImages[6],
      content: (
        <div className="bg-gradient-to-br from-emerald-50/80 to-green-50/80 dark:from-emerald-950/30 dark:to-green-950/30 border border-emerald-200/30 dark:border-emerald-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">🎉</span>
            <p className="font-bold text-emerald-800 dark:text-emerald-100">{t('step7.success')}</p>
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-200">{t('step7.instruction')}</p>
        </div>
      )
    }
  ];

  const currentStepData = steps[currentStep];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200/50 dark:border-slate-700/30">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 dark:from-purple-950/40 dark:via-pink-950/40 dark:to-orange-950/40 p-6 border-b border-slate-200/50 dark:border-slate-700/30">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-800 transition-all shadow-sm hover:shadow-md"
          >
            <X className="h-5 w-5 text-slate-600 dark:text-slate-300" />
          </button>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 dark:from-purple-400 dark:via-pink-400 dark:to-orange-400">
              {t('title')}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {t('stepOf', { current: currentStep + 1, total: steps.length })}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="mt-4 flex items-center gap-1">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                  index <= currentStep 
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600' 
                    : 'bg-slate-200 dark:bg-slate-700'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid md:grid-cols-2 gap-0">
            {/* Left: Instructions */}
            <div className="p-6 space-y-4 border-r border-slate-200/50 dark:border-slate-700/30">
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {currentStepData.title}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {currentStepData.description}
                </p>
              </div>
              <div className="mt-4">
                {currentStepData.content}
              </div>
            </div>

            {/* Right: Screenshot */}
            <div className="p-6 bg-slate-50/50 dark:bg-slate-800/20 flex items-center justify-center">
              <div className="relative w-full max-w-xs mx-auto">
                <div className="bg-slate-900 rounded-[2.5rem] p-2 shadow-2xl">
                  <div className="bg-white rounded-[2rem] overflow-hidden">
                    <Image
                      src={currentStepData.image}
                      alt={`Step ${currentStep + 1}`}
                      width={300}
                      height={600}
                      className="w-full h-auto"
                      priority
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between p-5 border-t border-slate-200/50 dark:border-slate-700/30 bg-slate-50/50 dark:bg-slate-900/50">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            className="h-11 px-5 border-2 disabled:opacity-30 rounded-xl"
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            {t('previous')}
          </Button>
          
          <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            {currentStep + 1} / {steps.length}
          </div>

          {currentStep < steps.length - 1 ? (
            <Button
              onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
              className="h-11 px-5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold shadow-lg rounded-xl"
            >
              {t('next')}
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={onClose}
              className="h-11 px-5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white font-semibold shadow-lg rounded-xl"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {t('gotIt')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
