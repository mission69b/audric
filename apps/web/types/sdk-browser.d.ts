declare module '@t2000/sdk/browser' {
  export { ZkLoginSigner } from '@t2000/sdk';
  export type { ZkLoginProof } from '@t2000/sdk';
  export { KeypairSigner } from '@t2000/sdk';
  export type { TransactionSigner } from '@t2000/sdk';
  export { T2000Error, mapWalletError, mapMoveAbortCode } from '@t2000/sdk';
  export type { T2000ErrorCode, T2000ErrorData } from '@t2000/sdk';
  export { validateAddress, truncateAddress } from '@t2000/sdk';
  export { toBase64, fromBase64 } from '@t2000/sdk';
  export { calculateFee, addCollectFeeToTx } from '@t2000/sdk';
  export type { ProtocolFeeInfo, FeeOperation } from '@t2000/sdk';
}
