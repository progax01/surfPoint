# SurfPoints Contract - Comprehensive Functionality Report

**Contract:** SurfPoints.sol
**Version:** 1.1.0
**Network:** Base / Base Sepolia

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Role System](#role-system)
4. [Core Workflows](#core-workflows)
5. [Function Reference](#function-reference)
6. [Events](#events)
7. [Error Codes](#error-codes)
8. [State Variables](#state-variables)
9. [Integration Guide](#integration-guide)

---

## Overview

SurfPoints is a UUPS upgradeable smart contract that manages a points-based reward system. The system allows:

- **Admins** to record surf points for users
- **Users** to claim their points and convert them to SURF tokens
- **Treasury (Owner)** to manage the contract and token reserves

### Key Features

- **Upgradeable:** UUPS proxy pattern for future improvements
- **Pausable:** Emergency stop mechanism
- **Time-locked Claims:** 14-day default lock period for claimed tokens
- **Batch Operations:** Efficient bulk point recording and withdrawals
- **Multi-claim Support:** Users can have multiple active claims

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         SurfPoints                               │
├─────────────────────────────────────────────────────────────────┤
│  Inherits:                                                       │
│  ├── UUPSUpgradeable (Proxy pattern)                            │
│  ├── OwnableUpgradeable (Owner access control)                  │
│  ├── PausableUpgradeable (Emergency stop)                       │
│  └── ReentrancyGuardUpgradeable (Reentrancy protection)         │
├─────────────────────────────────────────────────────────────────┤
│  External Dependencies:                                          │
│  ├── IERC20 (SURF token interface)                              │
│  └── SafeERC20 (Safe token transfers)                           │
└─────────────────────────────────────────────────────────────────┘
```

### Storage Layout

```
Slot 0-N:   OpenZeppelin upgradeable contract storage
Slot N+1:   surfToken (IERC20)
Slot N+2:   claimLockPeriod (uint256)
Slot N+3:   isAdmin mapping
Slot N+4:   userSurfPoints mapping
Slot N+5:   claimRequests mapping
Slot N+6:   userClaimCount mapping
Slot N+7:   totalPointsDistributed
Slot N+8:   totalTokensClaimed
Slot N+9-56: __gap (48 slots reserved for upgrades)
```

---

## Role System

### Owner (Treasury Admin)

The owner has full control over the contract and is responsible for:

| Capability | Function |
|------------|----------|
| Add/remove admins | `addAdmin()`, `removeAdmin()` |
| Deposit SURF tokens | `depositSurfToken()` |
| Withdraw SURF tokens | `withdrawSurfToken()` |
| Change lock period | `updateClaimLockPeriod()` |
| Update token address | `updateSurfTokenAddress()` |
| Pause/unpause | `pause()`, `unpause()` |
| Emergency withdrawals | `emergencyWithdrawToken()`, `emergencyWithdrawNative()` |
| Upgrade contract | Via UUPS proxy |
| Record points | Inherits admin privileges |

### Admin (List Provider)

Admins manage the point distribution system:

| Capability | Function |
|------------|----------|
| Record points for users | `recordSurfPoints()` |
| Batch record points | `batchRecordSurfPoints()` |

**Note:** Owner automatically has admin privileges via the `onlyAdmin` modifier.

### User

Regular users can interact with their points:

| Capability | Function |
|------------|----------|
| View points balance | `getUserPoints()`, `getUserInfo()` |
| Initiate claim | `claimSurfPoints()` |
| Withdraw after lock | `withdrawClaim()`, `batchWithdrawClaims()` |
| View claim status | `getClaimInfo()`, `getPendingClaims()`, `getWithdrawableClaims()` |

---

## Core Workflows

### Workflow 1: Point Distribution

```
┌─────────┐     recordSurfPoints()      ┌──────────────┐
│  Admin  │ ─────────────────────────▶  │ User Points  │
└─────────┘                             │   Balance    │
     │                                  └──────────────┘
     │      batchRecordSurfPoints()            │
     └─────────────────────────────────────────┘
           (Multiple users at once)
```

**Process:**
1. Admin calls `recordSurfPoints(user, points)` or `batchRecordSurfPoints(users[], points[])`
2. Points are added to user's `userSurfPoints` balance (accumulates)
3. `totalPointsDistributed` is incremented
4. `SurfPointsRecorded` event emitted

### Workflow 2: Claiming Points

```
┌──────┐  claimSurfPoints()   ┌─────────────┐  wait 14 days  ┌──────────────┐
│ User │ ──────────────────▶  │ ClaimRequest │ ────────────▶  │ withdrawClaim │
└──────┘                      │  (locked)    │               │   (tokens)    │
                              └─────────────┘               └──────────────┘
```

**Process:**
1. User calls `claimSurfPoints()`
2. Contract checks:
   - User has points > 0
   - Contract has sufficient SURF token balance
3. Creates `ClaimRequest` with:
   - `amount`: user's total points
   - `claimTime`: current timestamp
   - `withdrawn`: false
4. User's points balance reset to 0
5. `ClaimRequested` event emitted with unlock time

### Workflow 3: Withdrawing Tokens

```
┌──────┐  withdrawClaim(id)   ┌────────────────┐
│ User │ ──────────────────▶  │ SURF Tokens    │
└──────┘                      │ transferred    │
                              └────────────────┘
```

**Process:**
1. User calls `withdrawClaim(claimId)` after lock period
2. Contract checks:
   - Valid claim ID
   - Not already withdrawn
   - Lock period expired
3. Marks claim as `withdrawn = true`
4. Transfers SURF tokens to user (1:1 ratio)
5. `ClaimWithdrawn` event emitted

### Workflow 4: Treasury Management

```
┌─────────┐  depositSurfToken()   ┌──────────────┐
│  Owner  │ ───────────────────▶  │   Contract   │
└─────────┘                       │   Balance    │
     │                            └──────────────┘
     │      withdrawSurfToken()          │
     └───────────────────────────────────┘
```

---

## Function Reference

### Initialization

#### `initialize(address _surfToken)`

Initializes the upgradeable contract. Can only be called once.

| Parameter | Type | Description |
|-----------|------|-------------|
| `_surfToken` | address | SURF token contract address |

**Effects:**
- Sets owner to `msg.sender`
- Sets `claimLockPeriod` to 14 days
- Adds deployer as admin

---

### Admin Management

#### `addAdmin(address _admin)`

Grants admin privileges to an address.

| Access | Owner only |
|--------|------------|
| Parameter | `_admin` - Address to grant privileges |
| Event | `AdminAdded(address indexed admin)` |
| Reverts | `ZeroAddress()`, `AlreadyAdmin()` |

#### `removeAdmin(address _admin)`

Revokes admin privileges from an address.

| Access | Owner only |
|--------|------------|
| Parameter | `_admin` - Address to revoke privileges |
| Event | `AdminRemoved(address indexed admin)` |
| Reverts | `NotAdmin()` |

---

### Points Management

#### `recordSurfPoints(address _user, uint256 _points)`

Records surf points for a single user.

| Access | Admin only |
|--------|------------|
| Pausable | Yes |
| Parameters | `_user` - Recipient, `_points` - Amount to add |
| Event | `SurfPointsRecorded(user, points, newBalance)` |
| Reverts | `ZeroAddress()`, `ZeroAmount()` |

#### `batchRecordSurfPoints(address[] _users, uint256[] _points)`

Records surf points for multiple users in one transaction.

| Access | Admin only |
|--------|------------|
| Pausable | Yes |
| Parameters | Arrays of users and corresponding points |
| Events | Multiple `SurfPointsRecorded` events |
| Reverts | `"Array length mismatch"`, `ZeroAddress()`, `ZeroAmount()` |

---

### Claiming

#### `claimSurfPoints()`

Initiates a claim for all accumulated points. Creates a locked claim request.

| Access | Any user with points |
|--------|---------------------|
| Pausable | Yes |
| Reentrancy | Protected |
| Event | `ClaimRequested(user, claimId, amount, unlockTime)` |
| Reverts | `NoPointsToClaim()`, `InsufficientContractBalance()` |

**Behavior:**
- Checks contract has enough SURF tokens
- Creates claim locked for `claimLockPeriod`
- Resets user's points to 0
- User can claim again after receiving more points

#### `withdrawClaim(uint256 _claimId)`

Withdraws tokens from a single unlocked claim.

| Access | Claim owner only |
|--------|-----------------|
| Pausable | Yes |
| Reentrancy | Protected |
| Parameter | `_claimId` - ID of the claim to withdraw |
| Event | `ClaimWithdrawn(user, claimId, amount)` |
| Reverts | `InvalidClaimId()`, `ClaimAlreadyWithdrawn()`, `ClaimStillLocked()` |

#### `batchWithdrawClaims(uint256[] _claimIds)`

Withdraws tokens from multiple unlocked claims. Silently skips invalid/locked claims.

| Access | Claim owner only |
|--------|-----------------|
| Pausable | Yes |
| Reentrancy | Protected |
| Parameter | `_claimIds` - Array of claim IDs |
| Events | Multiple `ClaimWithdrawn` events |

**Behavior:**
- Skips invalid claim IDs
- Skips already withdrawn claims
- Skips still-locked claims
- No reverts for skipped claims

---

### Token Management

#### `depositSurfToken(uint256 _amount)`

Deposits SURF tokens into the contract for user claims.

| Access | Owner only |
|--------|------------|
| Reentrancy | Protected |
| Parameter | `_amount` - Amount to deposit |
| Event | `SurfTokenDeposited(depositor, amount)` |
| Reverts | `ZeroAmount()` |

**Requires:** Owner must have approved the contract for the amount.

#### `withdrawSurfToken(uint256 _amount)`

Withdraws SURF tokens from the contract.

| Access | Owner only |
|--------|------------|
| Reentrancy | Protected |
| Parameter | `_amount` - Amount to withdraw |
| Event | `SurfTokenWithdrawn(recipient, amount)` |
| Reverts | `ZeroAmount()` |

#### `updateSurfTokenAddress(address _newSurfToken)`

Updates the SURF token contract address.

| Access | Owner only |
|--------|------------|
| Parameter | `_newSurfToken` - New token address |
| Event | `SurfTokenAddressUpdated(oldAddress, newAddress)` |
| Reverts | `ZeroAddress()` |

**Warning:** Use with caution. Existing claims reference the old token.

---

### Configuration

#### `updateClaimLockPeriod(uint256 _newLockPeriod)`

Updates the lock period for new claims.

| Access | Owner only |
|--------|------------|
| Parameter | `_newLockPeriod` - New period in seconds |
| Constraints | Min: 1 day, Max: 365 days |
| Event | `ClaimLockPeriodUpdated(oldPeriod, newPeriod)` |
| Reverts | `InvalidLockPeriod()` |

**Note:** Only affects new claims. Existing claims retain their original unlock time.

---

### Emergency Functions

#### `emergencyWithdrawToken(address _token, uint256 _amount)`

Emergency withdrawal of any ERC20 token.

| Access | Owner only |
|--------|------------|
| Reentrancy | Protected |
| Parameters | `_token` - Token address, `_amount` - Amount |
| Event | `EmergencyWithdraw(token, recipient, amount)` |

#### `emergencyWithdrawNative()`

Emergency withdrawal of all native ETH.

| Access | Owner only |
|--------|------------|
| Reentrancy | Protected |
| Event | `EmergencyWithdraw(address(0), recipient, amount)` |

---

### Pause Functions

#### `pause()`

Pauses the contract. Blocks all pausable functions.

| Access | Owner only |

#### `unpause()`

Unpauses the contract. Resumes normal operations.

| Access | Owner only |

---

### View Functions

#### `getUserPoints(address _user) → uint256`

Returns unclaimed points balance for a user.

#### `getUserInfo(address _user) → (uint256 points, uint256 claimCount)`

Returns user's points balance and total number of claims made.

#### `getClaimInfo(address _user, uint256 _claimId) → (...)`

Returns detailed information about a specific claim.

| Return | Type | Description |
|--------|------|-------------|
| `amount` | uint256 | Tokens in the claim |
| `claimTime` | uint256 | When claim was initiated |
| `unlockTime` | uint256 | When tokens can be withdrawn |
| `withdrawn` | bool | Already withdrawn? |
| `canWithdraw` | bool | Can withdraw now? |

#### `getPendingClaims(address _user) → (...)`

Returns all non-withdrawn claims for a user.

| Return | Type | Description |
|--------|------|-------------|
| `claimIds` | uint256[] | Array of claim IDs |
| `amounts` | uint256[] | Array of amounts |
| `unlockTimes` | uint256[] | Array of unlock times |
| `canWithdraw` | bool[] | Array of withdrawal eligibility |

#### `getWithdrawableClaims(address _user) → uint256[]`

Returns array of claim IDs that can be withdrawn now.

#### `getContractBalance() → uint256`

Returns current SURF token balance held by the contract.

#### `getContractStats() → (...)`

Returns global contract statistics.

| Return | Type | Description |
|--------|------|-------------|
| `totalDistributed` | uint256 | Total points ever distributed |
| `totalClaimed` | uint256 | Total tokens ever claimed |
| `contractBalance` | uint256 | Current SURF balance |

#### `version() → string`

Returns contract version string ("1.0.0").

---

## Events

| Event | Parameters | Description |
|-------|------------|-------------|
| `AdminAdded` | `admin` | New admin granted |
| `AdminRemoved` | `admin` | Admin revoked |
| `SurfPointsRecorded` | `user`, `points`, `newBalance` | Points added to user |
| `ClaimRequested` | `user`, `claimId`, `amount`, `unlockTime` | Claim initiated |
| `ClaimWithdrawn` | `user`, `claimId`, `amount` | Tokens withdrawn |
| `ClaimLockPeriodUpdated` | `oldPeriod`, `newPeriod` | Lock period changed |
| `SurfTokenDeposited` | `depositor`, `amount` | Tokens deposited |
| `SurfTokenWithdrawn` | `recipient`, `amount` | Tokens withdrawn by owner |
| `SurfTokenAddressUpdated` | `oldAddress`, `newAddress` | Token address changed |
| `EmergencyWithdraw` | `token`, `recipient`, `amount` | Emergency withdrawal |

---

## Error Codes

| Error | Condition |
|-------|-----------|
| `OnlyAdmin()` | Caller is not admin or owner |
| `ZeroAddress()` | Address parameter is zero |
| `ZeroAmount()` | Amount parameter is zero |
| `AlreadyAdmin()` | Address is already an admin |
| `NotAdmin()` | Address is not an admin |
| `NoPointsToClaim()` | User has no points to claim |
| `InsufficientContractBalance()` | Contract lacks tokens for claim |
| `InvalidClaimId()` | Claim ID doesn't exist |
| `ClaimStillLocked()` | Lock period not expired |
| `ClaimAlreadyWithdrawn()` | Claim already withdrawn |
| `InvalidLockPeriod()` | Lock period outside 1-365 days |

---

## State Variables

| Variable | Type | Visibility | Description |
|----------|------|------------|-------------|
| `surfToken` | IERC20 | public | SURF token contract |
| `claimLockPeriod` | uint256 | public | Lock duration (default: 14 days) |
| `isAdmin` | mapping(address => bool) | public | Admin status |
| `userSurfPoints` | mapping(address => uint256) | public | User point balances |
| `claimRequests` | mapping(address => mapping(uint256 => ClaimRequest)) | public | User claims |
| `userClaimCount` | mapping(address => uint256) | public | Claim counters |
| `totalPointsDistributed` | uint256 | public | Global points counter |
| `totalTokensClaimed` | uint256 | public | Global claim counter |

---

## Integration Guide

### For Frontend/dApp

```javascript
// Check user's claimable points
const points = await surfPoints.getUserPoints(userAddress);

// Get all pending claims
const { claimIds, amounts, unlockTimes, canWithdraw } =
    await surfPoints.getPendingClaims(userAddress);

// Initiate a claim (if user has points)
if (points > 0) {
    await surfPoints.claimSurfPoints();
}

// Withdraw all eligible claims
const withdrawable = await surfPoints.getWithdrawableClaims(userAddress);
if (withdrawable.length > 0) {
    await surfPoints.batchWithdrawClaims(withdrawable);
}
```

### For Admin Scripts

```javascript
// Record points for single user
await surfPoints.recordSurfPoints(userAddress, points);

// Batch record for multiple users
await surfPoints.batchRecordSurfPoints(
    [user1, user2, user3],
    [points1, points2, points3]
);
```

### For Treasury Management

```javascript
// Approve and deposit tokens
await surfToken.approve(surfPointsAddress, amount);
await surfPoints.depositSurfToken(amount);

// Check contract health
const { totalDistributed, totalClaimed, contractBalance } =
    await surfPoints.getContractStats();

// Ensure sufficient balance for pending claims
const pendingLiability = totalDistributed - totalClaimed;
if (contractBalance < pendingLiability) {
    console.warn("Insufficient balance for all claims!");
}
```

---

## Deployment Checklist

1. [ ] Deploy SURF token (or have address)
2. [ ] Deploy SurfPoints proxy with `initialize(surfTokenAddress)`
3. [ ] Add additional admins via `addAdmin()`
4. [ ] Deposit initial SURF tokens via `depositSurfToken()`
5. [ ] Verify contract on Basescan
6. [ ] Test claim flow on testnet

---

## Upgrade Path

The contract uses UUPS proxy pattern. To upgrade:

1. Deploy new implementation contract
2. Call `upgradeToAndCall(newImplementation, data)` from owner
3. Storage is preserved via proxy
4. Use `__gap` slots for new state variables

**Important:** Never change the order of existing state variables.
