# SurfPoints Contract

A UUPS upgradeable smart contract for managing surf points with a 14-day vesting period for token claims.

## Features

### Core Functionality
- **UUPS Upgradeable**: Only owner can upgrade the contract
- **Admin System**: Multiple admins can record points for users
- **Points Recording**: Admin records surf points for user addresses
- **14-Day Vesting**: Claims have a 14-day lock period before withdrawal
- **Multiple Claims**: Users can claim multiple times as admin adds new points
- **Batch Operations**: Support for batch recording and batch withdrawals
- **Security**: ReentrancyGuard, Pausable, SafeERC20, custom errors

### Storage Gap
- 49 storage slots reserved for future upgrades

## How It Works

### 1. Admin Records Points
```solidity
// Admin adds points for a user
recordSurfPoints(userAddress, 1000);

// Or batch record for multiple users
batchRecordSurfPoints([user1, user2], [1000, 2000]);
```

Points accumulate if the same user receives multiple records:
- First record: User has 1000 points
- Second record: User now has 1500 points (1000 + 500)

### 2. User Claims Points
```solidity
// User initiates a claim (starts 14-day vesting)
claimSurfPoints();
```

When a user claims:
- Their points balance is reset to 0
- A claim request is created with the current timestamp
- Tokens are locked for 14 days
- User gets a claim ID (0, 1, 2, etc.)

### 3. User Withdraws After 14 Days
```solidity
// After 14 days, user withdraws tokens
withdrawClaim(claimId);

// Or batch withdraw multiple claims
batchWithdrawClaims([claimId1, claimId2]);
```

### 4. Admin Can Add More Points
Even after a user claims, admin can add more points:
```solidity
// Admin adds more points
recordSurfPoints(userAddress, 500);

// User can claim again
claimSurfPoints(); // Creates new claim with 14-day lock
```

## Flow Example

```
Day 0:
- Admin records 1000 points for Alice
- Alice has: 1000 points, 0 claims

Day 1:
- Alice calls claimSurfPoints()
- Alice has: 0 points, 1 pending claim (1000 SURF, unlocks Day 15)

Day 5:
- Admin adds 500 more points for Alice
- Alice has: 500 points, 1 pending claim

Day 7:
- Alice calls claimSurfPoints() again
- Alice has: 0 points, 2 pending claims
  - Claim 0: 1000 SURF (unlocks Day 15)
  - Claim 1: 500 SURF (unlocks Day 21)

Day 15:
- Alice calls withdrawClaim(0)
- Alice receives 1000 SURF tokens
- Alice has: 0 points, 1 pending claim (500 SURF, unlocks Day 21)

Day 21:
- Alice calls withdrawClaim(1)
- Alice receives 500 SURF tokens
- Alice has: 0 points, 0 pending claims
```

## Contract Functions

### Admin Functions
| Function | Description |
|----------|-------------|
| `recordSurfPoints(user, points)` | Record points for a single user |
| `batchRecordSurfPoints(users[], points[])` | Record points for multiple users |

### User Functions
| Function | Description |
|----------|-------------|
| `claimSurfPoints()` | Claim accumulated points (starts 14-day vesting) |
| `withdrawClaim(claimId)` | Withdraw tokens after lock period |
| `batchWithdrawClaims(claimIds[])` | Withdraw multiple claims at once |

### Owner Functions
| Function | Description |
|----------|-------------|
| `depositSurfToken(amount)` | Deposit SURF tokens to contract |
| `withdrawSurfToken(amount)` | Withdraw SURF tokens from contract |
| `addAdmin(address)` | Add new admin |
| `removeAdmin(address)` | Remove admin |
| `pause()` / `unpause()` | Emergency controls |
| `emergencyWithdrawToken(token, amount)` | Emergency token withdrawal |
| `emergencyWithdrawNative()` | Emergency ETH withdrawal |

### View Functions
| Function | Description |
|----------|-------------|
| `getUserPoints(user)` | Get unclaimed points balance |
| `getUserInfo(user)` | Get points and claim count |
| `getClaimInfo(user, claimId)` | Get detailed claim information |
| `getPendingClaims(user)` | Get all pending (not withdrawn) claims |
| `getWithdrawableClaims(user)` | Get claims ready to withdraw now |
| `getContractBalance()` | Get SURF token balance in contract |
| `getContractStats()` | Get contract statistics |

## Security Features

1. **ReentrancyGuard**: Prevents reentrancy attacks on state-changing functions
2. **Pausable**: Owner can pause contract in emergencies
3. **SafeERC20**: Safe token transfers
4. **Checks-Effects-Interactions**: State updated before external calls
5. **Custom Errors**: Gas-efficient error handling
6. **Access Control**: Owner and admin role separation
7. **Balance Checks**: Validates contract has sufficient tokens before creating claims

## Error Messages

| Error | Description |
|-------|-------------|
| `OnlyAdmin` | Caller is not an admin or owner |
| `ZeroAddress` | Address parameter is zero address |
| `ZeroAmount` | Amount parameter is zero |
| `NoPointsToClaim` | User has no points to claim |
| `InsufficientContractBalance` | Contract doesn't have enough tokens |
| `InvalidClaimId` | Claim ID doesn't exist |
| `ClaimStillLocked` | 14-day lock period not passed yet |
| `ClaimAlreadyWithdrawn` | Claim has already been withdrawn |

## Events

```solidity
event SurfPointsRecorded(address indexed user, uint256 points, uint256 newBalance);
event ClaimRequested(address indexed user, uint256 indexed claimId, uint256 amount, uint256 unlockTime);
event ClaimWithdrawn(address indexed user, uint256 indexed claimId, uint256 amount);
event SurfTokenDeposited(address indexed depositor, uint256 amount);
```

## Deployment

See `deploySurfPoints.js` for deployment script.

## Interaction

See `surfPointsInteraction.js` for examples of:
- Owner setup (adding admin, depositing tokens)
- Admin recording points
- User claiming points
- User withdrawing after vesting period
- Querying contract state

## Version

Current version: 1.0.0
