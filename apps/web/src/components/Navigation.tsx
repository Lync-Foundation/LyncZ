'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageSelector } from '@/components/LanguageSelector';
import { WalletButton } from '@/components/WalletButton';
import { useAccount } from 'wagmi';
import { usePrivy } from '@privy-io/react-auth';
import { useTranslations, useLocale } from 'next-intl';
import { Menu, X, Wallet } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useBuyerTrades } from '@/hooks/useBuyerTrades';

const ENABLE_DEBUG = process.env.NEXT_PUBLIC_ENABLE_DEBUG === 'true';

// Mobile Wallet Pill - uses both wagmi and Privy
function MobileWalletPill() {
  const { address, isConnected: wagmiConnected } = useAccount();
  const { authenticated, ready } = usePrivy();
  const t = useTranslations('nav');
  
  // User is truly connected only if both wagmi AND Privy agree
  const isConnected = wagmiConnected && authenticated && ready;
  
  const truncatedAddress = address 
    ? `${address.slice(0, 6)}...${address.slice(-4)}` 
    : '';

  if (!isConnected) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 text-emerald-700 dark:text-emerald-400 rounded-full text-xs font-medium border border-emerald-500/20">
      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
      <span className="font-mono">{truncatedAddress}</span>
    </div>
  );
}

export function Navigation() {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations('nav');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  
  // Wallet connection state - using both wagmi and Privy
  const { isConnected: wagmiConnected } = useAccount();
  const { authenticated, ready } = usePrivy();
  const isConnected = wagmiConnected && authenticated && ready;
  
  // Get pending buyer trades for notification badge
  const { data: buyerTradesData } = useBuyerTrades();
  const pendingBuyerTrades = isConnected 
    ? (buyerTradesData?.trades || []).filter(t => t.status === 0).length 
    : 0;

  const isActive = (path: string) => pathname === path;

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Track scroll for shadow effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  // Choose logo based on language
  const isTraditionalChinese = locale === 'zh-TW';
  const isSimplifiedChinese = locale === 'zh-CN';
  const isChinese = isTraditionalChinese || isSimplifiedChinese;
  
  // Use correct Traditional/Simplified Chinese logo
  const logoSrc = isTraditionalChinese 
    ? '/logo-compact-zh-TW.svg' 
    : isSimplifiedChinese 
      ? '/logo-compact-zh.svg' 
      : '/logo-compact.svg';
  const logoWidth = isChinese ? 140 : 120;
  const logoAlt = isTraditionalChinese ? '靈犀支付' : isSimplifiedChinese ? '灵犀支付' : 'LyncZ';

  return (
    <nav className={`sticky top-0 z-50 transition-all duration-300 ${
      scrolled 
        ? 'bg-white/40 dark:bg-slate-950/40 backdrop-blur-xl shadow-lg shadow-slate-900/5 dark:shadow-slate-100/5' 
        : 'bg-white/20 dark:bg-slate-950/20 backdrop-blur-md'
    }`}>
      <div className="container mx-auto px-4 py-3">
        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center justify-between">
          {/* Logo with icon */}
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity group">
            <div className="relative">
              <Image 
                src="/logo-avatar.svg"
                alt="LyncZ Icon" 
                width={36}
                height={36}
                className="rounded-lg transition-transform group-hover:scale-105"
                priority
              />
              {/* Subtle glow effect on hover */}
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 blur-sm transition-opacity" />
            </div>
            <Image 
              src={logoSrc}
              alt={logoAlt} 
              width={logoWidth}
              height={40}
              priority
            />
          </Link>

          {/* Navigation Links */}
          <div className="flex items-center gap-1">
            <Link href="/buy">
              <Button 
                variant="ghost"
                className={`transition-all duration-200 font-medium ${
                  isActive('/buy') || pathname?.startsWith('/buy/')
                    ? 'bg-purple-100/50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t('buyTokens')}
              </Button>
            </Link>
            <Link href="/sell">
              <Button 
                variant="ghost"
                className={`transition-all duration-200 font-medium ${
                  isActive('/sell')
                    ? 'bg-purple-100/50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t('sellTokens')}
              </Button>
            </Link>
            <Link href="/account" className="relative">
              <Button 
                variant="ghost"
                className={`transition-all duration-200 font-medium ${
                  isActive('/account')
                    ? 'bg-purple-100/50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t('myAccount')}
              </Button>
              {pendingBuyerTrades > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-full min-w-[18px] text-center">
                  {pendingBuyerTrades}
                </span>
              )}
            </Link>
            <Link href="/docs">
              <Button 
                variant="ghost"
                className={`transition-all duration-200 font-medium ${
                  isActive('/docs') || pathname?.startsWith('/docs/')
                    ? 'bg-purple-100/50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t('docs')}
              </Button>
            </Link>
            <Link href="/blog">
              <Button 
                variant="ghost"
                className={`transition-all duration-200 font-medium ${
                  isActive('/blog') || pathname?.startsWith('/blog/')
                    ? 'bg-purple-100/50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t('blog')}
              </Button>
            </Link>
            {ENABLE_DEBUG && (
              <Link href="/debug">
                <Button 
                  variant="ghost"
                  size="sm"
                  className={`transition-all duration-200 font-medium ${
                    isActive('/debug')
                      ? 'bg-purple-100/50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100/50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  {t('debug')}
                </Button>
              </Link>
            )}

            {/* Separator */}
            <div className="w-px h-6 bg-gradient-to-b from-transparent via-slate-300 dark:via-slate-700 to-transparent mx-2" />

            {/* Language Selector */}
            <LanguageSelector />

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Wallet Connection */}
            <div className="ml-2">
              <WalletButton />
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden">
          <div className="flex items-center justify-between">
            {/* Logo with icon */}
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <Image 
                src="/logo-avatar.svg"
                alt="LyncZ Icon" 
                width={28}
                height={28}
                className="rounded-md"
                priority
              />
              <Image 
                src={logoSrc}
                alt={logoAlt} 
                width={logoWidth * 0.7}
                height={28}
                priority
              />
            </Link>

            {/* Right side: Wallet Pill + Menu Button */}
            <div className="flex items-center gap-2">
              {/* Wallet Status Pill */}
              <MobileWalletPill />

              {/* Mobile Menu Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMobileMenuOpen(!mobileMenuOpen);
                }}
                className="p-2 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950/30 transition-colors"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <X className="h-6 w-6 text-slate-700 dark:text-slate-300" />
                ) : (
                  <Menu className="h-6 w-6 text-slate-700 dark:text-slate-300" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile Menu Dropdown */}
          {mobileMenuOpen && (
            <>
              {/* Full-screen backdrop overlay */}
              <div 
                className="fixed inset-0 bg-black/30 backdrop-blur-sm z-30"
                onClick={() => setMobileMenuOpen(false)}
                aria-hidden="true"
              />
              
              <div className="absolute left-0 right-0 top-full bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/50 shadow-2xl z-50">
                {/* Gradient accent */}
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-blue-500/50 via-purple-500/50 to-pink-500/50" />
              
                <div className="container mx-auto px-4 py-4 flex flex-col gap-2">
                {/* Navigation Links */}
                <Link href="/buy" onClick={() => setMobileMenuOpen(false)}>
                  <Button 
                    variant="ghost"
                    className={`w-full justify-start transition-all font-medium ${
                      isActive('/buy') || pathname?.startsWith('/buy/')
                        ? 'bg-purple-100/50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                        : 'text-slate-600 dark:text-slate-300 active:bg-slate-100/50 dark:active:bg-slate-800/50'
                    }`}
                  >
                    {t('buyTokens')}
                  </Button>
                </Link>
                <Link href="/sell" onClick={() => setMobileMenuOpen(false)}>
                  <Button 
                    variant="ghost"
                    className={`w-full justify-start transition-all font-medium ${
                      isActive('/sell')
                        ? 'bg-purple-100/50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                        : 'text-slate-600 dark:text-slate-300 active:bg-slate-100/50 dark:active:bg-slate-800/50'
                    }`}
                  >
                    {t('sellTokens')}
                  </Button>
                </Link>
                <Link href="/account" onClick={() => setMobileMenuOpen(false)} className="relative">
                  <Button 
                    variant="ghost"
                    className={`w-full justify-start transition-all font-medium ${
                      isActive('/account')
                        ? 'bg-purple-100/50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                        : 'text-slate-600 dark:text-slate-300 active:bg-slate-100/50 dark:active:bg-slate-800/50'
                    }`}
                  >
                    {t('myAccount')}
                    {pendingBuyerTrades > 0 && (
                      <span className="ml-2 px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-600 border border-red-200 rounded-full min-w-[18px] text-center">
                        {pendingBuyerTrades}
                      </span>
                    )}
                  </Button>
                </Link>
                <Link href="/docs" onClick={() => setMobileMenuOpen(false)}>
                  <Button 
                    variant="ghost"
                    className={`w-full justify-start transition-all font-medium ${
                      isActive('/docs') || pathname?.startsWith('/docs/')
                        ? 'bg-purple-100/50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                        : 'text-slate-600 dark:text-slate-300 active:bg-slate-100/50 dark:active:bg-slate-800/50'
                    }`}
                  >
                    {t('docs')}
                  </Button>
                </Link>
                <Link href="/blog" onClick={() => setMobileMenuOpen(false)}>
                  <Button 
                    variant="ghost"
                    className={`w-full justify-start transition-all font-medium ${
                      isActive('/blog') || pathname?.startsWith('/blog/')
                        ? 'bg-purple-100/50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                        : 'text-slate-600 dark:text-slate-300 active:bg-slate-100/50 dark:active:bg-slate-800/50'
                    }`}
                  >
                    {t('blog')}
                  </Button>
                </Link>
                {ENABLE_DEBUG && (
                  <Link href="/debug" onClick={() => setMobileMenuOpen(false)}>
                    <Button 
                      variant="ghost"
                      size="sm"
                      className={`w-full justify-start transition-all font-medium ${
                        isActive('/debug')
                          ? 'bg-purple-100/50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                          : 'text-slate-600 dark:text-slate-300 active:bg-slate-100/50 dark:active:bg-slate-800/50'
                      }`}
                    >
                      {t('debug')}
                    </Button>
                  </Link>
                )}

                {/* Controls */}
                <div className="flex items-center justify-between gap-4 pt-4 mt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                  <div className="flex items-center gap-3">
                    <LanguageSelector />
                    <ThemeToggle />
                  </div>
                  <WalletButton />
                </div>
              </div>
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
