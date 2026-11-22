//! SlotHashes randomness — parity with EVM `resolveDrawBlock`; no VRF.
//!
//! ## Externally verifiable rules (anchored)
//! - `eligible = sold_out_slot + draw_delay_slots`
//! - Callable when: `current_slot > eligible`
//! - Entropy: **only** the SlotHashes entry where `slot == eligible` (never the latest call-time slot)
//! - Winner: `winner = u64::from_le_bytes(keccak(hash || raffle_id_le)[0..8]) % total_shares`
//! - If `eligible` ages out of the SlotHashes window → `DrawEntropyExpired` → refund/recover (SoldOut→Expired)

use anchor_lang::prelude::*;
use solana_keccak_hasher as keccak;

use crate::errors::ScoopError;

/// One SlotHash entry (slot, hash)
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SlotHashEntry {
    pub slot: u64,
    pub hash: [u8; 32],
}

/// Typical SlotHashes sysvar retention; gates late SoldOut refunds (conservative bound without sysvar).
pub const SLOT_HASHES_RETENTION: u64 = 512;

/// Resolve draw slot: must hit the **exact** `eligible` entry.
pub fn resolve_draw_slot(
    sold_out_slot: u64,
    delay: u32,
    current_slot: u64,
    entries: &[SlotHashEntry],
) -> Result<(u64, [u8; 32])> {
    let eligible = sold_out_slot
        .checked_add(u64::from(delay))
        .ok_or(ScoopError::MathOverflow)?;
    if current_slot <= eligible {
        return err!(ScoopError::DrawTooEarly);
    }
    if entries.is_empty() {
        return err!(ScoopError::NoSlotHash);
    }

    if let Some(e) = entries.iter().find(|e| e.slot == eligible) {
        return Ok((e.slot, e.hash));
    }

    let oldest = entries.iter().map(|e| e.slot).min().unwrap();
    if eligible < oldest {
        return err!(ScoopError::DrawEntropyExpired);
    }
    // eligible still inside window but entry missing (fork holes, etc.)
    err!(ScoopError::NoSlotHash)
}

/// Whether the `eligible` hash is unavailable (too late to draw).
pub fn is_draw_entropy_expired(
    sold_out_slot: u64,
    delay: u32,
    current_slot: u64,
    entries: Option<&[SlotHashEntry]>,
) -> Result<bool> {
    let eligible = sold_out_slot
        .checked_add(u64::from(delay))
        .ok_or(ScoopError::MathOverflow)?;
    if current_slot <= eligible {
        return Ok(false);
    }
    if let Some(entries) = entries {
        if entries.is_empty() {
            return Ok(current_slot > eligible.saturating_add(SLOT_HASHES_RETENTION));
        }
        if entries.iter().any(|e| e.slot == eligible) {
            return Ok(false);
        }
        let oldest = entries.iter().map(|e| e.slot).min().unwrap();
        return Ok(eligible < oldest);
    }
    // No SlotHashes: conservative estimate via retention length
    Ok(current_slot > eligible.saturating_add(SLOT_HASHES_RETENTION))
}

/// dRaffle-style entropy expansion: `keccak(slot_hash || raffle_id_le)` so raffles sharing a slot do not correlate.
pub fn expand_entropy(slot_hash: &[u8; 32], raffle_id: u64) -> [u8; 32] {
    let mut buf = [0u8; 40];
    buf[..32].copy_from_slice(slot_hash);
    buf[32..].copy_from_slice(&raffle_id.to_le_bytes());
    keccak::hash(&buf).to_bytes()
}

/// Parse entries from SlotHashes sysvar account data.
///
/// Solana `SlotHashes` account layout (sysvar):
/// - First 8 bytes: entry count as little-endian `u64`
/// - Then each entry: `u64 slot` + `Hash` (32 bytes) = 40 bytes, **newest slot first**
pub fn parse_slot_hashes(data: &[u8]) -> Result<Vec<SlotHashEntry>> {
    if data.len() < 8 {
        return err!(ScoopError::InvalidSlotHashes);
    }
    let mut len_buf = [0u8; 8];
    len_buf.copy_from_slice(&data[0..8]);
    let n = u64::from_le_bytes(len_buf) as usize;
    let need = 8 + n.saturating_mul(40);
    if data.len() < need {
        return err!(ScoopError::InvalidSlotHashes);
    }
    let mut out = Vec::with_capacity(n);
    for i in 0..n {
        let off = 8 + i * 40;
        let mut slot_buf = [0u8; 8];
        slot_buf.copy_from_slice(&data[off..off + 8]);
        let slot = u64::from_le_bytes(slot_buf);
        let mut hash = [0u8; 32];
        hash.copy_from_slice(&data[off + 8..off + 40]);
        // Skip all-zero hash (defensive; normal SlotHashes should not emit these)
        if hash == [0u8; 32] {
            continue;
        }
        out.push(SlotHashEntry { slot, hash });
    }
    Ok(out)
}

/// Test helper: build fake entries
#[cfg(test)]
pub fn mock_entries(pairs: &[(u64, u8)]) -> Vec<SlotHashEntry> {
    pairs
        .iter()
        .map(|(slot, fill)| {
            let mut hash = [0u8; 32];
            hash.fill(*fill);
            // Ensure non-zero
            if hash == [0u8; 32] {
                hash[0] = 1;
            }
            SlotHashEntry {
                slot: *slot,
                hash,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::winner_share_index;

    #[test]
    fn too_early_rejected() {
        let entries = mock_entries(&[(10, 1), (9, 2), (8, 3)]);
        let err = resolve_draw_slot(5, 5, 10, &entries).unwrap_err();
        let s = err.to_string();
        assert!(
            s.contains("DrawTooEarly") || s.contains("too early") || s.contains("Draw too early"),
            "{s}"
        );
    }

    #[test]
    fn picks_exact_eligible() {
        // sold_out=100, delay=5 → eligible=105; current=110
        let entries = mock_entries(&[
            (109, 9),
            (108, 8),
            (107, 7),
            (106, 6),
            (105, 5),
            (104, 4),
        ]);
        let (slot, hash) = resolve_draw_slot(100, 5, 110, &entries).unwrap();
        assert_eq!(slot, 105);
        assert_eq!(hash[0], 5);
    }

    #[test]
    fn late_draw_entropy_expired() {
        // eligible=50 aged out; window oldest=200
        let entries = mock_entries(&[(249, 1), (248, 2), (200, 3)]);
        let err = resolve_draw_slot(10, 40, 250, &entries).unwrap_err();
        let s = err.to_string();
        assert!(
            s.contains("DrawEntropyExpired") || s.contains("entropy"),
            "{s}"
        );
    }

    #[test]
    fn expand_entropy_domain_separates() {
        let mut hash = [0u8; 32];
        hash[0] = 7;
        let a = expand_entropy(&hash, 1);
        let b = expand_entropy(&hash, 2);
        assert_ne!(a, b);
        assert_ne!(a, hash);
    }

    #[test]
    fn winner_index_le_mod() {
        let mut hash = [0u8; 32];
        // le u64 = 10
        hash[0] = 10;
        assert_eq!(winner_share_index(&hash, 7), 3); // 10 % 7
        // raised fee sanity nearby
        hash[0] = 0;
        hash[1] = 1; // le = 256
        assert_eq!(winner_share_index(&hash, 100), 56);
    }

    #[test]
    fn parse_slot_hashes_roundtrip() {
        let mut data = Vec::new();
        data.extend_from_slice(&2u64.to_le_bytes());
        data.extend_from_slice(&42u64.to_le_bytes());
        let mut h1 = [0u8; 32];
        h1[0] = 7;
        data.extend_from_slice(&h1);
        data.extend_from_slice(&41u64.to_le_bytes());
        let mut h2 = [0u8; 32];
        h2[0] = 8;
        data.extend_from_slice(&h2);
        let entries = parse_slot_hashes(&data).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].slot, 42);
        assert_eq!(entries[1].slot, 41);
    }

    #[test]
    fn parse_slot_hashes_rejects_short_and_skips_zero_hash() {
        assert!(parse_slot_hashes(&[1, 2, 3]).is_err());
        // Declares 1 entry but truncates payload
        let mut truncated = Vec::new();
        truncated.extend_from_slice(&1u64.to_le_bytes());
        truncated.extend_from_slice(&9u64.to_le_bytes());
        assert!(parse_slot_hashes(&truncated).is_err());

        let mut data = Vec::new();
        data.extend_from_slice(&2u64.to_le_bytes());
        data.extend_from_slice(&10u64.to_le_bytes());
        data.extend_from_slice(&[0u8; 32]); // zero hash skipped
        data.extend_from_slice(&9u64.to_le_bytes());
        let mut h = [0u8; 32];
        h[0] = 3;
        data.extend_from_slice(&h);
        let entries = parse_slot_hashes(&data).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].slot, 9);
    }

    #[test]
    fn resolve_draw_slot_empty_and_hole() {
        let empty: Vec<SlotHashEntry> = vec![];
        let err = resolve_draw_slot(1, 1, 10, &empty).unwrap_err().to_string();
        assert!(err.contains("NoSlotHash") || err.contains("slot hash"), "{err}");

        // eligible still inside window but missing exact entry
        let entries = mock_entries(&[(12, 1), (11, 2), (9, 3)]);
        let err = resolve_draw_slot(5, 5, 15, &entries).unwrap_err().to_string(); // eligible=10
        assert!(err.contains("NoSlotHash") || err.contains("slot hash"), "{err}");
    }

    #[test]
    fn is_draw_entropy_expired_branches() {
        let entries = mock_entries(&[(20, 1), (19, 2), (15, 3)]);
        // too early → not expired
        assert!(!is_draw_entropy_expired(10, 5, 15, Some(&entries)).unwrap());
        // exact eligible present → not expired
        assert!(!is_draw_entropy_expired(10, 5, 20, Some(&entries)).unwrap());
        // eligible older than window → expired
        assert!(is_draw_entropy_expired(1, 1, 50, Some(&entries)).unwrap());
        // empty entries + past retention
        let empty: Vec<SlotHashEntry> = vec![];
        assert!(is_draw_entropy_expired(1, 1, 1 + 1 + SLOT_HASHES_RETENTION + 1, Some(&empty)).unwrap());
        // no sysvar: retention heuristic
        assert!(!is_draw_entropy_expired(100, 5, 110, None).unwrap());
        assert!(is_draw_entropy_expired(100, 5, 100 + 5 + SLOT_HASHES_RETENTION + 1, None).unwrap());
    }
}
