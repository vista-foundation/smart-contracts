// Contract state
export interface ContractState {
    contractAddress?: any;
    contractUtxo?: any;
    senderKeyHash?: any;
    receiverKeyHash?: any;
    custodianKeyHash?: any;
    amount?: bigint;
    currentParty?: 'sender' | 'receiver' | 'custodian';
    depositTxHash?: string;
}
