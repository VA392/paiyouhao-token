const StellarSdk = require("@stellar/stellar-sdk");

// Pi 测试网
const server = new StellarSdk.Horizon.Server("https://api.testnet.minepi.com");
const NETWORK_PASSPHRASE = "Pi Testnet";

// 私钥从环境变量读取（见 .env，参考 .env.example），绝不硬编码到代码里
const issuerSecret = process.env.ISSUER_SECRET; // 高振华
const distributorSecret = process.env.DISTRIBUTOR_SECRET; // 春燕

// 公钥是公开信息，可放心放在代码里
const issuerPublic = "GD7RUMSLWDZSDKB53R63MO25GYG7FNEJAK7L7UJNMZ4ESJOIU6AXX3NM"; // 高振华
const distributorPublic = "GDILQFNNC7K4LL2Z4WOONYYQ27KKJ3KKBMHSDYKAVHNPSOOQZC5XULTJ"; // 春燕

// 代币代码（<= 12 位字母数字）
const ASSET_CODE = "paiyouhao";
// 首次发行数量（<= 922337203685.4775807）
const ISSUE_AMOUNT = "1000000";

function assertSecrets() {
  if (!issuerSecret || !distributorSecret) {
    throw new Error(
      "缺少私钥：请先复制 .env.example 为 .env，并填入 ISSUER_SECRET / DISTRIBUTOR_SECRET"
    );
  }
}

// 通用构建 + 签名 + 提交
async function submitTx(sourceKeypair, operations) {
  const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());
  const response = await server.ledgers().order("desc").limit(1).call();
  const baseFee = response.records[0].base_fee_in_stroops;

  const builder = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: baseFee.toString(),
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  operations.forEach((op) => builder.addOperation(op));

  const tx = builder.setTimeout(180).build();
  tx.sign(sourceKeypair);

  const result = await server.submitTransaction(tx);
  return result.hash;
}

async function main() {
  assertSecrets();

  try {
    const issuerKeypair = StellarSdk.Keypair.fromSecret(issuerSecret);
    const distributorKeypair = StellarSdk.Keypair.fromSecret(distributorSecret);

    const asset = new StellarSdk.Asset(ASSET_CODE, issuerPublic);

    // 1. 发行者设置授权标志（需要授权才可持有/交易）
    console.log("① 发行者设置 AUTH_REQUIRED 授权标志...");
    await submitTx(issuerKeypair, [
      StellarSdk.Operation.setOptions({
        setFlags: StellarSdk.AuthRequiredFlag | StellarSdk.AuthRevocableFlag,
      }),
    ]);
    console.log("✅ 发行者已设置授权标志");

    // 2. 分发者创建信任线
    console.log("② 分发者创建信任线...");
    await submitTx(distributorKeypair, [
      StellarSdk.Operation.changeTrust({ asset }),
    ]);
    console.log(`✅ ${ASSET_CODE} 信任线已创建`);

    // 3. 发行者授权分发者的信任线
    console.log("③ 发行者授权信任线...");
    await submitTx(issuerKeypair, [
      StellarSdk.Operation.allowTrust({
        trustor: distributorPublic,
        assetCode: ASSET_CODE,
        authorize: 1,
      }),
    ]);
    console.log("✅ 信任线已授权");

    // 4. 发行者向分发者发币（铸造）
    console.log("④ 发行者向分发者发币...");
    const hash = await submitTx(issuerKeypair, [
      StellarSdk.Operation.payment({
        destination: distributorPublic,
        asset,
        amount: ISSUE_AMOUNT,
      }),
    ]);
    console.log(`✅ 发币成功！交易哈希: ${hash}`);
  } catch (e) {
    console.error("❌ 错误:", e.response?.data || e);
  }
}

main();