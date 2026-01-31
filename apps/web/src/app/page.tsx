'use client';

import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, Zap, Terminal, Shield, Lock, Globe, Cpu, ExternalLink, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';

// Smooth animation variants
const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] as const }
  }
};

const fadeInScale = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as const }
  }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.1
    }
  }
};

const staggerItem = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const }
  }
};

const slideFromLeft = {
  hidden: { opacity: 0, x: -60 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] as const }
  }
};

const slideFromRight = {
  hidden: { opacity: 0, x: 60 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] as const }
  }
};

// Rotating trust phrases
// Trust phrases are now defined inside the component using translations

// Minimal floating text - just a few subtle hints, not distracting
const FLOATING_ELEMENTS: { text: string; size: string }[] = [
  { text: 'y² = x³ + 7', size: 'sm' },
  { text: 'H(m)', size: 'sm' },
  { text: 'π', size: 'sm' },
  { text: 'σ', size: 'sm' },
  { text: '✓', size: 'sm' },
];

// SVG visual elements for cryptographic concepts
const CryptoVisuals = () => (
  <>
    {/* Elliptic Curve Visual 1 - Weierstrass form y² = x³ + ax + b (secp256k1-like) - VISIBLE ON MOBILE - 1.5x larger */}
    <motion.svg
      className="absolute w-64 h-64 md:w-[480px] md:h-[480px] opacity-[0.05] md:opacity-30 dark:opacity-[0.06] dark:md:opacity-40 left-[30%] md:left-0"
      style={{ top: '38%' }}
      viewBox="0 0 120 120"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: [0.15, 0.35, 0.15], scale: [0.95, 1, 0.95] }}
      transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
    >
      {/* Axes */}
      <line x1="10" y1="60" x2="110" y2="60" stroke="#6366f1" strokeWidth="1" opacity="0.4" />
      <line x1="40" y1="10" x2="40" y2="110" stroke="#6366f1" strokeWidth="1" opacity="0.4" />
      {/* Elliptic curve - upper branch (realistic secp256k1-like shape) */}
      <path
        d="M 45 60 C 45 45, 55 25, 70 20 C 85 15, 100 25, 110 35"
        fill="none"
        stroke="url(#ecGradient)"
        strokeWidth="3.5"
      />
      {/* Elliptic curve - lower branch (mirror) */}
      <path
        d="M 45 60 C 45 75, 55 95, 70 100 C 85 105, 100 95, 110 85"
        fill="none"
        stroke="url(#ecGradient)"
        strokeWidth="3.5"
      />
      {/* Points P and Q on curve */}
      <circle cx="55" cy="38" r="4" fill="#3b82f6" />
      <text x="55" y="32" fontSize="8" fill="#3b82f6" textAnchor="middle" opacity="0.8">P</text>
      <circle cx="80" cy="25" r="4" fill="#8b5cf6" />
      <text x="80" y="19" fontSize="8" fill="#8b5cf6" textAnchor="middle" opacity="0.8">Q</text>
      {/* Point R (P + Q result) */}
      <circle cx="95" cy="78" r="4" fill="#ec4899" />
      <text x="95" y="90" fontSize="8" fill="#ec4899" textAnchor="middle" opacity="0.8">R</text>
      {/* Line through P and Q */}
      <line x1="45" y1="48" x2="100" y2="18" stroke="#a855f7" strokeWidth="0.8" strokeDasharray="3,3" opacity="0.5" />
      {/* Vertical line to R */}
      <line x1="95" y1="32" x2="95" y2="78" stroke="#ec4899" strokeWidth="0.8" strokeDasharray="2,2" opacity="0.4" />
      <defs>
        <linearGradient id="ecGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
      </defs>
    </motion.svg>

    {/* Elliptic Curve Visual 2 - Clean twisted Edwards form (Ed25519-like) - DESKTOP ONLY */}
    <motion.svg
      className="absolute hidden md:block md:w-80 md:h-80 md:opacity-22 dark:md:opacity-28"
      style={{ right: '5%', top: '55%' }}
      viewBox="0 0 120 120"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: [0.10, 0.24, 0.10], scale: [0.98, 1.02, 0.98] }}
      transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
    >
      {/* Axes */}
      <line x1="10" y1="60" x2="110" y2="60" stroke="#10b981" strokeWidth="1" opacity="0.3" />
      <line x1="60" y1="10" x2="60" y2="110" stroke="#10b981" strokeWidth="1" opacity="0.3" />
      {/* Edwards curve - elegant symmetric shape resembling a squashed circle */}
      <ellipse cx="60" cy="60" rx="42" ry="42" fill="none" stroke="url(#ecGradient2)" strokeWidth="2.5" opacity="0.8" />
      {/* Inner twisted curve for visual interest */}
      <ellipse cx="60" cy="60" rx="28" ry="28" fill="none" stroke="url(#ecGradient2)" strokeWidth="1.5" opacity="0.4" strokeDasharray="4,4" />
      {/* Base point G */}
      <circle cx="60" cy="18" r="4" fill="#10b981" />
      <text x="60" y="12" fontSize="8" fill="#10b981" textAnchor="middle" opacity="0.8">G</text>
      {/* Point kG (scalar multiplication result) */}
      <circle cx="95" cy="75" r="4" fill="#06b6d4" />
      <text x="103" y="80" fontSize="8" fill="#06b6d4" textAnchor="middle" opacity="0.8">kG</text>
      {/* Connecting arc showing the operation */}
      <path d="M 64 20 Q 100 30, 95 70" fill="none" stroke="#06b6d4" strokeWidth="1" strokeDasharray="3,3" opacity="0.5" />
      <defs>
        <linearGradient id="ecGradient2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="50%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
    </motion.svg>

    {/* Merkle Tree Visual - Bottom center */}
    <motion.svg
      className="absolute w-32 h-32 md:w-52 md:h-52 opacity-[0.12] md:opacity-15 dark:opacity-[0.15] dark:md:opacity-25"
      style={{ left: '40%', top: '78%' }}
      viewBox="0 0 120 100"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0.1, 0.2, 0.1] }}
      transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
    >
      {/* Root */}
      <rect x="50" y="5" width="20" height="12" rx="2" fill="#8b5cf6" opacity="0.6" />
      {/* Level 1 */}
      <rect x="25" y="30" width="18" height="10" rx="2" fill="#a855f7" opacity="0.5" />
      <rect x="77" y="30" width="18" height="10" rx="2" fill="#a855f7" opacity="0.5" />
      {/* Level 2 */}
      <rect x="10" y="55" width="15" height="8" rx="2" fill="#c084fc" opacity="0.4" />
      <rect x="32" y="55" width="15" height="8" rx="2" fill="#c084fc" opacity="0.4" />
      <rect x="73" y="55" width="15" height="8" rx="2" fill="#c084fc" opacity="0.4" />
      <rect x="95" y="55" width="15" height="8" rx="2" fill="#c084fc" opacity="0.4" />
      {/* Leaves */}
      <rect x="5" y="75" width="12" height="6" rx="1" fill="#e879f9" opacity="0.3" />
      <rect x="20" y="75" width="12" height="6" rx="1" fill="#e879f9" opacity="0.3" />
      <rect x="35" y="75" width="12" height="6" rx="1" fill="#e879f9" opacity="0.3" />
      <rect x="50" y="75" width="12" height="6" rx="1" fill="#e879f9" opacity="0.3" />
      <rect x="65" y="75" width="12" height="6" rx="1" fill="#e879f9" opacity="0.3" />
      <rect x="80" y="75" width="12" height="6" rx="1" fill="#e879f9" opacity="0.3" />
      <rect x="95" y="75" width="12" height="6" rx="1" fill="#e879f9" opacity="0.3" />
      {/* Connecting lines */}
      <line x1="60" y1="17" x2="34" y2="30" stroke="#8b5cf6" strokeWidth="0.5" opacity="0.4" />
      <line x1="60" y1="17" x2="86" y2="30" stroke="#8b5cf6" strokeWidth="0.5" opacity="0.4" />
      <line x1="34" y1="40" x2="17" y2="55" stroke="#a855f7" strokeWidth="0.5" opacity="0.3" />
      <line x1="34" y1="40" x2="40" y2="55" stroke="#a855f7" strokeWidth="0.5" opacity="0.3" />
      <line x1="86" y1="40" x2="80" y2="55" stroke="#a855f7" strokeWidth="0.5" opacity="0.3" />
      <line x1="86" y1="40" x2="103" y2="55" stroke="#a855f7" strokeWidth="0.5" opacity="0.3" />
    </motion.svg>

    {/* Digital Signature Visual - Bottom left */}
    <motion.svg
      className="absolute w-28 h-28 md:w-40 md:h-40 opacity-[0.12] md:opacity-15 dark:opacity-[0.15] dark:md:opacity-25"
      style={{ left: '5%', top: '85%' }}
      viewBox="0 0 100 100"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0.1, 0.2, 0.1] }}
      transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
    >
      {/* Document */}
      <rect x="20" y="10" width="40" height="50" rx="3" fill="none" stroke="#6366f1" strokeWidth="1" opacity="0.5" />
      <line x1="28" y1="22" x2="52" y2="22" stroke="#6366f1" strokeWidth="0.5" opacity="0.3" />
      <line x1="28" y1="30" x2="52" y2="30" stroke="#6366f1" strokeWidth="0.5" opacity="0.3" />
      <line x1="28" y1="38" x2="45" y2="38" stroke="#6366f1" strokeWidth="0.5" opacity="0.3" />
      {/* Signature curve */}
      <path d="M 25 52 Q 35 45, 45 52 T 55 48" fill="none" stroke="#ec4899" strokeWidth="1.5" opacity="0.6" />
      {/* Key */}
      <circle cx="75" cy="35" r="10" fill="none" stroke="#8b5cf6" strokeWidth="1" opacity="0.5" />
      <rect x="73" y="45" width="4" height="15" rx="1" fill="#8b5cf6" opacity="0.4" />
      <rect x="71" y="55" width="3" height="3" fill="#8b5cf6" opacity="0.3" />
      <rect x="76" y="52" width="3" height="3" fill="#8b5cf6" opacity="0.3" />
      {/* Arrow from key to signature */}
      <path d="M 65 40 Q 55 45, 50 50" fill="none" stroke="#a855f7" strokeWidth="0.8" strokeDasharray="2,2" opacity="0.4" />
      {/* Checkmark */}
      <circle cx="75" cy="75" r="8" fill="#10b981" opacity="0.3" />
      <path d="M 70 75 L 73 78 L 80 71" fill="none" stroke="#10b981" strokeWidth="1.5" opacity="0.6" />
    </motion.svg>

    {/* SHA-256 Hash Visual - Bottom left */}
    <motion.svg
      className="absolute w-36 h-28 md:w-48 md:h-36 opacity-[0.12] md:opacity-15 dark:opacity-[0.15] dark:md:opacity-25"
      style={{ left: '25%', top: '72%' }}
      viewBox="0 0 140 80"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0.1, 0.2, 0.1] }}
      transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
    >
      {/* Input blocks (message) */}
      <rect x="5" y="25" width="20" height="12" rx="2" fill="#3b82f6" opacity="0.4" />
      <rect x="5" y="40" width="20" height="12" rx="2" fill="#3b82f6" opacity="0.3" />
      <rect x="5" y="55" width="20" height="12" rx="2" fill="#3b82f6" opacity="0.2" />
      {/* Arrow to hash function */}
      <path d="M 30 42 L 45 42" stroke="#6366f1" strokeWidth="1" opacity="0.5" markerEnd="url(#arrowHead)" />
      {/* Hash function box (gear-like) */}
      <rect x="50" y="28" width="30" height="30" rx="4" fill="none" stroke="url(#hashGradient)" strokeWidth="1.5" opacity="0.6" />
      <circle cx="65" cy="43" r="8" fill="none" stroke="#8b5cf6" strokeWidth="1" opacity="0.4" />
      <circle cx="65" cy="43" r="4" fill="#8b5cf6" opacity="0.3" />
      {/* Gear teeth */}
      <rect x="63" y="32" width="4" height="4" fill="#8b5cf6" opacity="0.3" />
      <rect x="63" y="50" width="4" height="4" fill="#8b5cf6" opacity="0.3" />
      <rect x="54" y="41" width="4" height="4" fill="#8b5cf6" opacity="0.3" />
      <rect x="72" y="41" width="4" height="4" fill="#8b5cf6" opacity="0.3" />
      {/* Arrow to output */}
      <path d="M 85 42 L 100 42" stroke="#6366f1" strokeWidth="1" opacity="0.5" />
      {/* Output hash (fixed-size blocks) */}
      <rect x="105" y="30" width="8" height="8" rx="1" fill="#ec4899" opacity="0.5" />
      <rect x="115" y="30" width="8" height="8" rx="1" fill="#ec4899" opacity="0.4" />
      <rect x="125" y="30" width="8" height="8" rx="1" fill="#ec4899" opacity="0.3" />
      <rect x="105" y="40" width="8" height="8" rx="1" fill="#ec4899" opacity="0.4" />
      <rect x="115" y="40" width="8" height="8" rx="1" fill="#ec4899" opacity="0.5" />
      <rect x="125" y="40" width="8" height="8" rx="1" fill="#ec4899" opacity="0.3" />
      <rect x="105" y="50" width="8" height="8" rx="1" fill="#ec4899" opacity="0.3" />
      <rect x="115" y="50" width="8" height="8" rx="1" fill="#ec4899" opacity="0.4" />
      <defs>
        <linearGradient id="hashGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
    </motion.svg>

    {/* Multivariate Polynomial Visual - 3D surface P(x₁,x₂) in 3D space */}
    <motion.svg
      className="absolute w-64 h-64 md:w-[500px] md:h-[500px] opacity-[0.12] md:opacity-18 dark:opacity-[0.15] dark:md:opacity-22"
      style={{ right: '2%', top: '20%' }}
      viewBox="0 0 140 140"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0.08, 0.2, 0.08] }}
      transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
    >
      {/* 3D Coordinate axes (isometric projection) */}
      {/* X-axis (going right-down) */}
      <line x1="30" y1="90" x2="120" y2="120" stroke="#3b82f6" strokeWidth="1.2" opacity="0.5" />
      <text x="125" y="125" fontSize="8" fill="#3b82f6" opacity="0.6">x₁</text>
      {/* Y-axis (going left-down) */}
      <line x1="30" y1="90" x2="10" y2="110" stroke="#8b5cf6" strokeWidth="1.2" opacity="0.5" />
      <text x="5" y="118" fontSize="8" fill="#8b5cf6" opacity="0.6">x₂</text>
      {/* Z-axis (going up) */}
      <line x1="30" y1="90" x2="30" y2="15" stroke="#10b981" strokeWidth="1.2" opacity="0.5" />
      <text x="30" y="10" fontSize="8" fill="#10b981" opacity="0.6">z</text>
      
      {/* 3D Surface mesh - multivariate polynomial surface */}
      {/* Back row of surface */}
      <path d="M 25 75 Q 40 55, 55 65 Q 70 75, 85 60" fill="none" stroke="url(#poly3dGradient)" strokeWidth="1.5" opacity="0.4" />
      {/* Middle row of surface */}
      <path d="M 35 85 Q 55 45, 75 55 Q 95 65, 105 45" fill="none" stroke="url(#poly3dGradient)" strokeWidth="2" opacity="0.6" />
      {/* Front row of surface */}
      <path d="M 50 95 Q 70 35, 90 50 Q 110 65, 120 30" fill="none" stroke="url(#poly3dGradient)" strokeWidth="2.5" opacity="0.8" />
      
      {/* Cross-section lines (connecting rows to show surface) */}
      <line x1="40" y1="60" x2="55" y2="50" stroke="#8b5cf6" strokeWidth="0.8" opacity="0.3" strokeDasharray="2,2" />
      <line x1="55" y1="50" x2="75" y2="40" stroke="#8b5cf6" strokeWidth="0.8" opacity="0.3" strokeDasharray="2,2" />
      <line x1="70" y1="70" x2="85" y2="58" stroke="#ec4899" strokeWidth="0.8" opacity="0.3" strokeDasharray="2,2" />
      <line x1="85" y1="58" x2="105" y2="52" stroke="#ec4899" strokeWidth="0.8" opacity="0.3" strokeDasharray="2,2" />
      
      {/* Sample points on surface */}
      <circle cx="55" cy="50" r="3" fill="#3b82f6" opacity="0.7" />
      <circle cx="90" cy="50" r="3" fill="#ec4899" opacity="0.7" />
      <circle cx="75" cy="55" r="3" fill="#8b5cf6" opacity="0.7" />
      
      {/* Label */}
      <text x="70" y="135" fontSize="9" fill="#8b5cf6" textAnchor="middle" opacity="0.6">P(x₁,x₂)</text>
      
      <defs>
        <linearGradient id="poly3dGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="33%" stopColor="#8b5cf6" />
          <stop offset="66%" stopColor="#ec4899" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
      </defs>
    </motion.svg>

    {/* 3D Boolean Cube - Center-left area - 1.3x larger */}
    <motion.svg
      className="absolute w-52 h-52 md:w-[500px] md:h-[500px] opacity-[0.12] md:opacity-15 dark:opacity-[0.15] dark:md:opacity-20"
      style={{ left: '2%', top: '4%' }}
      viewBox="0 0 180 180"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0.1, 0.18, 0.1] }}
      transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
    >
      {/* 
        3D Cube vertices: 3-bit binary (x,y,z)
        Front face: z=0 (xx0), Back face: z=1 (xx1)
      */}
      
      {/* === CUBE EDGES === */}
      {/* Front face (z=0) - Blue */}
      <line x1="30" y1="70" x2="100" y2="70" stroke="#3b82f6" strokeWidth="1.8" opacity="0.8" />
      <line x1="100" y1="70" x2="100" y2="140" stroke="#3b82f6" strokeWidth="1.8" opacity="0.8" />
      <line x1="100" y1="140" x2="30" y2="140" stroke="#3b82f6" strokeWidth="1.8" opacity="0.8" />
      <line x1="30" y1="140" x2="30" y2="70" stroke="#3b82f6" strokeWidth="1.8" opacity="0.8" />
      
      {/* Back face (z=1) - Pink */}
      <line x1="60" y1="40" x2="130" y2="40" stroke="#ec4899" strokeWidth="1.8" opacity="0.6" />
      <line x1="130" y1="40" x2="130" y2="110" stroke="#ec4899" strokeWidth="1.8" opacity="0.6" />
      <line x1="130" y1="110" x2="60" y2="110" stroke="#ec4899" strokeWidth="1.8" opacity="0.6" />
      <line x1="60" y1="110" x2="60" y2="40" stroke="#ec4899" strokeWidth="1.8" opacity="0.6" />
      
      {/* Connecting edges (depth) - Purple */}
      <line x1="30" y1="70" x2="60" y2="40" stroke="#a855f7" strokeWidth="1.2" opacity="0.5" />
      <line x1="100" y1="70" x2="130" y2="40" stroke="#a855f7" strokeWidth="1.2" opacity="0.5" />
      <line x1="100" y1="140" x2="130" y2="110" stroke="#a855f7" strokeWidth="1.2" opacity="0.5" />
      <line x1="30" y1="140" x2="60" y2="110" stroke="#a855f7" strokeWidth="1.2" opacity="0.5" />
      
      {/* === FRONT FACE VERTICES (z=0) - Blue === */}
      {/* 000 - front top left */}
      <circle cx="30" cy="70" r="5" fill="#3b82f6" opacity="0.9" />
      <text x="8" y="68" fontSize="10" fontFamily="monospace" fill="#3b82f6" opacity="1" fontWeight="bold">000</text>
      
      {/* 001 - front top right */}
      <circle cx="100" cy="70" r="5" fill="#3b82f6" opacity="0.9" />
      <text x="106" y="68" fontSize="10" fontFamily="monospace" fill="#3b82f6" opacity="1" fontWeight="bold">001</text>
      
      {/* 010 - front bottom left */}
      <circle cx="30" cy="140" r="5" fill="#3b82f6" opacity="0.9" />
      <text x="8" y="152" fontSize="10" fontFamily="monospace" fill="#3b82f6" opacity="1" fontWeight="bold">010</text>
      
      {/* 011 - front bottom right */}
      <circle cx="100" cy="140" r="5" fill="#3b82f6" opacity="0.9" />
      <text x="106" y="152" fontSize="10" fontFamily="monospace" fill="#3b82f6" opacity="1" fontWeight="bold">011</text>
      
      {/* === BACK FACE VERTICES (z=1) - Pink === */}
      {/* 100 - back top left */}
      <circle cx="60" cy="40" r="5" fill="#ec4899" opacity="0.9" />
      <text x="38" y="32" fontSize="10" fontFamily="monospace" fill="#ec4899" opacity="1" fontWeight="bold">100</text>
      
      {/* 101 - back top right */}
      <circle cx="130" cy="40" r="5" fill="#ec4899" opacity="0.9" />
      <text x="136" y="32" fontSize="10" fontFamily="monospace" fill="#ec4899" opacity="1" fontWeight="bold">101</text>
      
      {/* 110 - back bottom left */}
      <circle cx="60" cy="110" r="5" fill="#ec4899" opacity="0.9" />
      <text x="38" y="120" fontSize="10" fontFamily="monospace" fill="#ec4899" opacity="1" fontWeight="bold">110</text>
      
      {/* 111 - back bottom right */}
      <circle cx="130" cy="110" r="5" fill="#ec4899" opacity="0.9" />
      <text x="136" y="120" fontSize="10" fontFamily="monospace" fill="#ec4899" opacity="1" fontWeight="bold">111</text>
    </motion.svg>

  </>
);

export default function HomePage() {
  const t = useTranslations('home');
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [showLanding, setShowLanding] = useState(true);
  
  // Parallax scroll effects
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });
  
  // Parallax transforms for background elements
  const backgroundY = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);
  const orbScale = useTransform(scrollYProgress, [0, 0.5, 1], [1, 1.2, 1]);
  
  // Fade out landing on scroll or after delay
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 50) {
        setShowLanding(false);
      }
    };
    
    // Auto-fade after 4 seconds
    const timer = setTimeout(() => {
      setShowLanding(false);
    }, 4000);
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(timer);
    };
  }, []);
  
  // Trust phrases with translations
  const trustPhrases = [
    t('trustPhrases.fullyDecentralized'),
    t('trustPhrases.trustCryptography'),
    t('trustPhrases.noBrokerFees'),
    t('trustPhrases.autoSettlement'),
    t('trustPhrases.permissionless'),
  ];
  
  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % trustPhrases.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [trustPhrases.length]);

  // Steps tab state
  const [activeStepsTab, setActiveStepsTab] = useState<'onramp' | 'offramp'>('onramp');

  return (
    <>
      {/* LANDING OVERLAY - Covers entire viewport including nav, outside main container */}
      {/* NOTE: No CryptoVisuals here - we use the UNIFIED BACKGROUND's visuals which show through */}
      <AnimatePresence>
        {showLanding && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="fixed inset-0 z-[100] flex items-center justify-center"
            style={{ pointerEvents: 'auto' }}
          >
            
            {/* Landing content - positioned to match main hero exactly */}
            <motion.div 
              className="text-center max-w-5xl mx-auto px-4 flex flex-col items-center"
            >
              {/* LyncZ Logo Text - will scale up and fade */}
              <motion.h1
                className="text-7xl md:text-9xl font-bold tracking-tight mb-6 pb-4"
                initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 1.3, y: -50 }}
                transition={{ 
                  duration: 1, 
                  ease: [0.25, 0.46, 0.45, 0.94]
                }}
              >
                <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-purple-500 bg-clip-text text-transparent">Lync</span>
                <span className="text-pink-500">Z</span>
              </motion.h1>
              
              {/* Tagline - matches main hero text size and style exactly */}
              <motion.h2 
                className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.2] pb-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8, delay: 0.3 }}
              >
                <span className="text-slate-800 dark:text-white">{t('hero.title')}</span>
                <br />
                <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent inline-block pb-2">
                  {t('hero.titleLine2')}
                </span>
              </motion.h2>
              
              {/* Rotating Trust Phrase - same styling as main */}
              <motion.div 
                className="h-16 md:h-20 flex items-center justify-center mt-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.5 }}
              >
                <AnimatePresence mode="wait">
                  <motion.span
                    key={phraseIndex}
                    initial={{ y: 30, opacity: 0, filter: 'blur(5px)' }}
                    animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                    exit={{ y: -30, opacity: 0, filter: 'blur(5px)' }}
                    transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                    className="text-xl md:text-2xl font-light text-slate-500 dark:text-slate-400"
                  >
                    {trustPhrases[phraseIndex]}
                  </motion.span>
                </AnimatePresence>
              </motion.div>
              
              {/* Scroll hint */}
              <motion.div
                className="mt-16"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 1.2 }}
              >
                <motion.div
                  className="flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500"
                  animate={{ y: [0, 8, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <span className="text-sm font-medium tracking-wide">{t('scrollToExplore')}</span>
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </motion.div>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    <div ref={containerRef} className="min-h-screen relative overflow-hidden">

      {/* UNIFIED BACKGROUND - Single consistent canvas for BOTH landing and homepage */}
      <motion.div 
        className="fixed -top-[50%] left-0 right-0 h-[200%] z-0 bg-gradient-to-b from-slate-50 via-slate-100 to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 pointer-events-none"
        style={{ y: backgroundY }}
      >
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-50 dark:opacity-40">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
                <path d="M 60 0 L 0 0 0 60" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-purple-400/20 dark:text-purple-500/15" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        {/* Orbital rings with parallax */}
        <motion.div 
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ scale: orbScale }}
        >
          <motion.div
            className="w-[900px] h-[900px] border border-purple-400/20 dark:border-purple-400/30 rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 120, repeat: Infinity, ease: 'linear' }}
          />
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[650px] border border-blue-400/20 dark:border-blue-400/25 rounded-full"
            animate={{ rotate: -360 }}
            transition={{ duration: 90, repeat: Infinity, ease: 'linear' }}
          />
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] border border-pink-400/20 dark:border-pink-400/25 rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
          />
        </motion.div>

        {/* Radial glow effects with parallax */}
        <motion.div 
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[800px] bg-[radial-gradient(ellipse_at_center,rgba(147,51,234,0.08)_0%,transparent_70%)] dark:bg-[radial-gradient(ellipse_at_center,rgba(147,51,234,0.15)_0%,transparent_70%)]"
          style={{ scale: orbScale }}
        />
        <div className="absolute top-[60%] left-1/4 w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(59,130,246,0.05)_0%,transparent_60%)] dark:bg-[radial-gradient(circle,rgba(59,130,246,0.1)_0%,transparent_60%)]" />
        <div className="absolute top-[80%] right-1/4 w-[500px] h-[500px] bg-[radial-gradient(circle,rgba(236,72,153,0.05)_0%,transparent_60%)] dark:bg-[radial-gradient(circle,rgba(236,72,153,0.1)_0%,transparent_60%)]" />

        {/* Crypto Visual Elements (SVGs) */}
        <CryptoVisuals />

        {/* FLOATING CRYPTO TEXT - Minimal, subtle hints only */}
        {FLOATING_ELEMENTS.map((el, i) => {
          const colorClass = i % 3 === 0 
            ? 'text-purple-400/20 dark:text-purple-400/15' 
            : i % 3 === 1 
            ? 'text-blue-400/20 dark:text-blue-400/15' 
            : 'text-pink-400/20 dark:text-pink-400/15';
          
          return (
            <motion.div
              key={i}
              className={`absolute font-mono text-2xl md:text-3xl select-none ${colorClass}`}
              style={{
                left: `${10 + (i * 20) % 70}%`,
                top: `${15 + (i * 18) % 60}%`,
              }}
              initial={{ opacity: 0 }}
              animate={{
                opacity: [0, 0.3, 0.4, 0.3, 0],
              }}
              transition={{
                duration: 15 + (i * 3),
                repeat: Infinity,
                ease: 'easeInOut',
                delay: (i * 0.4) % 8,
              }}
            >
              {el.text}
            </motion.div>
          );
        })}
      </motion.div>

      {/* CONTENT - All flows on unified background */}
      <div className="relative z-10">
        {/* Hero Section */}
        <section className="min-h-[85vh] flex items-center justify-center px-4 pt-10">
          <motion.div 
            className="text-center max-w-5xl mx-auto flex flex-col items-center"
            initial="hidden"
            animate={showLanding ? "hidden" : "visible"}
            variants={staggerContainer}
          >
            <motion.div variants={fadeInUp}>
              <motion.h1 
                className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.2] pb-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: showLanding ? 0 : 1, y: showLanding ? 20 : 0 }}
                transition={{ duration: 0.8, delay: 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <span className="text-slate-800 dark:text-white">{t('hero.title')}</span>
                <br />
                <motion.span 
                  className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent inline-block pb-2"
                >
                  {t('hero.titleLine2')}
                </motion.span>
              </motion.h1>
              
              {/* Rotating Trust Phrase */}
              <motion.div 
                className="h-16 md:h-20 flex items-center justify-center mt-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: showLanding ? 0 : 1, y: showLanding ? 10 : 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
              >
                <AnimatePresence mode="wait">
                  <motion.span
                    key={phraseIndex}
                    initial={{ y: 30, opacity: 0, filter: 'blur(5px)' }}
                    animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                    exit={{ y: -30, opacity: 0, filter: 'blur(5px)' }}
                    transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                    className="text-xl md:text-2xl font-light text-slate-500 dark:text-slate-400"
                  >
                    {trustPhrases[phraseIndex]}
                  </motion.span>
                </AnimatePresence>
            </motion.div>
            </motion.div>

            {/* CTA Buttons - fade in after landing */}
            <motion.div
              className="mt-10 flex flex-col sm:flex-row gap-4 justify-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: showLanding ? 0 : 1, y: showLanding ? 20 : 0 }}
              transition={{ duration: 0.6, delay: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }}>
                <Link href="/buy">
                  <Button
                    size="lg"
                    className="group px-8 py-6 text-lg font-medium rounded-xl bg-gradient-to-r from-blue-400/80 via-purple-400/80 to-pink-400/80 text-white shadow-lg shadow-purple-400/15 hover:shadow-purple-400/25 hover:from-blue-500/85 hover:via-purple-500/85 hover:to-pink-500/85 transition-all duration-300"
                  >
                    <Zap className="mr-2 h-5 w-5" />
                    {t('hero.startTrading')}
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }}>
                <a href="#how-it-works" className="inline-block">
                  <Button
                    size="lg"
                    variant="outline"
                    className="px-8 py-6 text-lg font-medium rounded-xl bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-300/50 dark:border-slate-600/50 hover:border-purple-400 dark:hover:border-purple-500 transition-colors"
                  >
                    <Terminal className="mr-2 h-5 w-5" />
                    {t('hero.howItWorks')}
                  </Button>
                </a>
              </motion.div>
            </motion.div>

          </motion.div>
        </section>

        {/* Why Trade on LyncZ - Merged Section */}
        <section className="py-24 px-4 bg-gradient-to-br from-slate-50 via-purple-50/20 to-blue-50/20">
          <div className="max-w-6xl mx-auto">
            {/* Header */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={fadeInUp}
              className="text-center mb-16"
            >
              <h2 className="text-4xl md:text-5xl font-bold mb-4">
                <span className="text-slate-800 dark:text-white">{t('whyTrade.title')} </span>
                <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent">{t('whyTrade.titleHighlight')}</span>
              </h2>
              <motion.p 
                className="text-lg md:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3, duration: 0.6 }}
              >
                {t('whyTrade.subtitle')}
              </motion.p>
            </motion.div>

            {/* Four Selling Points */}
            <motion.div 
              className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              variants={staggerContainer}
            >
              {[
                { 
                  icon: Shield,
                  titleKey: 'whyTrade.permissionless.title',
                  descKey: 'whyTrade.permissionless.description',
                  gradient: 'from-purple-500 to-purple-600'
                },
                { 
                  icon: Lock,
                  titleKey: 'whyTrade.trustless.title',
                  descKey: 'whyTrade.trustless.description',
                  gradient: 'from-blue-500 to-blue-600'
                },
                { 
                  icon: DollarSign,
                  titleKey: 'whyTrade.noBrokerFees.title',
                  descKey: 'whyTrade.noBrokerFees.description',
                  gradient: 'from-emerald-500 to-emerald-600'
                },
                { 
                  icon: Cpu,
                  titleKey: 'whyTrade.autoSettlement.title',
                  descKey: 'whyTrade.autoSettlement.description',
                  gradient: 'from-pink-500 to-pink-600'
                },
              ].map((pillar, i) => (
                <motion.div
                  key={i}
                  variants={staggerItem}
                  whileHover={{ y: -8, transition: { duration: 0.3 } }}
                  className="group relative"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-pink-500/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative p-8 rounded-2xl bg-white/40 dark:bg-slate-800/20 backdrop-blur-sm border border-slate-200/15 dark:border-slate-700/15 hover:bg-white/60 hover:dark:bg-slate-800/40 hover:border-purple-400/25 dark:hover:border-purple-500/25 transition-all duration-300 h-full">
                    <motion.div 
                      className={`w-14 h-14 rounded-xl bg-gradient-to-br ${pillar.gradient} flex items-center justify-center mb-6 shadow-lg`}
                      whileHover={{ scale: 1.15, rotate: 5 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <pillar.icon className="h-7 w-7 text-white" />
                    </motion.div>
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-4">{t(pillar.titleKey)}</h3>
                    <p className="text-base text-slate-600 dark:text-slate-400 leading-loose">
                      {pillar.descKey === 'whyTrade.noBrokerFees.description' ? (
                        t.rich(pillar.descKey, {
                          okx: (chunks) => (
                            <a 
                              href="https://www.okx.com/zh-hans/p2p-markets/cny/sell-usdc" 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 hover:opacity-80 transition-opacity"
                            >
                              <img 
                                src="/okx-1.svg" 
                                alt="OKX" 
                                className="h-3.5 w-auto inline-block align-middle"
                              />
                            </a>
                          ),
                          lyncz: (chunks) => (
                            <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent font-semibold">
                              {chunks}
                            </span>
                          )
                        })
                      ) : (
                        t(pillar.descKey)
                      )}
                    </p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Currently Supported - Payment Methods & Chains */}
        <section className="py-20 px-4">
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={staggerContainer}
              className="text-center"
            >
              <motion.h2
                variants={fadeInUp}
                className="text-3xl md:text-4xl font-bold mb-16"
              >
                <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent">LyncZ</span>
                <span className="text-slate-800 dark:text-white"> {t('currentlySupports.title')}</span>
              </motion.h2>
              
              {/* Vertical grid layout */}
              <div className="grid md:grid-cols-2 gap-12 md:gap-16">
                {/* Pay & Receive CNY */}
                <motion.div 
                  variants={staggerItem}
                  className="flex flex-col items-center"
                >
                  <span className="text-sm uppercase tracking-widest text-slate-500 dark:text-slate-400 font-semibold mb-8">
                    {t('currentlySupports.payReceive')}
                  </span>
                  <div className="flex flex-col gap-6 w-full max-w-xs">
                    {/* Alipay - Live */}
                    <motion.div 
                      className="flex items-center gap-4 p-5 rounded-2xl bg-white/10 dark:bg-slate-700/20 backdrop-blur-sm shadow-sm border-2 border-emerald-400/25"
                      whileHover={{ scale: 1.03, y: -4 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <img src="/alipay-logo.svg" alt="Alipay" className="h-12 w-auto dark:brightness-110 dark:contrast-125" />
                      <div className="flex-1" />
                      <span className="px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-sm font-bold">
                        {t('liveBadge')}
                      </span>
                    </motion.div>
                    
                    {/* WeChat Pay - Coming Soon */}
                    <motion.div 
                      className="flex items-center gap-4 p-5 rounded-2xl bg-white/5 dark:bg-slate-700/15 backdrop-blur-sm border border-slate-200/20 dark:border-slate-600/20"
                      whileHover={{ scale: 1.02 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <img src="/wechat-pay-icon.png" alt="WeChat Pay" className="h-12 w-auto dark:brightness-110" />
                      <div className="flex-1" />
                      <span className="text-sm text-slate-400 font-medium">{t('wechatComingSoon')}</span>
                    </motion.div>
                  </div>
                </motion.div>

                {/* Trade Crypto on */}
                <motion.div 
                  variants={staggerItem}
                  className="flex flex-col items-center"
                >
                  <span className="text-sm uppercase tracking-widest text-slate-500 dark:text-slate-400 font-semibold mb-8">
                    {t('currentlySupports.tradeCrypto')}
                  </span>
                  <div className="flex flex-col gap-6 w-full max-w-xs">
                    {/* Base - Live */}
                    <motion.div 
                      className="flex items-center gap-4 p-5 rounded-2xl bg-white/10 dark:bg-slate-700/20 backdrop-blur-sm shadow-sm border-2 border-emerald-400/25"
                      whileHover={{ scale: 1.03, y: -4 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <img src="/Base-Logo-New.png" alt="Base" className="h-10 w-auto dark:brightness-125" />
                      <div className="flex-1" />
                      <span className="px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-sm font-bold">
                        {t('liveBadge')}
                      </span>
                    </motion.div>
                    
                    {/* BNB Chain - Coming Soon */}
                    <motion.div 
                      className="flex items-center gap-4 p-5 rounded-2xl bg-white/5 dark:bg-slate-700/15 backdrop-blur-sm border border-slate-200/20 dark:border-slate-600/20"
                      whileHover={{ scale: 1.02 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <img src="/BNB Chain_Stacked_Logo_Yellow.svg" alt="BNB Chain" className="h-10 w-auto dark:brightness-110" />
                      <div className="flex-1" />
                      <span className="text-sm text-slate-400 font-medium">{t('comingSoon')}</span>
                    </motion.div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* How It Works - Cool Animated Style */}
        <section id="how-it-works" className="py-24 px-4 scroll-mt-20">
          <div className="max-w-6xl mx-auto">
            {/* Header */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={fadeInUp}
              className="text-center mb-12"
            >
              <h2 className="text-4xl md:text-5xl font-bold mb-4">
                <span className="text-slate-800 dark:text-white">{t('howItWorks.title')} </span>
                <span className="bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">{t('howItWorks.titleHighlight')}</span>
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-lg">
                {t.rich('howItWorks.subtitle', {
                  lyncz: (chunks) => <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent font-semibold">{chunks}</span>,
                  alipay: (chunks) => <span className="bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent font-semibold">{chunks}</span>
                })}
              </p>
            </motion.div>

            {/* Tab Navigation */}
            <motion.div 
              className="flex justify-center mb-16"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              <div className="inline-flex rounded-xl bg-white/60 dark:bg-slate-800/40 p-1 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/30">
                <motion.button
                  onClick={() => setActiveStepsTab('offramp')}
                  className={`px-8 py-2.5 rounded-lg font-medium text-base transition-all duration-200 ${
                    activeStepsTab === 'offramp'
                      ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-300/40 dark:border-purple-600/30'
                      : 'text-slate-500 dark:text-slate-400 hover:text-purple-500 dark:hover:text-purple-400'
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {t('howItWorks.tabs.offramp')}
                </motion.button>
                <motion.button
                  onClick={() => setActiveStepsTab('onramp')}
                  className={`px-8 py-2.5 rounded-lg font-medium text-base transition-all duration-200 ${
                    activeStepsTab === 'onramp'
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-300/40 dark:border-blue-600/30'
                      : 'text-slate-500 dark:text-slate-400 hover:text-blue-500 dark:hover:text-blue-400'
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {t('howItWorks.tabs.onramp')}
                </motion.button>
              </div>
            </motion.div>

            {/* Steps with visual animations */}
            <AnimatePresence mode="wait">
              {activeStepsTab === 'onramp' && (
                <motion.div
                  key="onramp"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="space-y-20"
                >
                  {/* Step 1 - Browse & Lock */}
                  <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{ duration: 0.6 }}
                    className="grid md:grid-cols-2 gap-6 md:gap-12 items-center"
                  >
                    <div className="order-1">
                      <div className="flex items-center gap-4 mb-4 md:mb-6">
                    <motion.div 
                          className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-blue-500/10 border border-blue-300/40 dark:border-blue-600/30 flex items-center justify-center text-lg md:text-xl font-semibold text-blue-600 dark:text-blue-400"
                          whileHover={{ scale: 1.05 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      1
                    </motion.div>
                        <h3 className="text-xl md:text-3xl font-bold text-slate-800 dark:text-white">{t('howItWorks.onramp.step1.title')}</h3>
                      </div>
                      <p className="text-base md:text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
                        {t.rich('howItWorks.onramp.step1.description', {
                          lyncz: (chunks) => <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent font-semibold">{chunks}</span>,
                          alipay: (chunks) => <span className="bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent font-semibold">{chunks}</span>,
                          signed: (chunks) => <span className="bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent font-semibold">{chunks}</span>
                        })}
                      </p>
                    </div>
                    {/* Visual Animation - Mobile Compact */}
                    <div className="order-2 flex justify-center md:hidden">
                      <motion.div 
                        className="relative p-5 rounded-2xl bg-gradient-to-br from-blue-50 to-purple-50 dark:from-slate-800/50 dark:to-purple-900/20 border border-blue-100 dark:border-purple-800/30"
                        initial={{ scale: 0.9, opacity: 0 }}
                        whileInView={{ scale: 1, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                      >
                        <div className="flex items-center gap-3">
                          <motion.div className="text-3xl" animate={{ y: [0, -5, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}>👤</motion.div>
                          <div className="text-xl text-slate-400">→</div>
                          <div className="px-3 py-2 rounded-lg bg-white dark:bg-slate-700 shadow-lg border border-slate-200 dark:border-slate-600">
                            <div className="font-bold text-sm text-slate-800 dark:text-white">$500</div>
                            <div className="text-xs text-blue-500">¥7.28</div>
                          </div>
                          <div className="text-xl text-slate-400">→</div>
                          <div className="text-center">
                            <div className="text-2xl mb-0.5">🔒</div>
                            <div className="text-[11px] font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent whitespace-nowrap">$200 {t('howItWorks.animation.reserved')}</div>
                          </div>
                        </div>
                      </motion.div>
                    </div>
                    {/* Visual Animation - Desktop Full */}
                    <div className="order-1 md:order-2 hidden md:flex justify-center">
                      <motion.div 
                        className="relative p-8 rounded-3xl bg-gradient-to-br from-blue-50 to-purple-50 dark:from-slate-800/50 dark:to-purple-900/20 border border-blue-100 dark:border-purple-800/30"
                        initial={{ scale: 0.9, opacity: 0 }}
                        whileInView={{ scale: 1, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                      >
                        <div className="flex items-center gap-4">
                          <motion.div
                            className="text-4xl"
                            animate={{ y: [0, -5, 0] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                          >
                            👤
                          </motion.div>
                          <motion.div
                            className="text-2xl text-slate-400"
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.4 }}
                          >
                            →
                          </motion.div>
                          <motion.div
                            className="px-4 py-3 rounded-xl bg-white dark:bg-slate-700 shadow-lg border border-slate-200 dark:border-slate-600"
                            initial={{ x: 20, opacity: 0 }}
                            whileInView={{ x: 0, opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.6 }}
                          >
                            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t('howItWorks.animation.sellOrder')}</div>
                            <div className="font-bold text-slate-800 dark:text-white">$500 USDC</div>
                            <div className="text-xs text-blue-500">{t('howItWorks.animation.rate')} ¥7.28</div>
                            <motion.div 
                              className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600"
                              initial={{ opacity: 0 }}
                              whileInView={{ opacity: 1 }}
                              viewport={{ once: true }}
                              transition={{ delay: 0.8 }}
                            >
                              <div className="text-[10px] text-slate-400 dark:text-slate-500">{t('howItWorks.animation.buyAmount')}</div>
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">$200</span>
                                <span className="text-[10px] text-slate-400">USDC</span>
                              </div>
                            </motion.div>
                          </motion.div>
                          <motion.div
                            className="text-2xl text-slate-400"
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.9 }}
                          >
                            →
                          </motion.div>
                          <motion.div
                            className="text-center"
                            initial={{ scale: 0, opacity: 0 }}
                            whileInView={{ scale: 1, opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 1.1, type: "spring" }}
                          >
                            <div className="text-3xl mb-1">🔒</div>
                            <div className="text-xs font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">$200 {t('howItWorks.animation.reserved')}</div>
                          </motion.div>
                        </div>
                      </motion.div>
                    </div>
                  </motion.div>

                  {/* Step 2 - Pay via Alipay */}
                  <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{ duration: 0.6 }}
                    className="grid md:grid-cols-2 gap-6 md:gap-12 items-center"
                  >
                    {/* Text Description - Mobile First */}
                    <div className="order-1 md:order-2 md:hidden">
                      <div className="flex items-center gap-4 mb-4">
                    <motion.div 
                          className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-300/40 dark:border-purple-600/30 flex items-center justify-center text-lg font-semibold text-purple-600 dark:text-purple-400"
                      whileHover={{ scale: 1.1, rotate: -5 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      2
                    </motion.div>
                        <h3 className="text-xl font-bold text-slate-800 dark:text-white">{t('howItWorks.onramp.step2.title')}</h3>
                      </div>
                      <p className="text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        {t.rich('howItWorks.onramp.step2.description', {
                          lyncz: (chunks) => <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent font-semibold">{chunks}</span>,
                          alipay: (chunks) => <span className="bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent font-semibold">{chunks}</span>,
                          signed: (chunks) => <span className="bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent font-semibold">{chunks}</span>
                        })}
                      </p>
                    </div>
                    {/* Visual Animation - Mobile Compact */}
                    <div className="order-2 flex justify-center md:hidden">
                      <motion.div 
                        className="relative p-5 rounded-2xl bg-gradient-to-br from-purple-50 to-pink-50 dark:from-slate-800/50 dark:to-pink-900/20 border border-purple-100 dark:border-pink-800/30"
                        initial={{ scale: 0.9, opacity: 0 }}
                        whileInView={{ scale: 1, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                      >
                        <div className="flex items-center gap-3">
                          <motion.div className="text-3xl" animate={{ y: [0, -5, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}>👤</motion.div>
                          <div className="text-xl text-slate-400">→</div>
                          <div className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-700 shadow-lg border border-blue-200 dark:border-blue-600">
                            <div className="text-xs font-medium text-slate-700 dark:text-slate-300 text-center">139***</div>
                            <img src="/alipay-logo.svg" alt="Alipay" className="h-4 mx-auto mt-0.5" />
                            <motion.div className="text-[10px] text-emerald-600 dark:text-emerald-400 text-center" animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>💳 Pay...</motion.div>
                          </div>
                          <div className="text-xl text-slate-400">→</div>
                          <div className="relative flex flex-col items-center">
                            <div className="text-3xl relative">
                              📄
                              <motion.img src="/alipay-logo.svg" alt="Alipay Signature" className="absolute -bottom-0.5 -right-0.5 h-5 rounded-sm bg-white p-0.5 shadow-lg" animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }} />
                            </div>
                            <div className="mt-1 text-center text-[11px] text-slate-600 dark:text-slate-400">
                              <span className="bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent font-semibold">{t('howItWorks.animation.alipayReceipt')}</span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    </div>
                    {/* Visual Animation - Desktop Full */}
                    <div className="hidden md:flex justify-center">
                      <motion.div 
                        className="relative p-8 rounded-3xl bg-gradient-to-br from-purple-50 to-pink-50 dark:from-slate-800/50 dark:to-pink-900/20 border border-purple-100 dark:border-pink-800/30"
                        initial={{ scale: 0.9, opacity: 0 }}
                        whileInView={{ scale: 1, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                      >
                        <div className="flex items-center gap-4">
                          <motion.div
                            className="text-4xl"
                            animate={{ y: [0, -5, 0] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                          >
                            👤
                          </motion.div>
                          <motion.div
                            className="text-2xl text-slate-400"
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.4 }}
                          >
                            →
                          </motion.div>
                          {/* Payment Info Card */}
                          <motion.div
                            className="px-3 py-2 rounded-lg bg-white dark:bg-slate-700 shadow-lg border border-blue-200 dark:border-blue-600"
                            initial={{ scale: 0, opacity: 0 }}
                            whileInView={{ scale: 1, opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.6, type: "spring" }}
                          >
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">{t('howItWorks.animation.payTo')}</div>
                            <div className="flex items-center gap-1">
                              <img src="/alipay-logo.svg" alt="Alipay" className="h-4" />
                              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">139****8888</span>
                            </div>
                            <motion.div 
                              className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1"
                              animate={{ opacity: [1, 0.5, 1] }}
                              transition={{ duration: 1.5, repeat: Infinity }}
                            >
                              💳 {t('howItWorks.animation.makingPayment')}
                            </motion.div>
                          </motion.div>
                          <motion.div
                            className="text-2xl text-slate-400"
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.8 }}
                          >
                            →
                          </motion.div>
                          {/* Receipt with Alipay signature */}
                          <motion.div
                            className="relative flex flex-col items-center"
                            initial={{ scale: 0, opacity: 0 }}
                            whileInView={{ scale: 1, opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 1, type: "spring" }}
                          >
                            <div className="text-5xl relative">
                              📄
                              <motion.img 
                                src="/alipay-logo.svg" 
                                alt="Alipay Signature" 
                                className="absolute -bottom-1 -right-1 h-8 rounded-sm bg-white p-0.5 shadow-lg"
                                animate={{ scale: [1, 1.1, 1] }}
                                transition={{ duration: 2, repeat: Infinity }}
                              />
                            </div>
                            <div className="mt-2 text-center text-sm text-slate-600 dark:text-slate-400">
                              <span className="bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent font-semibold">{t('howItWorks.animation.digitallySigned')}</span>
                              <br />
                              <span className="bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent font-semibold">{t('howItWorks.animation.alipayReceipt')}</span>
                            </div>
                          </motion.div>
                        </div>
                      </motion.div>
                    </div>
                    {/* Text Description - Desktop Only */}
                    <div className="hidden md:block">
                      <div className="flex items-center gap-4 mb-6">
                        <motion.div 
                          className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-300/40 dark:border-purple-600/30 flex items-center justify-center text-xl font-semibold text-purple-600 dark:text-purple-400"
                          whileHover={{ scale: 1.1, rotate: -5 }}
                          transition={{ type: "spring", stiffness: 300 }}
                        >
                          2
                        </motion.div>
                        <h3 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-white">{t('howItWorks.onramp.step2.title')}</h3>
                      </div>
                      <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
                        {t.rich('howItWorks.onramp.step2.description', {
                          lyncz: (chunks) => <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent font-semibold">{chunks}</span>,
                          alipay: (chunks) => <span className="bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent font-semibold">{chunks}</span>,
                          signed: (chunks) => <span className="bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent font-semibold">{chunks}</span>
                        })}
                      </p>
                    </div>
                  </motion.div>

                  {/* Step 3 - Upload & Receive */}
                  <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{ duration: 0.6 }}
                    className="grid md:grid-cols-2 gap-6 md:gap-12 items-center"
                  >
                    <div className="order-1">
                      <div className="flex items-center gap-4 mb-4 md:mb-6">
                    <motion.div 
                          className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-pink-500/10 border border-pink-300/40 dark:border-pink-600/30 flex items-center justify-center text-lg md:text-xl font-semibold text-pink-600 dark:text-pink-400"
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      3
                    </motion.div>
                        <h3 className="text-xl md:text-3xl font-bold text-slate-800 dark:text-white">{t('howItWorks.onramp.step3.title')}</h3>
                      </div>
                      <p className="text-base md:text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
                        {t.rich('howItWorks.onramp.step3.description', {
                          lyncz: (chunks) => <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent font-semibold">{chunks}</span>,
                          alipay: (chunks) => <span className="bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent font-semibold">{chunks}</span>,
                          signed: (chunks) => <span className="bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent font-semibold">{chunks}</span>
                        })}
                      </p>
                    </div>
                    {/* Visual Animation - Mobile Compact */}
                    <div className="order-2 flex justify-center md:hidden">
                      <motion.div 
                        className="relative p-5 rounded-2xl bg-gradient-to-br from-pink-50 to-rose-50 dark:from-slate-800/50 dark:to-rose-900/20 border border-pink-100 dark:border-rose-800/30"
                        initial={{ scale: 0.9, opacity: 0 }}
                        whileInView={{ scale: 1, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="text-3xl">📄</div>
                            <img src="/alipay-logo.svg" alt="Alipay" className="absolute -bottom-0.5 -right-0.5 h-4 rounded-sm bg-white p-0.5 shadow-lg" />
                          </div>
                          <div className="text-xl text-slate-400">→</div>
                          <div className="text-center relative flex flex-col items-center">
                            <div className="text-3xl relative">
                              📜
                              <motion.div className="absolute -top-0.5 -right-0.5 text-xs bg-emerald-500 text-white rounded-full w-5 h-5 flex items-center justify-center" animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>✓</motion.div>
                            </div>
                            <div className="text-[10px] font-semibold mt-0.5 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent whitespace-nowrap">{t('howItWorks.animation.lyncZContract')}</div>
                          </div>
                          <div className="text-xl text-slate-400">→</div>
                          <div className="text-center">
                            <motion.div className="text-2xl" animate={{ y: [0, -8, 0] }} transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}>💰</motion.div>
                            <div className="text-[11px] font-bold text-emerald-600">{t('howItWorks.animation.released')}</div>
                          </div>
                        </div>
                      </motion.div>
                    </div>
                    {/* Visual Animation - Desktop Full */}
                    <div className="order-1 md:order-2 hidden md:flex justify-center">
                      <motion.div 
                        className="relative p-8 rounded-3xl bg-gradient-to-br from-pink-50 to-rose-50 dark:from-slate-800/50 dark:to-rose-900/20 border border-pink-100 dark:border-rose-800/30"
                        initial={{ scale: 0.9, opacity: 0 }}
                        whileInView={{ scale: 1, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                      >
                        <div className="flex items-center gap-4">
                          {/* Receipt with Alipay signature */}
                          <motion.div
                            className="relative"
                            initial={{ scale: 0, opacity: 0 }}
                            whileInView={{ scale: 1, opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.4, type: "spring" }}
                          >
                            <div className="text-5xl">📄</div>
                            <img 
                              src="/alipay-logo.svg" 
                              alt="Alipay" 
                              className="absolute -bottom-1 -right-1 h-6 rounded-sm bg-white p-0.5 shadow-lg"
                            />
                          </motion.div>
                          <motion.div
                            className="text-2xl text-slate-400"
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.6 }}
                          >
                            →
                          </motion.div>
                          {/* Smart Contract validates */}
                          <motion.div
                            className="text-center relative flex flex-col items-center"
                            initial={{ scale: 0, opacity: 0 }}
                            whileInView={{ scale: 1, opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.8, type: "spring" }}
                          >
                            <div className="text-5xl relative">
                              📜
                              <motion.div 
                                className="absolute -top-1 -right-1 text-xl bg-emerald-500 text-white rounded-full w-6 h-6 flex items-center justify-center"
                                animate={{ scale: [1, 1.2, 1] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                              >
                                ✓
                              </motion.div>
                            </div>
                            <div className="text-xs font-semibold mt-1 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent">{t('howItWorks.animation.lyncZContract')}</div>
                          </motion.div>
                          <motion.div
                            className="text-2xl text-slate-400"
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 1 }}
                          >
                            →
                          </motion.div>
                          {/* Crypto Released */}
                          <motion.div
                            className="text-center"
                            initial={{ scale: 0, opacity: 0 }}
                            whileInView={{ scale: 1, opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 1.2, type: "spring" }}
                          >
                            <motion.div 
                              className="text-4xl"
                              animate={{ y: [0, -8, 0] }}
                              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                            >
                              💰
                            </motion.div>
                            <div className="text-xs font-bold text-emerald-600">{t('howItWorks.animation.released')}</div>
                          </motion.div>
                        </div>
                      </motion.div>
                    </div>
                  </motion.div>
                </motion.div>
              )}

              {activeStepsTab === 'offramp' && (
                <motion.div
                  key="offramp"
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 30 }}
                  transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="space-y-20"
                >
                  {/* Step 1 - Create Offer */}
                  <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{ duration: 0.6 }}
                    className="grid md:grid-cols-2 gap-6 md:gap-12 items-center"
                  >
                    <div className="order-1">
                      <div className="flex items-center gap-4 mb-4 md:mb-6">
                    <motion.div 
                          className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-purple-500/10 border border-purple-300/40 dark:border-purple-600/30 flex items-center justify-center text-lg md:text-xl font-semibold text-purple-600 dark:text-purple-400"
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      1
                    </motion.div>
                        <h3 className="text-xl md:text-3xl font-bold text-slate-800 dark:text-white">{t('howItWorks.offramp.step1.title')}</h3>
                      </div>
                      <p className="text-base md:text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
                        {t.rich('howItWorks.offramp.step1.description', {
                          lyncz: (chunks) => <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent font-semibold">{chunks}</span>,
                          alipay: (chunks) => <span className="bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent font-semibold">{chunks}</span>,
                          signed: (chunks) => <span className="bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent font-semibold">{chunks}</span>
                        })}
                      </p>
                    </div>
                    {/* Visual Animation - Mobile (same as desktop, slightly smaller) */}
                    <div className="order-2 flex justify-center md:hidden">
                      <motion.div 
                        className="relative p-5 rounded-2xl bg-gradient-to-br from-purple-50 to-pink-50 dark:from-slate-800/50 dark:to-pink-900/20 border border-purple-100 dark:border-pink-800/30"
                        initial={{ scale: 0.9, opacity: 0 }}
                        whileInView={{ scale: 1, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                      >
                        <div className="flex flex-col items-center gap-2">
                          <div className="flex items-center gap-3">
                            <motion.div
                              className="text-3xl"
                              animate={{ y: [0, -5, 0] }}
                              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                            >
                              👤
                            </motion.div>
                            <motion.div
                              className="text-xl text-slate-400"
                              initial={{ opacity: 0 }}
                              whileInView={{ opacity: 1 }}
                              viewport={{ once: true }}
                              transition={{ delay: 0.4 }}
                            >
                              →
                            </motion.div>
                            {/* Sell order card */}
                            <motion.div
                              className="flex flex-col items-center"
                              initial={{ x: 20, opacity: 0 }}
                              whileInView={{ x: 0, opacity: 1 }}
                              viewport={{ once: true }}
                              transition={{ delay: 0.6 }}
                            >
                              <div className="px-3 py-2 rounded-lg bg-white dark:bg-slate-700 shadow-xl border border-slate-200 dark:border-slate-600">
                                <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">{t('howItWorks.animation.sellOrder')}</div>
                                <div className="font-bold text-sm text-slate-800 dark:text-white">$500 USDC</div>
                                <div className="text-[10px] text-blue-500">{t('howItWorks.animation.rate')} ¥7.28</div>
                                <div className="text-[10px] text-slate-400 dark:text-slate-500">Alipay: 139****8888</div>
                              </div>
                              <motion.div
                                className="mt-1 text-[11px] font-semibold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent whitespace-nowrap"
                                initial={{ opacity: 0 }}
                                whileInView={{ opacity: 1 }}
                                viewport={{ once: true }}
                                transition={{ delay: 0.9 }}
                              >
                                {t('howItWorks.animation.lyncZContract')}
                              </motion.div>
                            </motion.div>
                          </div>
                          <motion.div
                            className="text-center text-sm font-semibold text-emerald-600 dark:text-emerald-400"
                            initial={{ opacity: 0, scale: 0.8 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 1.1, type: "spring" }}
                          >
                            {t('howItWorks.animation.allSet')}
                          </motion.div>
                        </div>
                      </motion.div>
                    </div>
                    {/* Visual Animation - Desktop Full */}
                    <div className="order-1 md:order-2 hidden md:flex justify-center">
                      <motion.div 
                        className="relative p-8 rounded-3xl bg-gradient-to-br from-purple-50 to-pink-50 dark:from-slate-800/50 dark:to-pink-900/20 border border-purple-100 dark:border-pink-800/30"
                        initial={{ scale: 0.9, opacity: 0 }}
                        whileInView={{ scale: 1, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                      >
                        <div className="flex flex-col items-center gap-3">
                          <div className="flex items-center gap-4">
                            <motion.div
                              className="text-4xl"
                              animate={{ y: [0, -5, 0] }}
                              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                            >
                              👤
                            </motion.div>
                            <motion.div
                              className="text-2xl text-slate-400"
                              initial={{ opacity: 0 }}
                              whileInView={{ opacity: 1 }}
                              viewport={{ once: true }}
                              transition={{ delay: 0.4 }}
                            >
                              →
                            </motion.div>
                            {/* Sell order card */}
                            <motion.div
                              className="flex flex-col items-center"
                              initial={{ x: 20, opacity: 0 }}
                              whileInView={{ x: 0, opacity: 1 }}
                              viewport={{ once: true }}
                              transition={{ delay: 0.6 }}
                            >
                              <div className="px-4 py-3 rounded-xl bg-white dark:bg-slate-700 shadow-xl border border-slate-200 dark:border-slate-600">
                                <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t('howItWorks.animation.sellOrder')}</div>
                                <div className="font-bold text-slate-800 dark:text-white">$500 USDC</div>
                                <div className="text-xs text-blue-500">{t('howItWorks.animation.rate')} ¥7.28</div>
                                <div className="text-xs text-slate-400 dark:text-slate-500">Alipay: 139****8888</div>
                              </div>
                              <motion.div
                                className="mt-2 text-sm font-semibold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent"
                                initial={{ opacity: 0 }}
                                whileInView={{ opacity: 1 }}
                                viewport={{ once: true }}
                                transition={{ delay: 0.9 }}
                              >
                                {t('howItWorks.animation.lyncZContract')}
                              </motion.div>
                            </motion.div>
                          </div>
                          <motion.div
                            className="mt-4 text-center text-lg font-semibold text-emerald-600 dark:text-emerald-400"
                            initial={{ opacity: 0, scale: 0.8 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 1.1, type: "spring" }}
                          >
                            {t('howItWorks.animation.allSet')}
                          </motion.div>
                        </div>
                      </motion.div>
                    </div>
                  </motion.div>

                  {/* Step 2 - Auto-Release */}
                  <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{ duration: 0.6 }}
                    className="grid md:grid-cols-2 gap-6 md:gap-12 items-center"
                  >
                    {/* Text Description - Mobile First */}
                    <div className="order-1 md:hidden">
                      <div className="flex items-center gap-4 mb-4">
                    <motion.div 
                          className="w-10 h-10 rounded-xl bg-pink-500/10 border border-pink-300/40 dark:border-pink-600/30 flex items-center justify-center text-lg font-semibold text-pink-600 dark:text-pink-400"
                      whileHover={{ scale: 1.1, rotate: -5 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      2
                    </motion.div>
                        <h3 className="text-xl font-bold text-slate-800 dark:text-white">{t('howItWorks.offramp.step2.title')}</h3>
                      </div>
                      <p className="text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        {t.rich('howItWorks.offramp.step2.description', {
                          lyncz: (chunks) => <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent font-semibold">{chunks}</span>,
                          alipay: (chunks) => <span className="bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent font-semibold">{chunks}</span>,
                          signed: (chunks) => <span className="bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent font-semibold">{chunks}</span>
                        })}
                      </p>
                    </div>
                    {/* Visual Animation - Mobile Compact */}
                    <div className="order-2 flex justify-center md:hidden">
                      <motion.div 
                        className="relative p-5 rounded-2xl bg-gradient-to-br from-pink-50 to-rose-50 dark:from-slate-800/50 dark:to-rose-900/20 border border-pink-100 dark:border-rose-800/30"
                        initial={{ scale: 0.9, opacity: 0 }}
                        whileInView={{ scale: 1, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="text-3xl">📄</div>
                            <img src="/alipay-logo.svg" alt="Alipay" className="absolute -bottom-0.5 -right-0.5 h-4 rounded-sm bg-white p-0.5 shadow-lg" />
                          </div>
                          <div className="text-xl text-slate-400">→</div>
                          <div className="text-center relative flex flex-col items-center">
                            <div className="text-3xl relative">
                              📜
                              <motion.div className="absolute -top-0.5 -right-0.5 text-xs bg-emerald-500 text-white rounded-full w-5 h-5 flex items-center justify-center" animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>✓</motion.div>
                            </div>
                            <div className="text-[10px] font-semibold mt-0.5 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent whitespace-nowrap">{t('howItWorks.animation.lyncZContract')}</div>
                          </div>
                          <div className="text-xl text-slate-400">→</div>
                          <div className="text-center">
                            <motion.div className="text-2xl" animate={{ y: [0, -8, 0] }} transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}>💰</motion.div>
                            <div className="text-[11px] font-bold text-emerald-600">{t('howItWorks.animation.released')}</div>
                          </div>
                        </div>
                      </motion.div>
                    </div>
                    {/* Visual Animation - Desktop Full */}
                    <div className="hidden md:flex justify-center">
                      <motion.div 
                        className="relative p-8 rounded-3xl bg-gradient-to-br from-pink-50 to-rose-50 dark:from-slate-800/50 dark:to-rose-900/20 border border-pink-100 dark:border-rose-800/30"
                        initial={{ scale: 0.9, opacity: 0 }}
                        whileInView={{ scale: 1, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                      >
                        <div className="flex items-center gap-4">
                          {/* Receipt with Alipay signature */}
                          <motion.div
                            className="relative"
                            initial={{ scale: 0, opacity: 0 }}
                            whileInView={{ scale: 1, opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.4, type: "spring" }}
                          >
                            <div className="text-5xl">📄</div>
                            <img 
                              src="/alipay-logo.svg" 
                              alt="Alipay" 
                              className="absolute -bottom-1 -right-1 h-6 rounded-sm bg-white p-0.5 shadow-lg"
                            />
                          </motion.div>
                          <motion.div
                            className="text-2xl text-slate-400"
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.6 }}
                          >
                            →
                          </motion.div>
                          {/* Smart Contract validates */}
                          <motion.div
                            className="text-center relative flex flex-col items-center"
                            initial={{ scale: 0, opacity: 0 }}
                            whileInView={{ scale: 1, opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.8, type: "spring" }}
                          >
                            <div className="text-5xl relative">
                              📜
                              <motion.div 
                                className="absolute -top-1 -right-1 text-xl bg-emerald-500 text-white rounded-full w-6 h-6 flex items-center justify-center"
                                animate={{ scale: [1, 1.2, 1] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                              >
                                ✓
                              </motion.div>
                            </div>
                            <div className="text-xs font-semibold mt-1 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent">{t('howItWorks.animation.lyncZContract')}</div>
                          </motion.div>
                          <motion.div
                            className="text-2xl text-slate-400"
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 1 }}
                          >
                            →
                          </motion.div>
                          {/* Crypto released */}
                          <motion.div
                            className="text-center"
                            initial={{ scale: 0, opacity: 0 }}
                            whileInView={{ scale: 1, opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 1.2, type: "spring" }}
                          >
                            <motion.div 
                              className="text-5xl"
                              animate={{ y: [0, -8, 0] }}
                              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                            >
                              💰
                            </motion.div>
                            <div className="text-sm font-bold text-emerald-600 mt-1">{t('howItWorks.animation.released')}</div>
                          </motion.div>
                        </div>
                      </motion.div>
                    </div>
                    {/* Text Description - Desktop Only */}
                    <div className="hidden md:block">
                      <div className="flex items-center gap-4 mb-6">
                        <motion.div 
                          className="w-12 h-12 rounded-xl bg-pink-500/10 border border-pink-300/40 dark:border-pink-600/30 flex items-center justify-center text-xl font-semibold text-pink-600 dark:text-pink-400"
                          whileHover={{ scale: 1.1, rotate: -5 }}
                          transition={{ type: "spring", stiffness: 300 }}
                        >
                          2
                        </motion.div>
                        <h3 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-white">{t('howItWorks.offramp.step2.title')}</h3>
                      </div>
                      <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
                        {t.rich('howItWorks.offramp.step2.description', {
                          lyncz: (chunks) => <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent font-semibold">{chunks}</span>,
                          alipay: (chunks) => <span className="bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent font-semibold">{chunks}</span>,
                          signed: (chunks) => <span className="bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent font-semibold">{chunks}</span>
                        })}
                      </p>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Learn more link */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="text-center mt-16"
            >
              <Link href="/docs/how-it-works" className="inline-flex items-center gap-2 text-purple-600 dark:text-purple-400 hover:underline font-medium text-lg">
                <Terminal className="h-5 w-5" />
                {t('howItWorks.exploreLink')}
                <ExternalLink className="h-5 w-5" />
              </Link>
            </motion.div>
          </div>
        </section>


      </div>
    </div>
    </>
  );
}
