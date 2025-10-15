// Contract state management
export interface ContractState {
    depositorKeyHash?: string;
    beneficiaryKeyHash?: string;
    authorizedKeyHash?: string;
    contractAddress?: string;
    currentParty?: 'depositor' | 'beneficiary' | 'authorized';
    amount?: bigint;
    depositTxHash?: string;
    deadline?: number;
    requiredSignatures?: number;
    feePercentage?: number;
    feeRecipient?: string;
}
