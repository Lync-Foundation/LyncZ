'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Send, Github, Twitter, Mail, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export function Footer() {
  const t = useTranslations('footer');
  const locale = useLocale();
  
  // Choose logo based on language
  const isTraditionalChinese = locale === 'zh-TW';
  const isSimplifiedChinese = locale === 'zh-CN';
  const isChinese = isTraditionalChinese || isSimplifiedChinese;
  
  // Use same logo as Navigation (logo-compact*) for consistent look
  const logoSrc = isTraditionalChinese 
    ? '/logo-compact-zh-TW.svg' 
    : isSimplifiedChinese 
      ? '/logo-compact-zh.svg' 
      : '/logo-compact.svg';
  const logoAlt = isTraditionalChinese ? '靈犀支付' : isSimplifiedChinese ? '灵犀支付' : 'LyncZ';
  const logoWidth = isChinese ? 160 : 130;

  return (
    <footer className="relative z-20 bg-slate-50 dark:bg-slate-950">
      <div className="container mx-auto px-4 py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          {/* Logo & Description */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 mb-5">
              <Image 
                src="/logo-avatar.svg"
                alt="LyncZ Icon" 
                width={40}
                height={40}
                className="rounded-lg"
              />
              <Image 
                src={logoSrc}
                alt={logoAlt} 
                width={logoWidth}
                height={40}
              />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-md leading-relaxed">
              {t('description')}
            </p>
            
            {/* Social Links - lighter style */}
            <div className="flex items-center gap-2 mb-4">
              <a 
                href="https://github.com/anonysatoshi/LyncZ" 
                target="_blank" 
                rel="noopener noreferrer"
                className="group w-9 h-9 rounded-lg bg-slate-100/50 dark:bg-slate-800/30 border border-slate-200/50 dark:border-slate-700/30 flex items-center justify-center hover:border-purple-300/50 hover:bg-purple-50/50 dark:hover:bg-purple-900/20 transition-all duration-300"
              >
                <Github className="h-4 w-4 text-slate-400 dark:text-slate-500 group-hover:text-purple-500 dark:group-hover:text-purple-400 transition-colors" />
              </a>
              <a 
                href="https://twitter.com/LyncZApp" 
                target="_blank" 
                rel="noopener noreferrer"
                className="group w-9 h-9 rounded-lg bg-slate-100/50 dark:bg-slate-800/30 border border-slate-200/50 dark:border-slate-700/30 flex items-center justify-center hover:border-purple-300/50 hover:bg-purple-50/50 dark:hover:bg-purple-900/20 transition-all duration-300"
              >
                <Twitter className="h-4 w-4 text-slate-400 dark:text-slate-500 group-hover:text-purple-500 dark:group-hover:text-purple-400 transition-colors" />
              </a>
              <a 
                href="mailto:contact@lync-z.xyz"
                className="group w-9 h-9 rounded-lg bg-slate-100/50 dark:bg-slate-800/30 border border-slate-200/50 dark:border-slate-700/30 flex items-center justify-center hover:border-purple-300/50 hover:bg-purple-50/50 dark:hover:bg-purple-900/20 transition-all duration-300"
              >
                <Mail className="h-4 w-4 text-slate-400 dark:text-slate-500 group-hover:text-purple-500 dark:group-hover:text-purple-400 transition-colors" />
              </a>
            </div>
            
            {/* Contact email */}
            <a 
              href="mailto:contact@lync-z.xyz"
              className="inline-flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 hover:text-purple-500 dark:hover:text-purple-400 transition-colors"
            >
              <span>📧</span>
              <span>contact@lync-z.xyz</span>
            </a>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-medium text-slate-600 dark:text-slate-300 mb-4 text-xs uppercase tracking-widest">{t('quickLinks')}</h3>
            <ul className="space-y-2.5">
              <li>
                <Link href="/buy" className="text-sm text-slate-400 dark:text-slate-500 hover:text-purple-500 dark:hover:text-purple-400 transition-colors">
                  {t('buy')}
                </Link>
              </li>
              <li>
                <Link href="/sell" className="text-sm text-slate-400 dark:text-slate-500 hover:text-purple-500 dark:hover:text-purple-400 transition-colors">
                  {t('sell')}
                </Link>
              </li>
              <li>
                <Link href="/account" className="text-sm text-slate-400 dark:text-slate-500 hover:text-purple-500 dark:hover:text-purple-400 transition-colors">
                  {t('myAccount')}
                </Link>
              </li>
              <li>
                <Link href="/docs" className="text-sm text-slate-400 dark:text-slate-500 hover:text-purple-500 dark:hover:text-purple-400 transition-colors">
                  {t('docs')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="font-medium text-slate-600 dark:text-slate-300 mb-4 text-xs uppercase tracking-widest">{t('resources')}</h3>
            <ul className="space-y-2.5">
              <li>
                <a 
                  href="https://github.com/anonysatoshi/LyncZ" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-slate-400 dark:text-slate-500 hover:text-purple-500 dark:hover:text-purple-400 transition-colors"
                >
                  GitHub
                  <ExternalLink className="w-3 h-3 opacity-40" />
                </a>
              </li>
              <li>
                <Link 
                  href="/docs" 
                  className="text-sm text-slate-400 dark:text-slate-500 hover:text-purple-500 dark:hover:text-purple-400 transition-colors"
                >
                  {t('docs')}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Telegram Join Section - lighter, more transparent */}
        <div className="relative rounded-xl bg-purple-50/30 dark:bg-purple-900/10 border border-purple-200/30 dark:border-purple-800/20 p-5 mb-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100/50 dark:bg-purple-800/20 border border-purple-200/50 dark:border-purple-700/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <Send className="h-4 w-4 text-purple-400 dark:text-purple-500" />
              </div>
              <div>
                <h4 className="font-medium text-slate-700 dark:text-slate-200 text-sm">{t('telegram.title')}</h4>
                <p className="text-xs text-slate-400 dark:text-slate-500">{t('telegram.subtitle')}</p>
              </div>
            </div>
            <a
              href="https://t.me/LyncZCommunity"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 text-sm font-medium rounded-lg border border-purple-300/30 dark:border-purple-600/30 transition-all"
            >
              <Send className="h-3.5 w-3.5" />
              {t('telegram.join')}
            </a>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-slate-200/30 dark:border-slate-700/30 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-xs text-slate-400 dark:text-slate-500">
            © 2026 <span className="text-purple-500/80 dark:text-purple-400/80 font-medium">LyncZ</span>. {t('rights')}
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-500 dark:text-emerald-400/80 rounded-md text-xs font-medium border border-emerald-200/30 dark:border-emerald-700/20">
              <span className="w-1.5 h-1.5 bg-emerald-400 dark:bg-emerald-500 rounded-full animate-pulse" />
              {t('live')}
            </span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">{t('network')}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
