import { useState, useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { ESCROW_ABI, getAddress, getEscrowAddress } from '@/lib/contracts';

export interface UpdateRateParams {
  orderId: string;
  newRate: string; // Rate in CNY (e.g., "7.35" for ¥7.35/USDC)
  chainId?: number; // Chain ID for multi-chain support
}

export type UpdateRateStep = 'idle' | 'updating' | 'confirming' | 'success' | 'error';

export type UpdateRateErrorCode = 
  | 'userRejected'
  | 'notAuthorized'
  | 'invalidRate'
  | 'orderNotFound'
  | 'networkError'
  | 'unknown';

function parseErrorCode(error: Error | unknown): UpdateRateErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  
  if (message.includes('User rejected') || message.includes('user rejected') || 
      message.includes('User denied') || message.includes('denied transaction')) {
    return 'userRejected';
  }
  if (message.includes('NotAuthorized') || message.includes('0xea8e4eb5')) {
    return 'notAuthorized';
  }
  if (message.includes('InvalidAmount') || message.includes('0x2c5211c6')) {
    return 'invalidRate';
  }
  if (message.includes('OrderNotFound')) {
    return 'orderNotFound';
  }
  if (message.includes('network') || message.includes('timeout')) {
    return 'networkError';
  }
  
  return 'unknown';
}

export function useUpdateExchangeRate() {
  const [currentStep, setCurrentStep] = useState<UpdateRateStep>('idle');
  const [errorCode, setErrorCode] = useState<UpdateRateErrorCode | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const { writeContract, data: updateHash, error: updateError, isPending: isWritePending } = useWriteContract();

  const { 
    isLoading: isConfirming, 
    isSuccess: isUpdateSuccess,
    isError: isReceiptError,
    error: receiptError 
  } = useWaitForTransactionReceipt({
    hash: updateHash,
  });

  const isUpdating = isWritePending || isConfirming;

  useEffect(() => {
    if (updateError) {
      console.error('Update rate error:', updateError);
      setErrorCode(parseErrorCode(updateError));
      setCurrentStep('error');
    }
  }, [updateError]);

  useEffect(() => {
    if (isReceiptError && receiptError) {
      console.error('Transaction receipt error:', receiptError);
      setErrorCode(parseErrorCode(receiptError));
      setCurrentStep('error');
    }
  }, [isReceiptError, receiptError]);

  useEffect(() => {
    if (updateHash && currentStep === 'updating') {
      setCurrentStep('confirming');
      setTxHash(updateHash);
    }
  }, [updateHash, currentStep]);

  useEffect(() => {
    if (isUpdateSuccess && (currentStep === 'updating' || currentStep === 'confirming')) {
      console.log('Exchange rate update confirmed!');
      setCurrentStep('success');
      setTxHash(updateHash || null);
    }
  }, [isUpdateSuccess, currentStep, updateHash]);

  const executeUpdateRate = async (params: UpdateRateParams) => {
    try {
      setErrorCode(null);
      setCurrentStep('updating');

      // Convert rate to cents (e.g., 7.35 -> 735)
      const rateCents = Math.round(parseFloat(params.newRate) * 100);

      const orderIdBytes = params.orderId.startsWith('0x') 
        ? params.orderId 
        : `0x${params.orderId}`;

      console.log('Updating exchange rate...', {
        orderId: orderIdBytes,
        newRate: rateCents,
      });

      const chainId = params.chainId || 8453;
      const escrowAddr = getEscrowAddress(chainId);
      writeContract({
        address: getAddress(escrowAddr),
        abi: ESCROW_ABI,
        functionName: 'updateExchangeRate',
        args: [orderIdBytes as `0x${string}`, BigInt(rateCents)],
        chainId,
      });
    } catch (err) {
      console.error('Error updating exchange rate:', err);
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
    executeUpdateRate,
    resetState,
    currentStep,
    isUpdating,
    errorCode,
    txHash,
  };
}
