import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

console.log("\n🔑 New wallet generated — save these securely!\n");
console.log(`PRIVATE_KEY=${privateKey}`);
console.log(`WALLET_ADDRESS=${account.address}`);
console.log("\n⚠️  Never share your PRIVATE_KEY. Share only WALLET_ADDRESS with the hackathon organizers for funding.\n");
