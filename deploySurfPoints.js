// deploySurfPoints.js
const { ethers, upgrades } = require("hardhat");

/**
 * Deployment script for UUPS upgradeable SurfPoints contract
 *
 * Prerequisites:
 * 1. Install dependencies: npm install @openzeppelin/hardhat-upgrades
 * 2. Configure hardhat.config.js with your network settings
 * 3. Set SURF_TOKEN_ADDRESS in this script
 */

async function main() {
  console.log("Starting SurfPoints UUPS deployment...\n");

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString(), "\n");

  // CONFIGURATION: Set your SURF token address here
  const SURF_TOKEN_ADDRESS = "0xYourSurfTokenAddressHere"; // CHANGE THIS

  if (SURF_TOKEN_ADDRESS === "0xYourSurfTokenAddressHere") {
    throw new Error("Please set SURF_TOKEN_ADDRESS in the deployment script");
  }

  // Get the SurfPoints contract factory
  const SurfPoints = await ethers.getContractFactory("SurfPoints");

  console.log("Deploying SurfPoints proxy...");

  // Deploy the UUPS upgradeable proxy
  const surfPoints = await upgrades.deployProxy(
    SurfPoints,
    [SURF_TOKEN_ADDRESS], // Initialize with SURF token address
    {
      kind: "uups",
      initializer: "initialize",
    }
  );

  await surfPoints.waitForDeployment();
  const proxyAddress = await surfPoints.getAddress();

  console.log("\n========================================");
  console.log("Deployment successful!");
  console.log("========================================");
  console.log("SurfPoints Proxy Address:", proxyAddress);
  console.log("SURF Token Address:", SURF_TOKEN_ADDRESS);
  console.log("Deployer (Owner & Admin):", deployer.address);
  console.log("========================================\n");

  // Verify deployment
  console.log("Verifying deployment...");
  const owner = await surfPoints.owner();
  const isAdmin = await surfPoints.isAdmin(deployer.address);
  const surfToken = await surfPoints.surfToken();
  const version = await surfPoints.version();

  console.log("Contract Owner:", owner);
  console.log("Deployer is Admin:", isAdmin);
  console.log("SURF Token configured:", surfToken);
  console.log("Contract Version:", version);
  console.log("\nDeployment verification complete!\n");

  // Save deployment info
  const fs = require("fs");
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    proxyAddress: proxyAddress,
    surfTokenAddress: SURF_TOKEN_ADDRESS,
    owner: deployer.address,
    deploymentTime: new Date().toISOString(),
    version: version,
  };

  fs.writeFileSync(
    "surfpoints-deployment.json",
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("Deployment info saved to surfpoints-deployment.json\n");

  // Next steps
  console.log("========================================");
  console.log("NEXT STEPS:");
  console.log("========================================");
  console.log("1. Approve the contract to spend SURF tokens:");
  console.log("   surfToken.approve(proxyAddress, amount)");
  console.log("\n2. Deposit SURF tokens to the contract:");
  console.log("   surfPoints.depositSurfToken(amount)");
  console.log("\n3. Add additional admins if needed:");
  console.log("   surfPoints.addAdmin(adminAddress)");
  console.log("\n4. Start recording surf points:");
  console.log("   surfPoints.recordSurfPoints(userAddress, points)");
  console.log("========================================\n");

  return proxyAddress;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
