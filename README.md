## Cashmere TESTNET BOT

*A terminal-based dashboard for automating USDC bridging via Cashmere CCTP between Ethereum Sepolia and Layer 2 testnets (Optimism, Arbitrum, Base, Unichain).
It comes with a real-time interactive UI, transaction logs, token balance tracking, and automated transaction handling with EIP-2612 permits.*

**✨ Features**
Menu-driven workflow:
- Sepolia → L2 (Optimism, Arbitrum, Base, Unichain)
- L2 → Sepolia
- Random Destination (Sepolia ↔ L2 in each round)
- Real-time wallet & token balance updates.

## Transaction logging with colored tags:
**[SEND]** source → destination
**[INFO]** details (amount, recipient, balances)
**[GAS]** gas fees and msg.value
**[PENDING]** pending transaction hash
**[SUCCESS]** confirmed transaction with explorer link
**[ERROR]** or **[FAILED]** if transaction reverts

Countdown delays with on-screen timers.
Automatic signing of transferV2WithPermit and USDC permit messages.
Full sync with Cashmere CCTP contracts for cross-chain USDC transfers.

**🔧 Requirements**
Node.js v18+
npm or yarn
A funded Ethereum Sepolia wallet with USDC test tokens

## Full Tutorial Join Telegram Channel : https://t.me/invictuslabs
<img width="1471" height="816" alt="Screenshot (235)" src="https://github.com/user-attachments/assets/b88c7a1f-cc97-4ef4-91f9-7c6fc750972d" />
