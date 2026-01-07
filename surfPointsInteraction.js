// surfPointsInteraction.js
const { ethers } = require("ethers");

/**
 * Interaction script for SurfPoints contract with 14-day vesting
 */

// CONFIGURATION
const SURF_POINTS_CONTRACT_ADDRESS = "0xYourSurfPointsContractAddressHere";
const SURF_TOKEN_ADDRESS = "0xYourSurfTokenAddressHere";

const OWNER_PRIVATE_KEY = "0xYourOwnerPrivateKeyHere";
const ADMIN_PRIVATE_KEY = "0xYourAdminPrivateKeyHere";
const USER_PRIVATE_KEY = "0xYourUserPrivateKeyHere";

// Connect to provider
const provider = new ethers.JsonRpcProvider("https://endpoints.omniatech.io/v1/eth/holesky/public");

// Create wallets
const ownerWallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
const adminWallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);
const userWallet = new ethers.Wallet(USER_PRIVATE_KEY, provider);

// SurfPoints ABI (Complete)
const SURF_POINTS_ABI = [
  // Admin Management
  "function addAdmin(address _admin) external",
  "function removeAdmin(address _admin) external",
  "function isAdmin(address account) external view returns (bool)",
  "function updateClaimLockPeriod(uint256 _newLockPeriod) external",

  // Points Management
  "function recordSurfPoints(address _user, uint256 _points) external",
  "function batchRecordSurfPoints(address[] calldata _users, uint256[] calldata _points) external",

  // Claim & Withdraw
  "function claimSurfPoints() external",
  "function withdrawClaim(uint256 _claimId) external",
  "function skipClaimRewards() external",

  // Token Management
  "function depositSurfToken(uint256 _amount) external",
  "function withdrawSurfToken(uint256 _amount) external",
  "function updateSurfTokenAddress(address _newSurfToken) external",

  // Emergency Functions
  "function emergencyWithdrawToken(address _token, uint256 _amount) external",
  "function emergencyWithdrawNative() external",

  // Pause Functions
  "function pause() external",
  "function unpause() external",

  // View Functions
  "function getUserPoints(address _user) external view returns (uint256)",
  "function getUserInfo(address _user) external view returns (uint256 points, uint256 claimCount)",
  "function getClaimInfo(address _user, uint256 _claimId) external view returns (uint256 amount, uint256 claimTime, uint256 unlockTime, bool withdrawn, bool canWithdraw)",
  "function getPendingClaims(address _user) external view returns (uint256[] memory claimIds, uint256[] memory amounts, uint256[] memory unlockTimes, bool[] memory canWithdraw)",
  "function getWithdrawableClaims(address _user) external view returns (uint256[] memory)",
  "function getContractBalance() external view returns (uint256)",
  "function getContractStats() external view returns (uint256 totalDistributed, uint256 totalClaimed, uint256 contractBalance)",
  "function getAllUsersClaimStatus() external view returns (address[] memory claimedUsers, uint256[] memory claimedAmounts, address[] memory pendingUsers, uint256[] memory pendingAmounts)",
  "function getTotalUsersCount() external view returns (uint256)",

  // Contract Info
  "function version() external pure returns (string memory)",
  "function owner() external view returns (address)",
  "function surfToken() external view returns (address)",
  "function claimLockPeriod() external view returns (uint256)",

  // Public State Variables
  "function userSurfPoints(address user) external view returns (uint256)",
  "function hasSkippedClaim(address user) external view returns (bool)",
  "function userClaimCount(address user) external view returns (uint256)",
  "function userTotalClaimed(address user) external view returns (uint256)",
  "function totalPointsDistributed() external view returns (uint256)",
  "function totalTokensClaimed() external view returns (uint256)",
  "function allUsers(uint256 index) external view returns (address)",
  "function isUserTracked(address user) external view returns (bool)"
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)"
];

const contractAsOwner = new ethers.Contract(SURF_POINTS_CONTRACT_ADDRESS, SURF_POINTS_ABI, ownerWallet);
const contractAsAdmin = new ethers.Contract(SURF_POINTS_CONTRACT_ADDRESS, SURF_POINTS_ABI, adminWallet);
const contractAsUser = new ethers.Contract(SURF_POINTS_CONTRACT_ADDRESS, SURF_POINTS_ABI, userWallet);

const surfTokenAsOwner = new ethers.Contract(SURF_TOKEN_ADDRESS, ERC20_ABI, ownerWallet);

// ========== OWNER FLOW ==========

async function ownerFlow() {
  console.log("\n========== OWNER FLOW ==========\n");

  try {
    // Add admin
    console.log("1. Adding admin...");
    const tx1 = await contractAsOwner.addAdmin(adminWallet.address);
    await tx1.wait();
    console.log("   ✅ Admin added");

    // Approve and deposit SURF tokens
    console.log("\n2. Depositing SURF tokens...");
    const depositAmount = ethers.parseUnits("10000", 18);
    const approveTx = await surfTokenAsOwner.approve(SURF_POINTS_CONTRACT_ADDRESS, depositAmount);
    await approveTx.wait();

    const tx2 = await contractAsOwner.depositSurfToken(depositAmount);
    await tx2.wait();
    console.log("   ✅ Deposited:", ethers.formatUnits(depositAmount, 18), "SURF");

    console.log("\n✅ Owner flow completed!\n");
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// ========== ADMIN FLOW ==========

async function adminFlow() {
  console.log("\n========== ADMIN FLOW ==========\n");

  try {
    // Verify admin status
    const isAdminStatus = await contractAsAdmin.isAdmin(adminWallet.address);
    console.log("1. Admin status:", isAdminStatus);

    if (!isAdminStatus) {
      console.log("   ⚠️ Run owner flow first");
      return;
    }

    // Record points for user
    console.log("\n2. Recording surf points...");
    const points = 1000;
    const tx = await contractAsAdmin.recordSurfPoints(userWallet.address, points);
    await tx.wait();
    console.log("   ✅ Recorded", points, "points");

    // Check user points
    const userPoints = await contractAsAdmin.getUserPoints(userWallet.address);
    console.log("   User has:", userPoints.toString(), "points");

    console.log("\n✅ Admin flow completed!\n");
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// ========== USER FLOW - CLAIM ==========

async function userClaimFlow() {
  console.log("\n========== USER CLAIM FLOW ==========\n");

  try {
    // Check points
    console.log("1. Checking points...");
    const points = await contractAsUser.getUserPoints(userWallet.address);
    console.log("   Available points:", points.toString());

    if (points.toString() === "0") {
      console.log("   ⚠️ No points. Run admin flow first");
      return;
    }

    // Check if user has skipped before
    const hasSkipped = await contractAsUser.hasSkippedClaim(userWallet.address);
    if (hasSkipped) {
      console.log("   ⚠️ User has skip enabled. Disable skip first to claim.");
      console.log("   Call skipClaimRewards() to toggle skip off.");
      return;
    }

    // Claim points (creates vesting with configurable lock period)
    console.log("\n2. Claiming points...");
    const tx = await contractAsUser.claimSurfPoints();
    const receipt = await tx.wait();
    console.log("   ✅ Claim request created!");

    const lockPeriod = await contractAsUser.claimLockPeriod();
    console.log(`   Tokens will be available in ${Number(lockPeriod) / 86400} days`);

    // Get claim info
    const userInfo = await contractAsUser.getUserInfo(userWallet.address);
    console.log("\n3. User info:");
    console.log("   Remaining points:", userInfo.points.toString());
    console.log("   Total claims:", userInfo.claimCount.toString());

    // Get pending claims
    const pendingClaims = await contractAsUser.getPendingClaims(userWallet.address);
    console.log("\n4. Pending claims:");
    for (let i = 0; i < pendingClaims.claimIds.length; i++) {
      const unlockDate = new Date(Number(pendingClaims.unlockTimes[i]) * 1000);
      console.log(`   Claim ${pendingClaims.claimIds[i]}:`);
      console.log(`     Amount: ${pendingClaims.amounts[i]} SURF`);
      console.log(`     Unlock: ${unlockDate.toISOString()}`);
      console.log(`     Can withdraw: ${pendingClaims.canWithdraw[i]}`);
    }

    console.log("\n✅ Claim flow completed!\n");
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// ========== USER FLOW - SKIP (TOGGLE) ==========

async function userSkipFlow() {
  console.log("\n========== USER SKIP FLOW (TOGGLE) ==========\n");

  try {
    // Check current skip status
    const hasSkipped = await contractAsUser.hasSkippedClaim(userWallet.address);
    console.log("1. Current skip status:", hasSkipped ? "ENABLED" : "DISABLED");

    // Check if already claimed
    const claimCount = await contractAsUser.userClaimCount(userWallet.address);
    if (claimCount > 0) {
      console.log("   ⚠️ Cannot toggle skip - user has already claimed before");
      return;
    }

    if (!hasSkipped) {
      // Enabling skip
      const points = await contractAsUser.getUserPoints(userWallet.address);
      console.log("   Available points:", points.toString());

      if (points.toString() === "0") {
        console.log("   ⚠️ No points to skip");
        return;
      }

      console.log("\n2. Enabling skip (forfeiting points)...");
      console.log("   ⚠️ WARNING: This will forfeit", points.toString(), "points!");
      console.log("   You can toggle skip off later to claim again.");

      const tx = await contractAsUser.skipClaimRewards();
      await tx.wait();
      console.log("   ✅ Skip enabled! Points forfeited.");

      // Verify status
      const hasSkippedNow = await contractAsUser.hasSkippedClaim(userWallet.address);
      const remainingPoints = await contractAsUser.getUserPoints(userWallet.address);
      console.log("\n3. Updated status:");
      console.log("   Skip enabled:", hasSkippedNow);
      console.log("   Remaining points:", remainingPoints.toString());
    } else {
      // Disabling skip
      console.log("\n2. Disabling skip...");
      console.log("   This will allow you to claim rewards again.");

      const tx = await contractAsUser.skipClaimRewards();
      await tx.wait();
      console.log("   ✅ Skip disabled! You can now claim rewards.");

      // Verify status
      const hasSkippedNow = await contractAsUser.hasSkippedClaim(userWallet.address);
      console.log("\n3. Updated status:");
      console.log("   Skip enabled:", hasSkippedNow);
    }

    console.log("\n✅ Skip flow completed!\n");
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// ========== USER FLOW - WITHDRAW ==========

async function userWithdrawFlow() {
  console.log("\n========== USER WITHDRAW FLOW ==========\n");

  try {
    // Get withdrawable claims
    console.log("1. Checking withdrawable claims...");
    const withdrawableIds = await contractAsUser.getWithdrawableClaims(userWallet.address);

    if (withdrawableIds.length === 0) {
      console.log("   ⚠️ No claims ready to withdraw");
      console.log("   Claims must wait 14 days from claim time");

      // Show pending claims
      const pendingClaims = await contractAsUser.getPendingClaims(userWallet.address);
      if (pendingClaims.claimIds.length > 0) {
        console.log("\n   Pending claims:");
        for (let i = 0; i < pendingClaims.claimIds.length; i++) {
          const unlockDate = new Date(Number(pendingClaims.unlockTimes[i]) * 1000);
          const now = new Date();
          const timeLeft = unlockDate - now;
          const daysLeft = Math.ceil(timeLeft / (1000 * 60 * 60 * 24));

          console.log(`   Claim ${pendingClaims.claimIds[i]}: ${pendingClaims.amounts[i]} SURF`);
          console.log(`     Unlocks in: ${daysLeft} days (${unlockDate.toISOString()})`);
        }
      }
      return;
    }

    console.log("   ✅ Found", withdrawableIds.length, "withdrawable claims");

    // Withdraw claims one by one
    console.log("\n2. Withdrawing claims...");
    for (let i = 0; i < withdrawableIds.length; i++) {
      const claimId = withdrawableIds[i];
      const tx = await contractAsUser.withdrawClaim(claimId);
      await tx.wait();
      console.log(`   ✅ Claim ${claimId} withdrawn!`);
    }

    console.log("\n✅ Withdraw flow completed!\n");
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// ========== EMERGENCY FUNCTIONS ==========

async function emergencyFunctions() {
  console.log("\n========== EMERGENCY FUNCTIONS ==========\n");
  console.log("⚠️ Use these only in emergencies!\n");

  try {
    // Example: Pause contract
    // console.log("1. Pausing contract...");
    // const tx1 = await contractAsOwner.pause();
    // await tx1.wait();
    // console.log("   ✅ Contract paused");

    // Example: Unpause contract
    // console.log("\n2. Unpausing contract...");
    // const tx2 = await contractAsOwner.unpause();
    // await tx2.wait();
    // console.log("   ✅ Contract unpaused");

    // Example: Emergency withdraw SURF tokens
    // const amount = ethers.parseUnits("100", 18);
    // const tx3 = await contractAsOwner.emergencyWithdrawToken(SURF_TOKEN_ADDRESS, amount);
    // await tx3.wait();
    // console.log("   ✅ Emergency withdrawal complete");

    // Example: Emergency withdraw native ETH
    // const tx4 = await contractAsOwner.emergencyWithdrawNative();
    // await tx4.wait();
    // console.log("   ✅ Native ETH withdrawn");

    console.log("Emergency functions are commented out for safety.");
    console.log("Uncomment as needed for emergencies.\n");
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// ========== ADMIN MANAGEMENT ==========

async function adminManagement() {
  console.log("\n========== ADMIN MANAGEMENT ==========\n");

  try {
    // Example: Add another admin
    // const newAdmin = "0xNewAdminAddress";
    // const tx1 = await contractAsOwner.addAdmin(newAdmin);
    // await tx1.wait();
    // console.log("✅ Admin added:", newAdmin);

    // Example: Remove admin
    // const tx2 = await contractAsOwner.removeAdmin(adminWallet.address);
    // await tx2.wait();
    // console.log("✅ Admin removed");

    // Example: Update claim lock period
    // const newLockPeriod = 7 * 24 * 60 * 60; // 7 days in seconds
    // const tx3 = await contractAsOwner.updateClaimLockPeriod(newLockPeriod);
    // await tx3.wait();
    // console.log("✅ Claim lock period updated to:", newLockPeriod / 86400, "days");

    // Check admin status
    console.log("Admin status checks:");
    console.log("  Owner is admin:", await contractAsOwner.isAdmin(ownerWallet.address));
    console.log("  Admin wallet is admin:", await contractAsOwner.isAdmin(adminWallet.address));

    // Check current lock period
    const lockPeriod = await contractAsOwner.claimLockPeriod();
    console.log("\nClaim lock period:", Number(lockPeriod) / 86400, "days");

    console.log("\n✅ Admin management complete!\n");
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// ========== READ FUNCTIONS ==========

async function readFunctions() {
  console.log("\n========== CONTRACT INFO ==========\n");

  try {
    const version = await contractAsUser.version();
    console.log("Version:", version);

    const lockPeriod = await contractAsUser.claimLockPeriod();
    console.log("Claim Lock Period:", Number(lockPeriod) / 86400, "days");

    const owner = await contractAsUser.owner();
    console.log("Owner:", owner);

    const surfToken = await contractAsUser.surfToken();
    console.log("SURF Token:", surfToken);

    const stats = await contractAsUser.getContractStats();
    console.log("\nContract Statistics:");
    console.log("  Total Points Distributed:", stats.totalDistributed.toString());
    console.log("  Total Tokens Claimed:", stats.totalClaimed.toString());
    console.log("  Contract Balance:", ethers.formatUnits(stats.contractBalance, 18), "SURF");

    // Direct state variable access
    const totalDistributed = await contractAsUser.totalPointsDistributed();
    const totalClaimed = await contractAsUser.totalTokensClaimed();
    console.log("\nDirect State Access:");
    console.log("  Total Points Distributed:", totalDistributed.toString());
    console.log("  Total Tokens Claimed:", totalClaimed.toString());

    // Get total users count
    const totalUsers = await contractAsUser.getTotalUsersCount();
    console.log("\nUser Tracking:");
    console.log("  Total Tracked Users:", totalUsers.toString());

    console.log("\n✅ Read complete!\n");
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// ========== GET ALL USERS CLAIM STATUS ==========

async function getAllUsersClaimStatus() {
  console.log("\n========== ALL USERS CLAIM STATUS ==========\n");

  try {
    const result = await contractAsUser.getAllUsersClaimStatus();
    const { claimedUsers, claimedAmounts, pendingUsers, pendingAmounts } = result;

    console.log("📊 Users Who Have Claimed Rewards:");
    if (claimedUsers.length === 0) {
      console.log("   No users have claimed yet.");
    } else {
      for (let i = 0; i < claimedUsers.length; i++) {
        console.log(`   ${i + 1}. ${claimedUsers[i]}`);
        console.log(`      Total Claimed: ${claimedAmounts[i].toString()} SURF`);
      }
    }

    console.log("\n⏳ Users With Pending Rewards:");
    if (pendingUsers.length === 0) {
      console.log("   No users have pending rewards.");
    } else {
      for (let i = 0; i < pendingUsers.length; i++) {
        console.log(`   ${i + 1}. ${pendingUsers[i]}`);
        console.log(`      Pending Amount: ${pendingAmounts[i].toString()} SURF`);
      }
    }

    console.log("\n📈 Summary:");
    console.log(`   Total Users Who Claimed: ${claimedUsers.length}`);
    console.log(`   Total Users With Pending: ${pendingUsers.length}`);
    
    const totalClaimed = claimedAmounts.reduce((sum, amount) => sum + BigInt(amount), 0n);
    const totalPending = pendingAmounts.reduce((sum, amount) => sum + BigInt(amount), 0n);
    console.log(`   Total Claimed: ${totalClaimed.toString()} SURF`);
    console.log(`   Total Pending: ${totalPending.toString()} SURF`);

    console.log("\n✅ Status check complete!\n");
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// ========== GET USER TOTAL CLAIMED ==========

async function getUserTotalClaimed(userAddress) {
  console.log(`\n========== USER TOTAL CLAIMED: ${userAddress} ==========\n`);

  try {
    const totalClaimed = await contractAsUser.userTotalClaimed(userAddress);
    const pendingPoints = await contractAsUser.getUserPoints(userAddress);
    const claimCount = await contractAsUser.userClaimCount(userAddress);

    console.log("User Statistics:");
    console.log(`   Total Claimed (All Time): ${totalClaimed.toString()} SURF`);
    console.log(`   Pending Points: ${pendingPoints.toString()} SURF`);
    console.log(`   Total Claims Made: ${claimCount.toString()}`);

    if (claimCount > 0) {
      const pendingClaims = await contractAsUser.getPendingClaims(userAddress);
      console.log(`\n   Pending Claims: ${pendingClaims.claimIds.length}`);
      for (let i = 0; i < pendingClaims.claimIds.length; i++) {
        const unlockDate = new Date(Number(pendingClaims.unlockTimes[i]) * 1000);
        console.log(`     Claim ${pendingClaims.claimIds[i]}: ${pendingClaims.amounts[i]} SURF`);
        console.log(`       Unlocks: ${unlockDate.toISOString()}`);
        console.log(`       Can Withdraw: ${pendingClaims.canWithdraw[i]}`);
      }
    }

    console.log("\n✅ User info retrieved!\n");
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// ========== MAIN ==========

async function main() {
  console.log("========================================");
  console.log("  SurfPoints with 14-Day Vesting");
  console.log("========================================");

  if (SURF_POINTS_CONTRACT_ADDRESS === "0xYourSurfPointsContractAddressHere") {
    console.error("\n❌ Please set SURF_POINTS_CONTRACT_ADDRESS");
    return;
  }

  console.log("\nWallets:");
  console.log("  Owner:", ownerWallet.address);
  console.log("  Admin:", adminWallet.address);
  console.log("  User:", userWallet.address);

  // ============ FLOW SELECTION ============
  // Uncomment the flows you want to run:

  // 1. INITIAL SETUP (Run once after deployment)
  // await ownerFlow();           // Owner deposits tokens and adds admin
  // await adminManagement();     // Manage admin roles

  // 2. POINTS DISTRIBUTION (Admin operation)
  // await adminFlow();           // Admin records points for users

  // 3A. USER CLAIM (User operation - choose claim OR skip)
  // await userClaimFlow();       // User initiates claim (starts vesting)

  // 3B. USER SKIP (User operation - toggle skip on/off)
  // await userSkipFlow();        // User toggles skip feature (can enable/disable)

  // 4. USER WITHDRAW (User operation - after lock period)
  await userWithdrawFlow();    // User withdraws tokens after lock period

  // 5. EMERGENCY OPERATIONS (Owner only)
  // await emergencyFunctions();  // Pause/unpause, emergency withdrawals

  // 6. VIEW CONTRACT STATE (Anyone)
  await readFunctions();       // Read contract information

  // 7. VIEW ALL USERS STATUS (Anyone)
  // await getAllUsersClaimStatus();  // Get all users' claim status

  // 8. VIEW SPECIFIC USER TOTAL CLAIMED (Anyone)
  // await getUserTotalClaimed(userWallet.address);  // Get specific user's total claimed

  console.log("========================================\n");
}

main().catch(console.error);
