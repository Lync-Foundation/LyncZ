import { useState, useEffect, useRef } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { parseUnits, Address, getAddress, keccak256, toBytes, decodeEventLog } from 'viem';
import { ESCROW_ABI, USDC_ABI, PaymentRail, PAYMENT_RAIL, computeAccountLinesHash, getEscrowAddress } from '@/lib/contracts';
import { submitPaymentInfo } from '@/lib/api';

export interface CreateOrderParams {
  tokenAddress: string; // ERC20 token address
  tokenDecimals: number; // Token decimals (6 for USDC/USDT, 9 for SOL, 18 for others)
  amount: string; // Token amount (in human-readable format, e.g. "100")
  exchangeRate: string; // Exchange rate in cents (e.g. "730" for 7.30 CNY/token)
  rail: PaymentRail; // Payment rail (0 = Alipay, 1 = WeChat)
  accountId: string; // Payment account ID
  accountName: string; // Payment account name
  isPublic?: boolean; // v4: public or private order (default: true)
  chainId?: number; // Chain ID for multi-chain support
}

export type CreateOrderStep = 'idle' | 'approving' | 'creating' | 'submitting-info' | 'success' | 'error';

// Error code types for i18n translation
export type CreateOrderErrorCode = 
  | 'userRejected'
  | 'insufficientBalance'
  | 'insufficientAllowance'
  | 'insufficientGas'
  | 'networkError'
  | 'contractError'
  | 'unknown';

/**
 * Parse blockchain errors into error codes for i18n
 */
function parseErrorCode(error: Error | unknown): CreateOrderErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  
  // User rejection
  if (message.includes('User rejected') || message.includes('user rejected') || 
      message.includes('User denied') || message.includes('denied transaction')) {
    return 'userRejected';
  }
  
  // Balance/allowance errors
  if (message.includes('insufficient funds for transfer') || 
      message.includes('transfer amount exceeds balance')) {
    return 'insufficientBalance';
  }
  if (message.includes('insufficient allowance') || 
      message.includes('transfer amount exceeds allowance')) {
    return 'insufficientAllowance';
  }
  
  // Gas errors
  if (message.includes('insufficient funds') || message.includes('gas')) {
    return 'insufficientGas';
  }
  
  // Network errors
  if (message.includes('network') || message.includes('timeout') || 
      message.includes('connection')) {
    return 'networkError';
  }
  
  // Contract revert
  if (message.includes('reverted') || message.includes('execution reverted')) {
    return 'contractError';
  }
  
  return 'unknown';
}

export function useCreateOrder() {
  const [currentStep, setCurrentStep] = useState<CreateOrderStep>('idle');
  const [errorCode, setErrorCode] = useState<CreateOrderErrorCode | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  
  // v4: Store params for submitting to backend after on-chain creation
  const pendingParamsRef = useRef<CreateOrderParams | null>(null);

  const publicClient = usePublicClient();
  
  const { writeContract: approve, data: approveHash, error: approveError } = useWriteContract();
  const { writeContract: createOrder, data: createHash, error: createError } = useWriteContract();

  const { isLoading: isApproving, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  const { isLoading: isCreating, isSuccess: isCreateSuccess } = useWaitForTransactionReceipt({
    hash: createHash,
  });

  const resetState = () => {
    setCurrentStep('idle');
    setErrorCode(null);
    setOrderId(null);
  };

  // Handle approve errors
  useEffect(() => {
    if (approveError) {
      console.error('Approval error:', approveError);
      setErrorCode(parseErrorCode(approveError));
      setCurrentStep('error');
    }
  }, [approveError]);

  // Handle create errors
  useEffect(() => {
    if (createError) {
      console.error('Create order error:', createError);
      setErrorCode(parseErrorCode(createError));
      setCurrentStep('error');
    }
  }, [createError]);

  const executeCreateOrder = async (params: CreateOrderParams) => {
    try {
      setErrorCode(null);
      setCurrentStep('approving');

      // Parse amount with token-specific decimals
      const amountWei = parseUnits(params.amount, params.tokenDecimals);
      
      // Get chain-specific escrow address
      const escrowAddr = getEscrowAddress(params.chainId || 8453);

      // Step 1: Approve token
      console.log('Approving token...', { 
        token: params.tokenAddress,
        amount: amountWei.toString(), 
        escrow: escrowAddr,
        chainId: params.chainId,
      });
      
      approve({
        address: getAddress(params.tokenAddress),
        abi: USDC_ABI, // Generic ERC20 ABI works for all tokens
        functionName: 'approve',
        args: [getAddress(escrowAddr), amountWei],
      });

      // Wait for approval (handled by isApproving state)
      // Once approved, move to creation step
    } catch (err) {
      console.error('Error in approval:', err);
      setErrorCode(parseErrorCode(err));
      setCurrentStep('error');
    }
  };

  // When approval succeeds, create the order
  // v4: Compute hash and pass to contract, store params for backend submission
  const handleApprovalSuccess = async (params: CreateOrderParams) => {
    try {
      setCurrentStep('creating');
      
      const amountWei = parseUnits(params.amount, params.tokenDecimals);
      const rate = BigInt(params.exchangeRate);
      
      // v4: Compute accountLinesHash = SHA256(20 || accountName || 21 || accountId)
      const accountLinesHash = await computeAccountLinesHash(params.accountName, params.accountId);
      const isPublic = params.isPublic !== false; // Default to true if not specified
      
      // Get chain-specific escrow address
      const escrowAddr = getEscrowAddress(params.chainId || 8453);
      
      // Store params for backend submission after on-chain creation
      pendingParamsRef.current = params;

      console.log('Creating order (v4)...', {
        token: params.tokenAddress,
        amount: amountWei.toString(),
        exchangeRate: rate.toString(),
        rail: params.rail,
        accountLinesHash,
        isPublic,
        chainId: params.chainId,
        escrow: escrowAddr,
        // Plain text NOT sent to chain, only to backend after order creation
      });

      createOrder({
        address: getAddress(escrowAddr),
        abi: ESCROW_ABI,
        functionName: 'createOrder',
        args: [
          getAddress(params.tokenAddress),
          amountWei,
          rate,
          params.rail,
          accountLinesHash,  // v4: hash instead of plain text
          isPublic,          // v4: public/private flag
        ],
      });
    } catch (err) {
      console.error('Error creating order:', err);
      setErrorCode(parseErrorCode(err));
      setCurrentStep('error');
    }
  };

  // When order creation succeeds, extract order ID from logs and submit payment info to backend
  const handleCreateSuccess = async () => {
    try {
      if (!createHash || !publicClient) return;

      const receipt = await publicClient.getTransactionReceipt({ hash: createHash });
      
      // Find OrderCreated event in logs
      // v4 Event signature: OrderCreated(bytes32 indexed orderId, address indexed seller, address indexed token, 
      //                                  uint256 totalAmount, uint256 exchangeRate, uint8 rail, bytes32 accountLinesHash, bool isPublic)
      const eventSignature = 'OrderCreated(bytes32,address,address,uint256,uint256,uint8,bytes32,bool)';
      const eventTopic = keccak256(toBytes(eventSignature));
      
      console.log('Looking for OrderCreated event with topic:', eventTopic);
      console.log('Transaction receipt logs:', receipt.logs.map(l => ({ topics: l.topics, address: l.address })));
      
      // Find the log with this topic
      const orderLog = receipt.logs.find(log => 
        log.topics[0]?.toLowerCase() === eventTopic.toLowerCase()
      );
      
      let extractedOrderId: string | null = null;
      
      if (orderLog && orderLog.topics[1]) {
        // topics[1] is the indexed orderId (bytes32)
        extractedOrderId = orderLog.topics[1];
        console.log('Extracted order ID from logs:', extractedOrderId);
        setOrderId(extractedOrderId);
      } else {
        console.warn('Could not find OrderCreated event in logs, falling back to tx hash');
        console.log('Available event topics:', receipt.logs.map(l => l.topics[0]));
        setOrderId(createHash ?? null);
        extractedOrderId = createHash ?? null;
      }
      
      // v4: Submit plain text payment info to backend
      // This is required for buyers to see the payment account details
      if (extractedOrderId && pendingParamsRef.current) {
        setCurrentStep('submitting-info');
        
        try {
          const params = pendingParamsRef.current;
          console.log('Submitting payment info to backend...', {
            orderId: extractedOrderId,
            accountId: params.accountId,
            accountName: params.accountName,
          });
          
          await submitPaymentInfo(extractedOrderId, params.accountId, params.accountName);
          console.log('Payment info submitted successfully');
        } catch (backendErr) {
          // Log error but don't fail - order is already created on-chain
          console.error('Warning: Failed to submit payment info to backend:', backendErr);
          // The seller can retry via the update payment info feature if needed
        }
        
        pendingParamsRef.current = null;
      }
      
      setCurrentStep('success');
      
    } catch (err) {
      console.error('Error extracting order ID:', err);
      setCurrentStep('success'); // Still consider it success even if we can't extract ID
      setOrderId(createHash ?? null); // Fallback to tx hash
    }
  };

  return {
    executeCreateOrder,
    handleApprovalSuccess,
    handleCreateSuccess,
    resetState,
    currentStep,
    isApproving,
    isCreating,
    errorCode,
    orderId,
    approveHash,
    createHash,
    isApproveSuccess,
    isCreateSuccess,
  };
}

