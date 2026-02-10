'use client';

import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useAccount, useSwitchChain, useDisconnect } from 'wagmi';
import { base, mainnet } from 'wagmi/chains';
import { Button } from '@/components/ui/button';
import { Wallet, AlertTriangle, Loader2, LogOut, ChevronDown, RefreshCw, Plus } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import { useState, useRef, useEffect } from 'react';
import { SUPPORTED_CHAIN_IDS } from '@/lib/wagmi';

const LAST_WALLET_KEY = 'lyncz_last_wallet';

const translations = {
  en: {
    connect: 'Connect',
    switchToBase: 'Switch to Base',
    wrongNetwork: 'Wrong Network',
    disconnect: 'Disconnect',
    connected: 'Connected',
    resumeWallet: 'Resume with',
    useDifferent: 'Use Different Wallet',
    chooseWallet: 'Choose Wallet',
    loading: 'Loading...',
  },
  'zh-CN': {
    connect: '连接钱包',
    switchToBase: '切换到 Base',
    wrongNetwork: '网络错误',
    disconnect: '断开连接',
    connected: '已连接',
    resumeWallet: '继续使用',
    useDifferent: '使用其他钱包',
    chooseWallet: '选择钱包',
    loading: '加载中...',
  },
  'zh-TW': {
    connect: '連接錢包',
    switchToBase: '切換到 Base',
    wrongNetwork: '網絡錯誤',
    disconnect: '斷開連接',
    connected: '已連接',
    resumeWallet: '繼續使用',
    useDifferent: '使用其他錢包',
    chooseWallet: '選擇錢包',
    loading: '載入中...',
  },
};

export function WalletButton() {
  const { login, logout, authenticated, ready } = usePrivy();
  const { wallets } = useWallets();
  const { chainId, isConnected, address } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { disconnect } = useDisconnect();
  const { locale } = useLocale();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showWalletChoice, setShowWalletChoice] = useState(false);
  const [lastWallet, setLastWallet] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const choiceRef = useRef<HTMLDivElement>(null);
  
  const t = translations[locale as keyof typeof translations] || translations.en;
  const isWrongNetwork = isConnected && chainId !== undefined && !(SUPPORTED_CHAIN_IDS as readonly number[]).includes(chainId);
  
  // Load last used wallet from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(LAST_WALLET_KEY);
      if (saved) setLastWallet(saved);
    }
  }, []);
  
  // Check for fresh connect flag (set when user clicked "Use Different Wallet")
  // This auto-opens login after the page reloads
  useEffect(() => {
    if (typeof window !== 'undefined' && ready && !authenticated) {
      const shouldFreshConnect = sessionStorage.getItem('lyncz_fresh_connect');
      if (shouldFreshConnect) {
        sessionStorage.removeItem('lyncz_fresh_connect');
        // Small delay to ensure Privy is fully ready
        setTimeout(() => {
          login();
        }, 200);
      }
    }
  }, [ready, authenticated, login]);
  
  // Save current wallet to localStorage when connected
  useEffect(() => {
    if (address && typeof window !== 'undefined') {
      localStorage.setItem(LAST_WALLET_KEY, address);
      setLastWallet(address);
    }
  }, [address]);
  
  // Handle full disconnect - both Privy and wagmi
  const handleDisconnect = async () => {
    setShowDropdown(false);
    try {
      // Disconnect wagmi first
      disconnect();
      // Then logout from Privy
      await logout();
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
  };
  
  // Handle connect button click - show choice if last wallet exists
  const handleConnectClick = () => {
    if (lastWallet) {
      setShowWalletChoice(true);
    } else {
      // No previous wallet, just use normal login
      login();
    }
  };
  
  // Resume with previous wallet (uses login which remembers the wallet)
  const handleResumeWallet = () => {
    setShowWalletChoice(false);
    login();
  };
  
  // Use a different wallet - clear all Privy data and reload to start fresh
  const handleDifferentWallet = async () => {
    setShowWalletChoice(false);
    
    if (typeof window !== 'undefined') {
      // Clear our last wallet preference
      localStorage.removeItem(LAST_WALLET_KEY);
      
      // Clear ALL Privy-related localStorage entries
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.includes('privy') ||
          key.includes('Privy') ||
          key.includes('wagmi') ||
          key.includes('walletconnect') ||
          key.includes('wc@') ||
          key.includes('WALLETCONNECT')
        )) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // Clear session storage
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key && (key.includes('privy') || key.includes('wagmi'))) {
          sessionStorage.removeItem(key);
        }
      }
      
      // Clear all site cookies
      document.cookie.split(';').forEach(cookie => {
        const name = cookie.split('=')[0].trim();
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`;
      });
      
      // Clear IndexedDB databases (Privy may store data here)
      try {
        const databases = await window.indexedDB.databases();
        for (const db of databases) {
          if (db.name) {
            window.indexedDB.deleteDatabase(db.name);
          }
        }
      } catch (e) {
        // indexedDB.databases() not supported in all browsers, that's ok
      }
      
      // Set a flag to auto-open login after reload
      sessionStorage.setItem('lyncz_fresh_connect', 'true');
      
      // Force full page reload to reinitialize Privy from scratch
      window.location.reload();
    }
  };
  
  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
      if (choiceRef.current && !choiceRef.current.contains(event.target as Node)) {
        setShowWalletChoice(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Truncate address
  const truncatedAddress = address 
    ? `${address.slice(0, 6)}...${address.slice(-4)}` 
    : '';

  // Still loading Privy
  if (!ready) {
    return (
      <Button disabled className="bg-gradient-to-r from-blue-500/30 via-purple-500/25 to-pink-500/30 backdrop-blur-2xl text-white font-medium border border-white/40 shadow-[0_8px_32px_rgba(139,92,246,0.15),inset_0_1px_0_rgba(255,255,255,0.2)] px-3 md:px-5 py-2 text-sm">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t.loading}
      </Button>
    );
  }

  // If on wrong network (unsupported chain), show switch button
  if (isWrongNetwork) {
    return (
      <Button
        onClick={() => switchChain({ chainId: base.id })}
        disabled={isSwitching}
        className="bg-red-500 hover:bg-red-600 text-white font-medium"
      >
        {isSwitching ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <AlertTriangle className="mr-2 h-4 w-4" />
        )}
        {t.wrongNetwork}
      </Button>
    );
  }

  // Connected state with dropdown
  if (authenticated && isConnected) {
    return (
      <div className="relative" ref={dropdownRef}>
        <Button
          onClick={() => setShowDropdown(!showDropdown)}
          className="bg-gradient-to-r from-blue-500/30 via-purple-500/25 to-pink-500/30 hover:from-blue-500/40 hover:via-purple-500/35 hover:to-pink-500/40 backdrop-blur-2xl text-white font-medium border border-white/40 shadow-[0_8px_32px_rgba(139,92,246,0.15),inset_0_1px_0_rgba(255,255,255,0.2)] hover:shadow-[0_8px_32px_rgba(139,92,246,0.25),inset_0_1px_0_rgba(255,255,255,0.3)] transition-all duration-300 px-3 md:px-5 py-2 text-sm"
        >
          <span className="w-2 h-2 bg-emerald-400 rounded-full mr-2 animate-pulse" />
          {truncatedAddress}
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
        
        {showDropdown && (
          <div className="absolute right-0 mt-2 w-48 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-purple-200/15 dark:border-purple-500/10 rounded-xl shadow-lg shadow-purple-500/10 z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-purple-200/10 dark:border-purple-500/10">
              <p className="text-xs text-slate-500/80 dark:text-slate-400/80">{t.connected}</p>
              <p className="text-sm text-slate-700 dark:text-white/90 font-mono">{truncatedAddress}</p>
            </div>
            <button
              onClick={handleDisconnect}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-500/80 dark:text-red-400/80 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300 transition-all duration-200 rounded-lg mx-1 my-1"
              style={{ width: 'calc(100% - 0.5rem)' }}
            >
              <LogOut className="w-4 h-4" />
              {t.disconnect}
            </button>
          </div>
        )}
      </div>
    );
  }

  // Truncate last wallet for display
  const truncatedLastWallet = lastWallet 
    ? `${lastWallet.slice(0, 6)}...${lastWallet.slice(-4)}` 
    : '';

  // Not connected - show connect button with optional wallet choice
  return (
    <div className="relative" ref={choiceRef}>
      <Button
        onClick={handleConnectClick}
        className="bg-gradient-to-r from-blue-500/30 via-purple-500/25 to-pink-500/30 hover:from-blue-500/40 hover:via-purple-500/35 hover:to-pink-500/40 backdrop-blur-2xl text-white font-medium border border-white/40 shadow-[0_8px_32px_rgba(139,92,246,0.15),inset_0_1px_0_rgba(255,255,255,0.2)] hover:shadow-[0_12px_40px_rgba(139,92,246,0.25),inset_0_1px_0_rgba(255,255,255,0.3)] hover:-translate-y-0.5 transition-all duration-300 px-3 md:px-5 py-2 text-sm"
      >
        <Wallet className="mr-2 h-4 w-4" />
        {t.connect}
      </Button>
      
      {/* Wallet choice popup - shown when there's a previous wallet */}
      {showWalletChoice && lastWallet && (
        <div className="absolute right-0 mt-2 w-64 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-purple-200/20 dark:border-purple-500/15 rounded-xl shadow-xl shadow-purple-500/10 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-purple-200/10 dark:border-purple-500/10">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{t.chooseWallet}</p>
          </div>
          
          {/* Resume with previous wallet */}
          <button
            onClick={handleResumeWallet}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 dark:text-white hover:bg-purple-500/10 transition-all duration-200"
          >
            <RefreshCw className="w-4 h-4 text-purple-500" />
            <div className="flex flex-col items-start">
              <span className="font-medium">{t.resumeWallet}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">{truncatedLastWallet}</span>
            </div>
          </button>
          
          {/* Use different wallet */}
          <button
            onClick={handleDifferentWallet}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 dark:text-white hover:bg-purple-500/10 transition-all duration-200 border-t border-purple-200/10 dark:border-purple-500/10"
          >
            <Plus className="w-4 h-4 text-blue-500" />
            <span className="font-medium">{t.useDifferent}</span>
          </button>
        </div>
      )}
    </div>
  );
}

// Simple connect button for pages that just need a connect prompt
export function ConnectWalletButton({ className = '' }: { className?: string }) {
  const { login, authenticated, ready } = usePrivy();
  const { isConnected } = useAccount();
  const { locale } = useLocale();
  
  const t = translations[locale as keyof typeof translations] || translations.en;

  if (!ready) {
    return (
      <Button disabled className={className}>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t.loading}
      </Button>
    );
  }

  if (authenticated && isConnected) return null;

  return (
    <Button
      onClick={login}
      className={`bg-gradient-to-r from-blue-500/30 via-purple-500/25 to-pink-500/30 hover:from-blue-500/40 hover:via-purple-500/35 hover:to-pink-500/40 backdrop-blur-2xl text-white font-medium border border-white/40 shadow-[0_8px_32px_rgba(139,92,246,0.15),inset_0_1px_0_rgba(255,255,255,0.2)] hover:shadow-[0_8px_32px_rgba(139,92,246,0.25),inset_0_1px_0_rgba(255,255,255,0.3)] transition-all duration-300 px-3 md:px-5 py-2 text-sm ${className}`}
    >
      <Wallet className="mr-2 h-4 w-4" />
      {t.connect}
    </Button>
  );
}

// Network badge component - supports multiple chains
export function NetworkBadge({ className = '' }: { className?: string }) {
  const { isConnected: wagmiConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  const { authenticated, ready } = usePrivy();
  
  // Check both wagmi AND Privy connection state
  const isConnected = wagmiConnected && authenticated && ready;
  
  if (!isConnected) return null;
  
  const isSupportedNetwork = chainId !== undefined && (SUPPORTED_CHAIN_IDS as readonly number[]).includes(chainId);
  
  if (isSupportedNetwork) {
    // Show current chain name with appropriate color
    const isBase = chainId === base.id;
    const chainName = isBase ? 'Base' : 'Ethereum';
    const colorClasses = isBase 
      ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20'
      : 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20';
    const dotColor = isBase ? 'bg-blue-500' : 'bg-purple-500';
    
    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 ${colorClasses} rounded-full text-sm font-medium border ${className}`}>
        <span className={`w-2 h-2 ${dotColor} rounded-full animate-pulse`}></span>
        {chainName}
      </div>
    );
  }
  
  return (
    <button
      onClick={() => switchChain({ chainId: base.id })}
      disabled={isPending}
      className={`flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-700 dark:text-red-400 rounded-full text-sm font-medium border border-red-500/20 hover:bg-red-500/20 transition-colors ${className}`}
    >
      {isPending ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <AlertTriangle className="w-3 h-3" />
      )}
      Switch Network
    </button>
  );
}
