# SurfPoints Contract Security Audit Report

**Contract:** SurfPoints.sol
**Version:** 1.1.0 (post-audit)
**Auditor:** Internal Review
**Date:** January 2026
**Solidity Version:** ^0.8.20

---

## Executive Summary

The SurfPoints contract is a UUPS upgradeable contract for managing surf points and token rewards. The contract follows a trusted admin model where the owner (treasury) and admins are assumed to be secure entities.

**Overall Assessment:** The contract is well-structured with proper security patterns. Several issues were identified, with one requiring a fix and others being informational.

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 1 |
| Low | 2 |
| Informational | 3 |

---

## Findings

### [M-01] Lock Period Change Affects Existing Claims

**Severity:** Medium
**Status:** FIXED in v1.1.0
**Location:** `withdrawClaim()`, `batchWithdrawClaims()`

**Description:**
The original withdrawal functions used the current `claimLockPeriod` state variable to determine if a claim can be withdrawn. If the owner changed `claimLockPeriod` after a user initiated a claim, it would affect existing claims unexpectedly.

**Fix Applied:**
The `ClaimRequest` struct now includes an `unlockTime` field that stores the absolute unlock timestamp at claim creation:

```solidity
struct ClaimRequest {
    uint256 amount;
    uint256 claimTime;
    uint256 unlockTime;  // Fixed unlock time stored at creation
    bool withdrawn;
}
```

Withdrawal functions now check against `claim.unlockTime` instead of calculating dynamically:

```solidity
if (block.timestamp < claim.unlockTime) revert ClaimStillLocked();
```

**Verification:** Users' claims are now locked for exactly the period shown at claim time, regardless of subsequent lock period changes.

---

### [L-01] No Batch Size Limit

**Severity:** Low
**Status:** ACKNOWLEDGED
**Location:** `batchRecordSurfPoints()` line 189, `batchWithdrawClaims()` line 266

**Description:**
Batch functions have no maximum array length limit, which could lead to:
- Out-of-gas errors on large batches
- Transaction failures near block gas limit

**Impact:**
- Failed transactions with wasted gas
- Poor user experience

**Recommendation:**
Add a maximum batch size constant:

```solidity
uint256 public constant MAX_BATCH_SIZE = 100;

function batchRecordSurfPoints(...) external ... {
    require(_users.length <= MAX_BATCH_SIZE, "Batch too large");
    // ...
}
```

---

### [L-02] View Functions Inefficient for Large Claim Counts

**Severity:** Low
**Status:** ACKNOWLEDGED
**Location:** `getPendingClaims()` line 458, `getWithdrawableClaims()` line 504

**Description:**
These functions iterate through all claims twice (once to count, once to populate arrays). For users with hundreds of claims, this could be expensive for on-chain calls.

**Impact:**
- High gas cost if called on-chain by other contracts
- Potential DoS for contracts integrating with these view functions

**Mitigation:**
These are primarily meant for off-chain use where gas is not a concern. Document this limitation.

---

### [I-01] Owner Cannot Lose Admin Status

**Severity:** Informational
**Location:** `onlyAdmin` modifier line 93-98

**Description:**
The `onlyAdmin` modifier grants admin access to the owner regardless of the `isAdmin` mapping:

```solidity
modifier onlyAdmin() {
    if (!isAdmin[msg.sender] && msg.sender != owner()) {
        revert OnlyAdmin();
    }
    _;
}
```

Even if `removeAdmin(owner())` is called, owner retains admin privileges.

**Status:** This is expected behavior - owner should always have admin access.

---

### [I-02] Silent Skips in Batch Withdrawal

**Severity:** Informational
**Location:** `batchWithdrawClaims()` line 266-286

**Description:**
When claims are skipped (invalid ID, already withdrawn, still locked), no event is emitted. Users may not realize some claims in their batch were not processed.

**Recommendation:**
Consider adding an event for skipped claims or returning an array of processed claim IDs.

---

### [I-03] Fee-on-Transfer Token Compatibility

**Severity:** Informational
**Location:** Throughout contract

**Description:**
The contract assumes 1:1 ratio between points recorded and tokens claimable. If a fee-on-transfer token is used as `surfToken`, users will receive fewer tokens than their points balance.

**Mitigation:**
Document that fee-on-transfer tokens are not supported, or implement balance-before/after checks in `depositSurfToken()`.

---

## Security Patterns Verified

### Reentrancy Protection ✓
All state-changing functions that interact with external contracts use `nonReentrant` modifier:
- `claimSurfPoints()`
- `withdrawClaim()`
- `batchWithdrawClaims()`
- `depositSurfToken()`
- `withdrawSurfToken()`
- `emergencyWithdrawToken()`
- `emergencyWithdrawNative()`

### Access Control ✓
- Owner-only functions properly restricted with `onlyOwner`
- Admin functions properly restricted with `onlyAdmin`
- Clear separation of privileges

### Pausability ✓
- Critical user functions have `whenNotPaused`
- Emergency functions remain accessible when paused (correct design)

### Safe Token Handling ✓
- Uses OpenZeppelin's `SafeERC20` for all token transfers
- Prevents issues with non-standard ERC20 implementations

### UUPS Upgrade Security ✓
- `_authorizeUpgrade` properly restricted to owner
- 48-slot storage gap for future upgrades
- Proper initializer pattern with `initializer` modifier

### Integer Safety ✓
- Solidity 0.8.20 provides built-in overflow/underflow protection
- No unchecked arithmetic in critical calculations

### Checks-Effects-Interactions ✓
- State updates occur before external calls in `withdrawClaim()`
- Proper pattern followed throughout

---

## Centralization Risks (By Design)

The following centralization vectors exist by design under the trusted admin model:

| Risk | Owner Can | Mitigation |
|------|-----------|------------|
| Pause Indefinitely | Yes | Trust assumption |
| Change Lock Period | Yes | Affects existing claims (needs fix) |
| Withdraw All Tokens | Yes | Trust assumption |
| Change Token Address | Yes | Trust assumption |
| Upgrade Contract | Yes | UUPS pattern |

| Risk | Admin Can | Mitigation |
|------|-----------|------------|
| Add Unlimited Points | Yes | Trust assumption |
| Record Points to Any Address | Yes | Trust assumption |

**Note:** These are accepted risks under the stated trust model.

---

## Gas Optimization Observations

1. **Storage reads in loops:** `claimLockPeriod` is read from storage in each iteration of `batchWithdrawClaims()`. Consider caching in memory.

2. **Event emission in loops:** Each iteration emits an event. Consider batch events for gas savings.

3. **Double iteration in view functions:** Could be optimized with dynamic arrays if needed on-chain.

---

## Recommendations Summary

| ID | Severity | Recommendation | Status |
|----|----------|----------------|--------|
| M-01 | Medium | Store unlock time at claim creation | FIXED |
| L-01 | Low | Add batch size limits | ACKNOWLEDGED |
| L-02 | Low | Document view function limitations | ACKNOWLEDGED |
| I-01 | Info | Document owner always has admin access | ACKNOWLEDGED |
| I-02 | Info | Consider events for skipped claims | ACKNOWLEDGED |
| I-03 | Info | Document fee-on-transfer incompatibility | ACKNOWLEDGED |

---

## Conclusion

The SurfPoints contract (v1.1.0) is well-designed with appropriate security measures for a trusted admin model. The medium-severity finding (M-01) has been fixed - claims now store their unlock time at creation, ensuring users' lock periods are honored regardless of subsequent configuration changes.

All critical security patterns (reentrancy guards, access control, safe token handling, upgrade security) are properly implemented. The contract is ready for deployment on Base/Base Sepolia.
