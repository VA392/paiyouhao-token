const StellarSdk = require("@stellar/stellar-sdk");

// Pi 测试网
const server = new StellarSdk.Horizon.Server("https://api.testnet.minepi.com");
const NETWORK_PASSPHRASE = "Pi Testnet";

// 代币官网域名（用于钱包发现 .well-known/stellar.toml）
const HOME_DOMAIN = "token.haoyisheng.xin";

// 私钥从环境变量读取（.env）
const issuerSecret = process.env.ISSUER_SECRET; // 高振华

function assertSecrets() {
  if (!issuerSecret) {
    throw new Error(
      "缺少私钥：请先复制 .env.example 为 .env，并填入 ISSUER_SECRET"
    );
  }
}

async function main() {
  assertSecrets();

  try {
    const issuerKeypair = StellarSdk.Keypair.fromSecret(issuerSecret);
    const sourceAccount = await server.loadAccount(issuerKeypair.publicKey());
    const response = await server.ledgers().order("desc").limit(1).call();
    const baseFee = response.records[0].base_fee_in_stroops;

    const builder = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: baseFee.toString(),
      networkPassphrase: NETWORK_PASSPHRASE,
    });

    const tx = builder
      .addOperation(
        StellarSdk.Operation.setOptions({ homeDomain: HOME_DOMAIN })
      )
      .setTimeout(180)
      .build();

    tx.sign(issuerKeypair);

    const result = await server.submitTransaction(tx);
    console.log("✅ home_domain 已设置:", HOME_DOMAIN);
    console.log("   交易哈希:", result.hash);
  } catch (e) {
    console.error("❌ 错误:", e.response?.data || e);
  }
}

main();