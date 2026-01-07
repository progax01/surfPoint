# Skip Claim Feature Documentation

## Summary

Added a new "skip claim" feature that allows users to permanently forfeit their surf points instead of claiming them. This is a mutually exclusive choice with claiming - users can either be "claimers" or "skippers" but not both.

---

## Changes Made

### 1. Removed Function
- ❌ **`batchWithdrawClaims(uint256[] calldata _claimIds)`** - Removed to simplify the contract

### 2. New State Variable
```solidity
/// @notice Mapping to track if user has chosen to skip claims (permanent choice)
mapping(address => bool) public hasSkippedClaim;
```

### 3. New Function
```solidity
/**
 * @notice Allows users to skip/forfeit their accumulated surf points
 * @dev Permanently forfeits current points, user cannot claim after skipping
 *      Cannot skip if user has already claimed before
 *      This is a permanent choice - once skipped, user can never claim
 */
function skipClaimRewards() external whenNotPaused nonReentrant
```

### 4. Updated Functions

#### `claimSurfPoints()`
Added check to prevent claiming if user has skipped:
```solidity
if (hasSkippedClaim[msg.sender]) revert AlreadySkipped();
```

### 5. New Events
```solidity
event ClaimSkipped(address indexed user, uint256 pointsForfeited);
```

### 6. New Errors
```solidity
error AlreadySkipped();           // User has already chosen to skip
error AlreadyClaimed();           // User has already claimed
error CannotSkipAfterClaim();     // Cannot skip if already claimed before
```

### 7. Storage Gap Update
Adjusted from 48 to 47 slots to accommodate the new `hasSkippedClaim` mapping.

---

## How It Works

### User Journey - Two Paths

#### Path A: Claimer (Normal Flow)
```
1. Admin records points for user
2. User calls claimSurfPoints()
   - hasSkippedClaim[user] = false (default)
   - Creates claim request with vesting
3. User can claim again in the future when admin adds more points
4. User can NEVER skip
```

#### Path B: Skipper (Forfeit Flow)
```
1. Admin records points for user
2. User calls skipClaimRewards()
   - hasSkippedClaim[user] = true (permanent)
   - Points reset to 0 (forfeited)
3. User can NEVER claim in the future
4. Even if admin adds more points, user cannot claim them
```

---

## Business Logic

### Mutual Exclusivity

The feature enforces a permanent choice:

| User Action | hasSkippedClaim | userClaimCount | Can Claim? | Can Skip? |
|-------------|-----------------|----------------|------------|-----------|
| New user | false | 0 | ✅ Yes | ✅ Yes |
| After claiming once | false | 1+ | ✅ Yes | ❌ No (CannotSkipAfterClaim) |
| After skipping once | true | 0 | ❌ No (AlreadySkipped) | ❌ No (AlreadySkipped) |

### Why This Design?

1. **Simplicity**: Clear, permanent choice
2. **Security**: Prevents gaming the system by switching strategies
3. **Transparency**: User's choice is on-chain and verifiable
4. **Predictability**: Admin knows which users will claim vs skip

---

## Function Details

### `skipClaimRewards()`

**Access**: Any user
**Modifiers**: `whenNotPaused`, `nonReentrant`

**Checks**:
1. User hasn't claimed before (`userClaimCount[msg.sender] == 0`)
2. User hasn't skipped before (`!hasSkippedClaim[msg.sender]`)
3. User has points to skip (`userSurfPoints[msg.sender] > 0`)

**Effects**:
1. Sets `hasSkippedClaim[msg.sender] = true`
2. Resets `userSurfPoints[msg.sender] = 0`
3. Emits `ClaimSkipped(user, pointsForfeited)`

**Reverts**:
- `CannotSkipAfterClaim()`: If user has claimed before
- `AlreadySkipped()`: If user has skipped before
- `NoPointsToClaim()`: If user has no points

**Example**:
```solidity
// User has 1000 points
skipClaimRewards();
// Result: 0 points, hasSkippedClaim = true, points forfeited forever
```

---

## Use Cases

### When Would Users Skip?

1. **Don't want to wait**: User doesn't want to deal with vesting period
2. **Tax reasons**: Claiming might have tax implications
3. **Simplicity**: User just wants to opt out of the rewards system
4. **Privacy**: User doesn't want on-chain claim/withdraw activity
5. **Ineligibility**: User realizes they shouldn't receive rewards (regulatory, etc.)

### When Would Protocol Want This?

1. **Compliance**: Some users may need to forfeit rewards (regulatory)
2. **Opt-out mechanism**: Gives users choice to not participate
3. **Reduces liabilities**: Less tokens to distribute if users skip
4. **Transparency**: Clear record of who forfeited rewards

---

## Interaction Script Examples

### Check Skip Status
```javascript
const hasSkipped = await contract.hasSkippedClaim(userAddress);
console.log("User has skipped:", hasSkipped);
```

### Skip Claim Flow
```javascript
// Check if user can skip
const claimCount = await contract.userClaimCount(userAddress);
if (claimCount > 0) {
  console.log("Cannot skip - user has already claimed");
  return;
}

// Skip rewards
const points = await contract.getUserPoints(userAddress);
console.log("Forfeiting", points, "points");

await contract.skipClaimRewards();
console.log("Rewards forfeited!");
```

### Claim Flow with Skip Check
```javascript
// Check if user has skipped
const hasSkipped = await contract.hasSkippedClaim(userAddress);
if (hasSkipped) {
  console.log("Cannot claim - user has chosen to skip");
  return;
}

// Claim rewards
await contract.claimSurfPoints();
```

---

## Security Considerations

### Access Control
- ✅ Any user can skip their own rewards
- ✅ Only owner/admin can record points
- ✅ Users cannot skip other users' rewards

### Checks-Effects-Interactions
- ✅ All checks done before state changes
- ✅ State updated before emitting events
- ✅ No external calls after state changes

### Reentrancy Protection
- ✅ `nonReentrant` modifier applied
- ✅ No external token transfers in skip function

### Irreversibility
- ⚠️ **Skip is PERMANENT** - no undo function
- ⚠️ Users should be warned before skipping
- ⚠️ Frontend should have confirmation dialog

---

## Frontend Integration

### User Interface Recommendations

1. **Two Clear Buttons**:
   - "Claim Rewards" (starts vesting)
   - "Skip Rewards" (forfeit permanently)

2. **Warning Modal for Skip**:
```
⚠️ WARNING: Are you sure?

You are about to permanently forfeit 1,000 SURF points.

If you skip:
- Your points will be set to 0
- You can NEVER claim rewards in the future
- Even if you receive more points, you cannot claim them
- This action CANNOT be undone

[Cancel] [I Understand, Skip Rewards]
```

3. **Status Display**:
```javascript
if (hasSkipped) {
  return <Badge>Rewards Disabled</Badge>;
} else if (claimCount > 0) {
  return <Badge>Active Claimer</Badge>;
} else {
  return <Badge>Choose: Claim or Skip</Badge>;
}
```

---

## Testing Checklist

### Basic Functionality
- [ ] New user with points can skip
- [ ] Skipping resets points to 0
- [ ] hasSkippedClaim is set to true after skip
- [ ] Event is emitted with correct values

### Claim Prevention
- [ ] User who skipped cannot claim
- [ ] Correct error is thrown (AlreadySkipped)

### Skip Prevention
- [ ] User who claimed cannot skip
- [ ] Correct error is thrown (CannotSkipAfterClaim)
- [ ] User who skipped cannot skip again
- [ ] User with 0 points cannot skip

### Edge Cases
- [ ] Skip with maximum points value
- [ ] Multiple users skipping independently
- [ ] Admin adds points after user skipped (user still cannot claim)

---

## Gas Costs

Approximate gas costs:

| Operation | Gas Cost (estimated) |
|-----------|---------------------|
| skipClaimRewards() | ~55,000 gas |
| Check hasSkippedClaim | ~2,300 gas (view) |

---

## Comparison: Batch Withdraw vs Skip Feature

### Removed: `batchWithdrawClaims`
- **Purpose**: Withdraw multiple claims at once
- **Why removed**: Simplified contract, users can call withdrawClaim multiple times
- **Impact**: Minimal - users can still withdraw, just one at a time

### Added: `skipClaimRewards`
- **Purpose**: Forfeit rewards permanently
- **Why added**: Gives users opt-out mechanism, useful for compliance
- **Impact**: Major - enables new use cases and user choices

---

## Migration Notes

If upgrading from previous version:

1. The `batchWithdrawClaims` function no longer exists
2. Update frontend to remove batch withdraw button
3. Add skip button/flow to frontend
4. Update user documentation about skip feature
5. Consider adding warnings about permanence of skip
6. Test that existing claimers cannot skip
7. Storage layout preserved with updated gap

---

## Complete Function Signatures

### New Function
```solidity
function skipClaimRewards()
    external
    whenNotPaused
    nonReentrant
```

**Reverts**:
- `CannotSkipAfterClaim()` - if user has claimed before
- `AlreadySkipped()` - if user has skipped before
- `NoPointsToClaim()` - if user has no points

**Emits**:
- `ClaimSkipped(address indexed user, uint256 pointsForfeited)`

---

## Example Scenarios

### Scenario 1: Normal Claimer
```
Day 0: Admin records 1000 points for Alice
Day 1: Alice claims (hasSkippedClaim = false, claimCount = 1)
Day 5: Admin records 500 more points for Alice
Day 6: Alice tries to skip → ERROR: CannotSkipAfterClaim
Day 7: Alice claims again (allowed, hasSkippedClaim = false)
```

### Scenario 2: Skipper
```
Day 0: Admin records 1000 points for Bob
Day 1: Bob skips (hasSkippedClaim = true, points = 0)
Day 5: Admin records 500 more points for Bob
Day 6: Bob tries to claim → ERROR: AlreadySkipped
Day 7: Bob tries to skip again → ERROR: AlreadySkipped
```

### Scenario 3: First Timer Choice
```
Day 0: Admin records 1000 points for Carol
Day 1: Carol has choice:
  Option A: Claim (starts vesting, can claim future rewards)
  Option B: Skip (forfeit forever, cannot claim future rewards)
```

---

## Conclusion

The skip feature provides users with a permanent opt-out mechanism while maintaining the integrity of the reward system. It's a simple, secure, and transparent way for users to forfeit their rewards if needed.

**Key Takeaways**:
- ✅ Users have two paths: claim or skip
- ✅ Choice is permanent and mutually exclusive
- ✅ Simple implementation with clear business logic
- ✅ Secure with proper access control and checks
- ⚠️ Users must be warned about permanence
