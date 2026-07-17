import { Transaction } from "@mysten/sui/transactions";

// Gas-native SUI transfer (M1). Splits the requested amount off the gas coin and
// transfers it — no gasless allowlist (that's the USDC `balance::send_funds` path
// in M2). Pure PTB construction; the client is supplied later at tx.build time.
export function buildSuiTransferTx(input: {
  sender: string;
  to: string;
  amountRaw: bigint;
}): Transaction {
  const tx = new Transaction();
  tx.setSender(input.sender);
  const [coin] = tx.splitCoins(tx.gas, [input.amountRaw]);
  tx.transferObjects([coin], input.to);
  return tx;
}
