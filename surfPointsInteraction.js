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
  "function batchWithdrawClaims(uint256[] calldata _claimIds) external",

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

  // Contract Info
  "function version() external pure returns (string memory)",
  "function owner() external view returns (address)",
  "function surfToken() external view returns (address)",
  "function claimLockPeriod() external view returns (uint256)",

  // Public State Variables
  "function userSurfPoints(address user) external view returns (uint256)",
  "function userClaimCount(address user) external view returns (uint256)",
  "function totalPointsDistributed() external view returns (uint256)",
  "function totalTokensClaimed() external view returns (uint256)"
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

    // Claim points (creates 14-day vesting)
    console.log("\n2. Claiming points...");
    const tx = await contractAsUser.claimSurfPoints();
    const receipt = await tx.wait();
    console.log("   ✅ Claim request created!");
    console.log("   Tokens will be available in 14 days");

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

    // Withdraw single claim
    console.log("\n2. Withdrawing claim", withdrawableIds[0].toString(), "...");
    const tx = await contractAsUser.withdrawClaim(withdrawableIds[0]);
    await tx.wait();
    console.log("   ✅ Tokens withdrawn!");

    // If multiple claims, batch withdraw the rest
    if (withdrawableIds.length > 1) {
      console.log("\n3. Batch withdrawing remaining claims...");
      const remainingIds = withdrawableIds.slice(1);
      const tx2 = await contractAsUser.batchWithdrawClaims(remainingIds);
      await tx2.wait();
      console.log("   ✅ Batch withdrawal complete!");
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

    console.log("\n✅ Read complete!\n");
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

  // 3. USER CLAIM (User operation)
  // await userClaimFlow();       // User initiates claim (starts 14-day vesting)

  // 4. USER WITHDRAW (User operation - after 14 days)
  await userWithdrawFlow();    // User withdraws tokens after lock period

  // 5. EMERGENCY OPERATIONS (Owner only)
  // await emergencyFunctions();  // Pause/unpause, emergency withdrawals

  // 6. VIEW CONTRACT STATE (Anyone)
  await readFunctions();       // Read contract information

  console.log("========================================\n");
}

main().catch(console.error);
