// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title SurfPoints
 * @notice UUPS Upgradeable contract for managing surf points and rewards
 * @dev Simplified version: Admin records points, users claim SURF tokens
 */
contract SurfPoints is
    UUPSUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;

    // ============ Structs ============

    struct ClaimRequest {
        uint256 amount;
        uint256 claimTime;
        bool withdrawn;
    }

    // ============ State Variables ============

    /// @notice The SURF token contract address
    IERC20 public surfToken;

    /// @notice Lock period for claims (in seconds, default 14 days)
    uint256 public claimLockPeriod;

    /// @notice Mapping to track admin addresses
    mapping(address => bool) public isAdmin;

    /// @notice Mapping to track user surf points balance
    mapping(address => uint256) public userSurfPoints;

    /// @notice Mapping to track claim requests: user => claimId => ClaimRequest
    mapping(address => mapping(uint256 => ClaimRequest)) public claimRequests;

    /// @notice Mapping to track number of claims per user
    mapping(address => uint256) public userClaimCount;

    /// @notice Total surf points distributed across all users
    uint256 public totalPointsDistributed;

    /// @notice Total surf tokens claimed by users
    uint256 public totalTokensClaimed;

    // ============ Storage Gap ============

    /// @dev Reserved storage space for future upgrades (48 slots)
    uint256[48] private __gap;

    // ============ Events ============

    event AdminAdded(address indexed admin);
    event AdminRemoved(address indexed admin);
    event SurfPointsRecorded(address indexed user, uint256 points, uint256 newBalance);
    event ClaimRequested(address indexed user, uint256 indexed claimId, uint256 amount, uint256 unlockTime);
    event ClaimWithdrawn(address indexed user, uint256 indexed claimId, uint256 amount);
    event ClaimLockPeriodUpdated(uint256 oldPeriod, uint256 newPeriod);
    event SurfTokenDeposited(address indexed depositor, uint256 amount);
    event SurfTokenWithdrawn(address indexed recipient, uint256 amount);
    event SurfTokenAddressUpdated(address indexed oldAddress, address indexed newAddress);
    event EmergencyWithdraw(address indexed token, address indexed recipient, uint256 amount);

    // ============ Errors ============

    error OnlyAdmin();
    error ZeroAddress();
    error ZeroAmount();
    error AlreadyAdmin();
    error NotAdmin();
    error NoPointsToClaim();
    error InsufficientContractBalance();
    error NotAuthorized();
    error InvalidClaimId();
    error ClaimStillLocked();
    error ClaimAlreadyWithdrawn();
    error InvalidLockPeriod();

    // ============ Modifiers ============

    modifier onlyAdmin() {
        if (!isAdmin[msg.sender] && msg.sender != owner()) {
            revert OnlyAdmin();
        }
        _;
    }

    // ============ Initializer ============

    /**
     * @notice Initializes the contract (replaces constructor for upgradeable contracts)
     * @param _surfToken Address of the SURF token contract
     */
    function initialize(address _surfToken) external initializer {
        if (_surfToken == address(0)) revert ZeroAddress();

        __Ownable_init(msg.sender);
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        surfToken = IERC20(_surfToken);
        claimLockPeriod = 14 days; // Default: 14 days
        isAdmin[msg.sender] = true;

        emit AdminAdded(msg.sender);
    }

    // ============ Admin Management Functions ============

    /**
     * @notice Adds a new admin address
     * @param _admin Address to grant admin privileges
     */
    function addAdmin(address _admin) external onlyOwner {
        if (_admin == address(0)) revert ZeroAddress();
        if (isAdmin[_admin]) revert AlreadyAdmin();

        isAdmin[_admin] = true;
        emit AdminAdded(_admin);
    }

    /**
     * @notice Removes an admin address
     * @param _admin Address to revoke admin privileges
     */
    function removeAdmin(address _admin) external onlyOwner {
        if (!isAdmin[_admin]) revert NotAdmin();

        isAdmin[_admin] = false;
        emit AdminRemoved(_admin);
    }

    /**
     * @notice Updates the claim lock period
     * @param _newLockPeriod New lock period in seconds
     * @dev Only owner can update. Minimum 1 day, maximum 365 days
     */
    function updateClaimLockPeriod(uint256 _newLockPeriod) external onlyOwner {
        if (_newLockPeriod < 1 days || _newLockPeriod > 365 days) {
            revert InvalidLockPeriod();
        }

        uint256 oldPeriod = claimLockPeriod;
        claimLockPeriod = _newLockPeriod;

        emit ClaimLockPeriodUpdated(oldPeriod, _newLockPeriod);
    }

    // ============ Surf Points Management Functions ============

    /**
     * @notice Records surf points for a user (only callable by admin)
     * @dev Points accumulate if the same address receives multiple records
     * @param _user Address of the user to receive points
     * @param _points Amount of surf points to add
     */
    function recordSurfPoints(address _user, uint256 _points)
        external
        onlyAdmin
        whenNotPaused
    {
        if (_user == address(0)) revert ZeroAddress();
        if (_points == 0) revert ZeroAmount();

        userSurfPoints[_user] += _points;
        totalPointsDistributed += _points;

        emit SurfPointsRecorded(_user, _points, userSurfPoints[_user]);
    }

    /**
     * @notice Records surf points for multiple users in a batch
     * @param _users Array of user addresses
     * @param _points Array of points corresponding to each user
     */
    function batchRecordSurfPoints(address[] calldata _users, uint256[] calldata _points)
        external
        onlyAdmin
        whenNotPaused
    {
        require(_users.length == _points.length, "Array length mismatch");

        for (uint256 i = 0; i < _users.length; i++) {
            if (_users[i] == address(0)) revert ZeroAddress();
            if (_points[i] == 0) revert ZeroAmount();

            userSurfPoints[_users[i]] += _points[i];
            totalPointsDistributed += _points[i];

            emit SurfPointsRecorded(_users[i], _points[i], userSurfPoints[_users[i]]);
        }
    }

    /**
     * @notice Allows users to claim their accumulated surf points
     * @dev Creates a claim request with 14-day lock period
     *      Resets user's point balance to 0
     *      Users can claim multiple times as admin adds new points
     *      Tokens can be withdrawn after 14 days using withdrawClaim()
     */
    function claimSurfPoints() external whenNotPaused nonReentrant {
        uint256 points = userSurfPoints[msg.sender];

        if (points == 0) revert NoPointsToClaim();

        uint256 contractBalance = surfToken.balanceOf(address(this));
        if (contractBalance < points) revert InsufficientContractBalance();

        // Create claim request
        uint256 claimId = userClaimCount[msg.sender];
        uint256 unlockTime = block.timestamp + claimLockPeriod;

        claimRequests[msg.sender][claimId] = ClaimRequest({
            amount: points,
            claimTime: block.timestamp,
            withdrawn: false
        });

        userClaimCount[msg.sender]++;
        userSurfPoints[msg.sender] = 0;

        emit ClaimRequested(msg.sender, claimId, points, unlockTime);
    }

    /**
     * @notice Allows users to withdraw their claimed tokens after lock period
     * @param _claimId The ID of the claim request to withdraw
     */
    function withdrawClaim(uint256 _claimId) external whenNotPaused nonReentrant {
        if (_claimId >= userClaimCount[msg.sender]) revert InvalidClaimId();

        ClaimRequest storage claim = claimRequests[msg.sender][_claimId];

        if (claim.withdrawn) revert ClaimAlreadyWithdrawn();
        if (block.timestamp < claim.claimTime + claimLockPeriod) revert ClaimStillLocked();

        uint256 amount = claim.amount;

        // Update state before transfer (Checks-Effects-Interactions pattern)
        claim.withdrawn = true;
        totalTokensClaimed += amount;

        // Transfer SURF tokens to user (1:1 ratio with points)
        surfToken.safeTransfer(msg.sender, amount);

        emit ClaimWithdrawn(msg.sender, _claimId, amount);
    }

    /**
     * @notice Allows users to withdraw multiple claims at once
     * @param _claimIds Array of claim IDs to withdraw
     */
    function batchWithdrawClaims(uint256[] calldata _claimIds) external whenNotPaused nonReentrant {
        for (uint256 i = 0; i < _claimIds.length; i++) {
            uint256 claimId = _claimIds[i];

            if (claimId >= userClaimCount[msg.sender]) continue;

            ClaimRequest storage claim = claimRequests[msg.sender][claimId];

            if (claim.withdrawn) continue;
            if (block.timestamp < claim.claimTime + claimLockPeriod) continue;

            uint256 amount = claim.amount;

            claim.withdrawn = true;
            totalTokensClaimed += amount;

            surfToken.safeTransfer(msg.sender, amount);

            emit ClaimWithdrawn(msg.sender, claimId, amount);
        }
    }

    // ============ Token Management Functions ============

    /**
     * @notice Allows owner to deposit SURF tokens into the contract
     * @param _amount Amount of SURF tokens to deposit
     */
    function depositSurfToken(uint256 _amount)
        external
        onlyOwner
        nonReentrant
    {
        if (_amount == 0) revert ZeroAmount();

        surfToken.safeTransferFrom(msg.sender, address(this), _amount);

        emit SurfTokenDeposited(msg.sender, _amount);
    }

    /**
     * @notice Allows owner to withdraw SURF tokens from the contract
     * @param _amount Amount of SURF tokens to withdraw
     */
    function withdrawSurfToken(uint256 _amount)
        external
        onlyOwner
        nonReentrant
    {
        if (_amount == 0) revert ZeroAmount();

        surfToken.safeTransfer(msg.sender, _amount);

        emit SurfTokenWithdrawn(msg.sender, _amount);
    }

    /**
     * @notice Updates the SURF token address (only owner)
     * @param _newSurfToken New SURF token contract address
     */
    function updateSurfTokenAddress(address _newSurfToken)
        external
        onlyOwner
    {
        if (_newSurfToken == address(0)) revert ZeroAddress();

        address oldAddress = address(surfToken);
        surfToken = IERC20(_newSurfToken);

        emit SurfTokenAddressUpdated(oldAddress, _newSurfToken);
    }

    // ============ Emergency Functions ============

    /**
     * @notice Emergency withdraw function for any ERC20 token (only owner)
     * @param _token Address of the token to withdraw
     * @param _amount Amount to withdraw
     */
    function emergencyWithdrawToken(address _token, uint256 _amount)
        external
        onlyOwner
        nonReentrant
    {
        if (_token == address(0)) revert ZeroAddress();
        if (_amount == 0) revert ZeroAmount();

        IERC20(_token).safeTransfer(msg.sender, _amount);

        emit EmergencyWithdraw(_token, msg.sender, _amount);
    }

    /**
     * @notice Emergency withdraw function for native ETH (only owner)
     */
    function emergencyWithdrawNative()
        external
        onlyOwner
        nonReentrant
    {
        uint256 balance = address(this).balance;
        if (balance == 0) revert ZeroAmount();

        (bool success, ) = payable(msg.sender).call{value: balance}("");
        require(success, "ETH transfer failed");

        emit EmergencyWithdraw(address(0), msg.sender, balance);
    }

    // ============ Pause Functions ============

    /**
     * @notice Pauses the contract (only owner)
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpauses the contract (only owner)
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ View Functions ============

    /**
     * @notice Gets the surf points balance for a user
     * @param _user Address of the user
     * @return Current unclaimed surf points
     */
    function getUserPoints(address _user) external view returns (uint256) {
        return userSurfPoints[_user];
    }

    /**
     * @notice Gets user information
     * @param _user Address of the user
     * @return points Current unclaimed surf points balance
     * @return claimCount Total number of claims made
     */
    function getUserInfo(address _user)
        external
        view
        returns (uint256 points, uint256 claimCount)
    {
        return (userSurfPoints[_user], userClaimCount[_user]);
    }

    /**
     * @notice Gets claim request details
     * @param _user Address of the user
     * @param _claimId ID of the claim request
     * @return amount Amount of tokens in the claim
     * @return claimTime When the claim was initiated
     * @return unlockTime When tokens can be withdrawn
     * @return withdrawn Whether tokens have been withdrawn
     * @return canWithdraw Whether the claim can be withdrawn now
     */
    function getClaimInfo(address _user, uint256 _claimId)
        external
        view
        returns (
            uint256 amount,
            uint256 claimTime,
            uint256 unlockTime,
            bool withdrawn,
            bool canWithdraw
        )
    {
        ClaimRequest memory claim = claimRequests[_user][_claimId];
        unlockTime = claim.claimTime + claimLockPeriod;
        canWithdraw = !claim.withdrawn && block.timestamp >= unlockTime;

        return (
            claim.amount,
            claim.claimTime,
            unlockTime,
            claim.withdrawn,
            canWithdraw
        );
    }

    /**
     * @notice Gets all pending (not withdrawn) claim requests for a user
     * @param _user Address of the user
     * @return claimIds Array of claim IDs
     * @return amounts Array of token amounts
     * @return unlockTimes Array of unlock timestamps
     * @return canWithdraw Array of withdrawal eligibility
     */
    function getPendingClaims(address _user)
        external
        view
        returns (
            uint256[] memory claimIds,
            uint256[] memory amounts,
            uint256[] memory unlockTimes,
            bool[] memory canWithdraw
        )
    {
        uint256 count = userClaimCount[_user];
        uint256 pendingCount = 0;

        // Count pending claims
        for (uint256 i = 0; i < count; i++) {
            if (!claimRequests[_user][i].withdrawn) {
                pendingCount++;
            }
        }

        // Populate arrays
        claimIds = new uint256[](pendingCount);
        amounts = new uint256[](pendingCount);
        unlockTimes = new uint256[](pendingCount);
        canWithdraw = new bool[](pendingCount);

        uint256 index = 0;
        for (uint256 i = 0; i < count; i++) {
            ClaimRequest memory claim = claimRequests[_user][i];
            if (!claim.withdrawn) {
                claimIds[index] = i;
                amounts[index] = claim.amount;
                unlockTimes[index] = claim.claimTime + claimLockPeriod;
                canWithdraw[index] = block.timestamp >= unlockTimes[index];
                index++;
            }
        }

        return (claimIds, amounts, unlockTimes, canWithdraw);
    }

    /**
     * @notice Gets all withdrawable claim IDs for a user
     * @param _user Address of the user
     * @return Array of claim IDs that can be withdrawn now
     */
    function getWithdrawableClaims(address _user)
        external
        view
        returns (uint256[] memory)
    {
        uint256 count = userClaimCount[_user];
        uint256 withdrawableCount = 0;

        // Count withdrawable claims
        for (uint256 i = 0; i < count; i++) {
            ClaimRequest memory claim = claimRequests[_user][i];
            if (!claim.withdrawn && block.timestamp >= claim.claimTime + claimLockPeriod) {
                withdrawableCount++;
            }
        }

        // Populate array
        uint256[] memory withdrawableIds = new uint256[](withdrawableCount);
        uint256 index = 0;

        for (uint256 i = 0; i < count; i++) {
            ClaimRequest memory claim = claimRequests[_user][i];
            if (!claim.withdrawn && block.timestamp >= claim.claimTime + claimLockPeriod) {
                withdrawableIds[index] = i;
                index++;
            }
        }

        return withdrawableIds;
    }

    /**
     * @notice Gets the SURF token balance of the contract
     * @return Current SURF token balance available for claims
     */
    function getContractBalance() external view returns (uint256) {
        return surfToken.balanceOf(address(this));
    }

    /**
     * @notice Gets contract statistics
     * @return totalDistributed Total points distributed to users
     * @return totalClaimed Total tokens claimed by users
     * @return contractBalance Current SURF token balance in contract
     */
    function getContractStats()
        external
        view
        returns (
            uint256 totalDistributed,
            uint256 totalClaimed,
            uint256 contractBalance
        )
    {
        return (
            totalPointsDistributed,
            totalTokensClaimed,
            surfToken.balanceOf(address(this))
        );
    }

    // ============ UUPS Upgrade Authorization ============

    /**
     * @notice Authorizes contract upgrades (only owner can upgrade)
     * @param newImplementation Address of the new implementation contract
     */
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}

    /**
     * @notice Returns the current implementation version
     * @return Version string
     */
    function version() external pure returns (string memory) {
        return "1.0.0";
    }

    // ============ Receive Function ============

    /**
     * @notice Allows the contract to receive native ETH
     */
    receive() external payable {}
}
