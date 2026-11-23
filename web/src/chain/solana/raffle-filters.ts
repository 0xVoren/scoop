import { type GetProgramAccountsFilter, PublicKey } from '@solana/web3.js'
import { encodeBuyerDiscBs58 as encodeBs58 } from '@/chain/solana/buyer-filters'
import {
  RAFFLE_CREATOR_OFFSET,
  RAFFLE_DATA_SIZE,
  RAFFLE_DISCRIMINATOR,
  RAFFLE_PRIZE_MINT_OFFSET,
} from '@/chain/solana/constants'

/** GPA filters: Raffle disc @0 + exact account size. */
export function raffleAccountFilters(): GetProgramAccountsFilter[] {
  return [
    { dataSize: RAFFLE_DATA_SIZE },
    {
      memcmp: {
        offset: 0,
        bytes: encodeBs58(RAFFLE_DISCRIMINATOR),
      },
    },
  ]
}

/** GPA filters: Raffle disc + size + creator pubkey @16. */
export function raffleFiltersForCreator(creator: PublicKey | string): GetProgramAccountsFilter[] {
  const pk = typeof creator === 'string' ? new PublicKey(creator) : creator
  return [
    ...raffleAccountFilters(),
    {
      memcmp: {
        offset: RAFFLE_CREATOR_OFFSET,
        bytes: pk.toBase58(),
      },
    },
  ]
}

/** GPA filters: Raffle disc + size + prize mint @48. */
export function raffleFiltersForPrizeMint(mint: PublicKey | string): GetProgramAccountsFilter[] {
  const pk = typeof mint === 'string' ? new PublicKey(mint) : mint
  return [
    ...raffleAccountFilters(),
    {
      memcmp: {
        offset: RAFFLE_PRIZE_MINT_OFFSET,
        bytes: pk.toBase58(),
      },
    },
  ]
}
