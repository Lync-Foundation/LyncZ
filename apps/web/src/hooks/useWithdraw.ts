import { useState, useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';
import { ESCROW_ABI, getAddress, getEscrowAddress } from '@/lib/contracts';

export interface WithdrawParams {
  orderId: string;
  amount: string; // Human-readable (e.g., "50.5")
  tokenAddress: string; // ERC20 token address
  tokenDecimals: number; // Token decimals (6, 9, 18, etc.)
  chainId?: number; // Chain ID for multi-chain support
}

export type WithdrawStep = 'idle' | 'withdrawing' | 'confirming' | 'success' | 'error';

// Error code types for i18n translation
export type WithdrawErrorCode = 
  | 'userRejected'
  | 'notAuthorized'
  | 'insufficientBalance'
  | 'invalidAmount'
  | 'orderNotActive'
  | 'insufficientGas'
  | 'networkError'
  | 'reverted'
  | 'unknown';

/**
 * Parse blockchain errors into error codes for i18n
 */
function parseErrorCode(error: Error | unknown): WithdrawErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  
  // User rejection
  if (message.includes('User rejected') || message.includes('user rejected') || 
      message.includes('User denied') || message.includes('denied transaction')) {
    return 'userRejected';
  }
  
  // Contract errors (revert reasons)
  if (message.includes('NotAuthorized') || message.includes('0xea8e4eb5')) {
    return 'notAuthorized';
  }
  if (message.includes('InsufficientBalance') || message.includes('0xf4d678b8')) {
    return 'insufficientBalance';
  }
  if (message.includes('InvalidAmount') || message.includes('0x2c5211c6')) {
    return 'invalidAmount';
  }
  if (message.includes('OrderNotActive') || message.includes('0x7ef50e52')) {
    return 'orderNotActive';
  }
  
  // Gas/network errors
  if (message.includes('insufficient funds') || message.includes('gas')) {
    return 'insufficientGas';
  }
  if (message.includes('network') || message.includes('timeout')) {
    return 'networkError';
  }
  
  // Transaction failed on-chain
  if (message.includes('reverted') || message.includes('execution reverted')) {
    return 'reverted';
  }
  
  return 'unknown';
}

export function useWithdraw() {
  const [currentStep, setCurrentStep] = useState<WithdrawStep>('idle');
  const [errorCode, setErrorCode] = useState<WithdrawErrorCode | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const { writeContract, data: withdrawHash, error: withdrawError, isPending: isWritePending } = useWriteContract();

  const { 
    isLoading: isConfirming, 
    isSuccess: isWithdrawSuccess,
    isError: isReceiptError,
    error: receiptError 
  } = useWaitForTransactionReceipt({
    hash: withdrawHash,
  });

  // Computed loading state
  const isWithdrawing = isWritePending || isConfirming;

  // Handle write errors (user rejection, simulation failure)
  useEffect(() => {
    if (withdrawError) {
      console.error('Withdraw write error:', withdrawError);
      setErrorCode(parseErrorCode(withdrawError));
      setCurrentStep('error');
    }
  }, [withdrawError]);

  // Handle receipt errors (on-chain failure)
  useEffect(() => {
    if (isReceiptError && receiptError) {
      console.error('Transaction receipt error:', receiptError);
      setErrorCode(parseErrorCode(receiptError));
      setCurrentStep('error');
    }
  }, [isReceiptError, receiptError]);

  // Handle transaction sent (waiting for confirmation)
  useEffect(() => {
    if (withdrawHash && currentStep === 'withdrawing') {
      setCurrentStep('confirming');
      setTxHash(withdrawHash);
    }
  }, [withdrawHash, currentStep]);

  // Handle success
  useEffect(() => {
    if (isWithdrawSuccess && (currentStep === 'withdrawing' || currentStep === 'confirming')) {
      console.log('Withdrawal confirmed!');
      setCurrentStep('success');
      setTxHash(withdrawHash || null);
    }
  }, [isWithdrawSuccess, currentStep, withdrawHash]);

  const executeWithdraw = async (params: WithdrawParams) => {
    try {
      setErrorCode(null);
      setCurrentStep('withdrawing');

      // Parse amount with token-specific decimals
      const amountWei = parseUnits(params.amount, params.tokenDecimals);

      // Convert orderId to bytes32
      const orderIdBytes = params.orderId.startsWith('0x') 
        ? params.orderId 
        : `0x${params.orderId}`;

      console.log('Withdrawing...', {
        orderId: orderIdBytes,
        amount: amountWei.toString(),
        token: params.tokenAddress,
        decimals: params.tokenDecimals,
      });

      // Send the transaction - let wallet handle gas estimation
      const chainId = params.chainId || 8453;
      const escrowAddr = getEscrowAddress(chainId);
      writeContract({
        address: getAddress(escrowAddr),
        abi: ESCROW_ABI,
        functionName: 'withdrawFromOrder',
        args: [orderIdBytes as `0x${string}`, amountWei],
        chainId,
      });
    } catch (err) {
      console.error('Error in withdrawal:', err);
      setErrorCode(parseErrorCode(err));
      setCurrentStep('error');
    }
  };

  const resetState = () => {
    setCurrentStep('idle');
    setErrorCode(null);
    setTxHash(null);
  };

  return {
    executeWithdraw,
    resetState,
    currentStep,
    isWithdrawing,
    errorCode,
    txHash,
  };
}

